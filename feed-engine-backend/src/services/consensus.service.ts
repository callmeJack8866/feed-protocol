import { ethers } from 'ethers';
import prisma from '../config/database';
import { calculateReward, updateFeederRank, updateFeederStats } from './rank.service';
import { detectAndUnlockAchievements } from './achievement-detection.service';
import { evaluateAndExecutePenalty } from './penalty.service';
import { getFeedConsensusContract, getRewardPenaltyContract, getNstOptionsCoreContract } from './blockchain.service';
import { sendConsensusCallback, buildCallbackPayload } from './nst-callback.service';

/**
 * 共识计算服务
 */

interface ConsensusResult {
    consensusPrice: number;
    deviations: { feederId: string; deviation: number; reward: number; xp: number }[];
    isValid: boolean;
}

/**
 * 计算共识价格（中位数）
 */
export function calculateMedianPrice(prices: number[]): number {
    if (prices.length === 0) return 0;

    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

/**
 * 去掉最高最低后计算平均值
 */
export function calculateTrimmedMean(prices: number[]): number {
    if (prices.length <= 2) return calculateMedianPrice(prices);

    const sorted = [...prices].sort((a, b) => a - b);
    // 去掉最高和最低
    const trimmed = sorted.slice(1, -1);

    const sum = trimmed.reduce((acc, p) => acc + p, 0);
    return sum / trimmed.length;
}

/**
 * 去掉最高最低后计算中位数
 */
export function calculateTrimmedMedian(prices: number[]): number {
    if (prices.length <= 2) return calculateMedianPrice(prices);

    const sorted = [...prices].sort((a, b) => a - b);
    // 去掉最高和最低
    const trimmed = sorted.slice(1, -1);

    return calculateMedianPrice(trimmed);
}

/**
 * 共识算法类型
 */
export type ConsensusAlgorithm = 'MEDIAN' | 'TRIMMED_MEAN' | 'TRIMMED_MEDIAN';

/**
 * 根据名义本金选择共识算法
 * <10万: 中位数
 * 10-100万: 中位数
 * 100-500万: 去掉最高最低后平均
 * >500万: 去掉最高最低后中位数
 */
export function selectConsensusAlgorithm(notionalAmount: number): ConsensusAlgorithm {
    if (notionalAmount >= 5000000) return 'TRIMMED_MEDIAN';
    if (notionalAmount >= 1000000) return 'TRIMMED_MEAN';
    return 'MEDIAN';
}

/**
 * 获取共识喂价员数量要求
 */
export function getRequiredFeeders(notionalAmount: number): { count: number; threshold: string } {
    if (notionalAmount >= 5000000) return { count: 10, threshold: '7/10' };
    if (notionalAmount >= 1000000) return { count: 7, threshold: '5/7' };
    if (notionalAmount >= 100000) return { count: 5, threshold: '3/5' };
    return { count: 3, threshold: '2/3' };
}

/**
 * 计算共识价格（根据算法类型）
 */
export function calculateConsensusPrice(prices: number[], algorithm: ConsensusAlgorithm): number {
    switch (algorithm) {
        case 'TRIMMED_MEAN':
            return calculateTrimmedMean(prices);
        case 'TRIMMED_MEDIAN':
            return calculateTrimmedMedian(prices);
        case 'MEDIAN':
        default:
            return calculateMedianPrice(prices);
    }
}

/**
 * 计算偏差百分比
 */
export function calculateDeviation(price: number, consensusPrice: number): number {
    if (consensusPrice === 0) return 0;
    return Math.abs((price - consensusPrice) / consensusPrice) * 100;
}

/**
 * 处理订单共识
 */
export async function processOrderConsensus(orderId: string): Promise<ConsensusResult | null> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            submissions: {
                where: { revealedPrice: { not: null } }
            }
        }
    });

    if (!order) {
        throw new Error('Order not found');
    }

    // 检查是否所有人都已揭示价格
    if (order.submissions.length < order.requiredFeeders) {
        return null;
    }

    const allRevealed = order.submissions.every(s => s.revealedPrice !== null);
    if (!allRevealed) {
        return null;
    }

    // 获取所有价格
    const prices = order.submissions.map(s => s.revealedPrice!);

    // 根据名义本金选择算法
    const algorithm = selectConsensusAlgorithm(order.notionalAmount);
    const consensusPrice = calculateConsensusPrice(prices, algorithm);

    // 计算每个喂价员的偏差和奖励
    const deviations: ConsensusResult['deviations'] = [];

    for (const submission of order.submissions) {
        const deviation = calculateDeviation(submission.revealedPrice!, consensusPrice);

        // 获取喂价员信息
        const feeder = await prisma.feeder.findUnique({
            where: { id: submission.feederId }
        });

        if (!feeder) continue;

        // 计算奖励
        const rewardResult = calculateReward(order.rewardAmount / order.requiredFeeders, deviation, feeder.rank);

        // 更新提交记录
        await prisma.priceSubmission.update({
            where: { id: submission.id },
            data: {
                deviation,
                rewardEarned: rewardResult.reward,
                xpEarned: rewardResult.xp
            }
        });

        // 更新喂价员状态
        await updateFeederRank(submission.feederId, rewardResult.xp);
        await updateFeederStats(submission.feederId, deviation);

        // 惩罚检测：偏差超过1%时触发分级惩罚
        if (deviation > 1.0) {
            evaluateAndExecutePenalty(submission.feederId, deviation, orderId).catch(err => {
                console.error(`Penalty execution error for feeder ${submission.feederId}:`, err);
            });
        }

        // 记录历史
        await prisma.feedHistory.create({
            data: {
                feederId: submission.feederId,
                orderId: order.id,
                symbol: order.symbol,
                market: order.market,
                price: submission.revealedPrice!,
                deviation,
                reward: rewardResult.reward,
                xpEarned: rewardResult.xp
            }
        });

        // 更新每日任务
        await updateDailyTask(submission.feederId);

        // 检测并解锁成就（异步执行，不阻塞主流程）
        detectAndUnlockAchievements(submission.feederId).catch(err => {
            console.error('Achievement detection error:', err);
        });

        deviations.push({
            feederId: submission.feederId,
            deviation,
            reward: rewardResult.reward,
            xp: rewardResult.xp
        });
    }

    // 更新订单状态
    await prisma.order.update({
        where: { id: orderId },
        data: {
            status: 'SETTLED',
            finalPrice: consensusPrice,
            settledAt: new Date()
        }
    });

    // ============================
    // NST 协议回调：共识价格通知
    // ============================
    if (order.callbackUrl) {
        const payload = buildCallbackPayload(order, consensusPrice, deviations);
        if (payload) {
            sendConsensusCallback(order.callbackUrl, payload).catch(err => {
                console.error(`⚠️ NST callback failed for order ${orderId}:`, err);
            });
        }
    }

    // ============================
    // NST 链上回写：调用 OptionsCore.processFeedCallback()
    // ============================
    if ((order as any).sourceProtocol === 'NST' && (order as any).externalRequestId) {
        writebackToNstContract((order as any).externalRequestId, consensusPrice).catch((err: any) => {
            console.error(`⚠️ NST on-chain writeback failed for order ${orderId}:`, err);
        });
    }

    // ============================
    // 链上同步：共识提交 + 奖励分配 (70/10/10/10)
    // ============================
    distributeRewardsOnChain(orderId, order, deviations, consensusPrice).catch(err => {
        console.error(`⚠️ Chain reward distribution failed for order ${orderId}:`, err);
    });

    return {
        consensusPrice,
        deviations,
        isValid: true
    };
}

/**
 * 更新每日任务进度
 */
async function updateDailyTask(feederId: string): Promise<void> {
    const today = new Date(new Date().toDateString());

    const task = await prisma.dailyTask.upsert({
        where: {
            feederId_date: { feederId, date: today }
        },
        create: {
            feederId,
            date: today,
            feedCount: 1,
            target1: true
        },
        update: {
            feedCount: { increment: 1 }
        }
    });

    // 检查任务完成情况
    const updates: any = {};
    if (task.feedCount >= 1 && !task.target1) updates.target1 = true;
    if (task.feedCount >= 3 && !task.target3) updates.target3 = true;
    if (task.feedCount >= 5 && !task.target5) updates.target5 = true;

    if (Object.keys(updates).length > 0) {
        await prisma.dailyTask.update({
            where: { id: task.id },
            data: updates
        });
    }
}

/**
 * 链上同步：共识提交 + 奖励分配 (70/10/10/10)
 *
 * 流程:
 * 1. FeedConsensus.submitConsensus(orderId, consensusPrice) — 提交共识价格
 * 2. FeedConsensus.settleOrder(orderId) — 结算订单
 * 3. RewardPenalty.distributeRewards(orderId, feeders[], totalReward) — 链上分配
 *
 * 链上 RewardPenalty 合约将自动按 70/10/10/10 比例分配:
 *   70% → 喂价员  |  10% → 平台  |  10% → DAO  |  10% → 销毁
 *
 * @param orderId 数据库订单 ID
 * @param order 订单对象(含 submissions)
 * @param deviations 喂价员偏差结果
 * @param consensusPrice 共识价格
 */
async function distributeRewardsOnChain(
    orderId: string,
    order: any,
    deviations: { feederId: string; deviation: number; reward: number; xp: number }[],
    consensusPrice: number
): Promise<void> {
    const consensusContract = getFeedConsensusContract();
    const rewardContract = getRewardPenaltyContract();

    if (!consensusContract || !rewardContract) {
        console.warn('⚠️ Chain contracts not available, skipping on-chain distribution');
        return;
    }

    const orderIdBytes32 = ethers.id(orderId);

    try {
        // 1. 提交共识价格到 FeedConsensus
        const priceWei = ethers.parseUnits(consensusPrice.toFixed(8), 8);
        const submitTx = await consensusContract.submitConsensus(orderIdBytes32, priceWei);
        await submitTx.wait();
        console.log(`✅ Consensus submitted on-chain: order=${orderId}, price=${consensusPrice}`);

        // 2. 结算订单
        const settleTx = await consensusContract.settleOrder(orderIdBytes32);
        await settleTx.wait();
        console.log(`✅ Order settled on-chain: ${orderId}`);

    } catch (error) {
        console.error(`⚠️ FeedConsensus chain sync failed (non-fatal):`, error);
        // 链上共识提交失败不阻塞奖励分配
    }

    try {
        // 3. 收集喂价员地址列表
        const feederAddresses: string[] = [];
        for (const d of deviations) {
            const feeder = await prisma.feeder.findUnique({
                where: { id: d.feederId },
                select: { address: true }
            });
            if (feeder) {
                feederAddresses.push(feeder.address);
            }
        }

        if (feederAddresses.length === 0) {
            console.warn('⚠️ No feeder addresses found, skipping on-chain distribution');
            return;
        }

        // 4. 调用 RewardPenalty.distributeRewards() 做链上 70/10/10/10 分配
        const totalRewardWei = ethers.parseUnits(order.rewardAmount.toString(), 18);
        const distributeTx = await rewardContract.distributeRewards(
            orderIdBytes32,
            feederAddresses,
            totalRewardWei
        );
        const receipt = await distributeTx.wait();
        console.log(`✅ Rewards distributed on-chain: order=${orderId}, feeders=${feederAddresses.length}, tx=${receipt.hash}`);

        // 5. 更新数据库记录链上交易哈希
        await prisma.order.update({
            where: { id: orderId },
            data: { txHash: receipt.hash }
        });

    } catch (error) {
        console.error(`⚠️ RewardPenalty distribution failed (non-fatal):`, error);
        // 链上分配失败不影响数据库已完成的结算
    }
}

/**
 * NST 链上回写：将共识价格通过 FeedProtocol.submitFeed 写回 NST
 *
 * 流程: FeedProtocol.submitFeed(requestId, price)
 *   → FeedProtocol.finalizeFeed() (自动)
 *   → OptionsCore.processFeedCallback() (自动回调)
 *
 * 使用 NST_FEED_SUBMITTER_PRIVATE_KEY 配置的 EOA 钱包签名交易
 * 该钱包必须在 FeedProtocol 合约上注册为活跃喂价员
 *
 * @param nstRequestId NST FeedProtocol 的 requestId
 * @param consensusPrice 共识价格（浮点数）
 */
async function writebackToNstContract(
    nstRequestId: string,
    consensusPrice: number
): Promise<void> {
    const feedProtocolAddress = process.env.NST_FEED_PROTOCOL_CONTRACT;
    const submitterKey = process.env.NST_FEED_SUBMITTER_PRIVATE_KEY;
    const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com';

    if (!feedProtocolAddress) {
        console.warn('⚠️ NST FeedProtocol address not configured, skipping writeback');
        return;
    }
    if (!submitterKey) {
        console.warn('⚠️ NST_FEED_SUBMITTER_PRIVATE_KEY not configured, skipping writeback');
        return;
    }

    // submitFeed ABI
    const FEED_PROTOCOL_ABI = [
        'function submitFeed(uint256 requestId, uint256 price) external',
    ];

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(submitterKey, provider);
        const feedProtocol = new ethers.Contract(feedProtocolAddress, FEED_PROTOCOL_ABI, wallet);

        // NST 使用 18 decimals 精度
        const priceWei = ethers.parseUnits(consensusPrice.toFixed(8), 18);

        console.log(`🔗 [NST Writeback] requestId=${nstRequestId}, price=${consensusPrice}, submitter=${wallet.address}`);

        const tx = await feedProtocol.submitFeed(
            BigInt(nstRequestId),
            priceWei
        );
        const receipt = await tx.wait();

        console.log(`✅ [NST Writeback] FeedProtocol.submitFeed success! tx=${receipt.hash}`);
    } catch (error: any) {
        console.error(`❌ [NST Writeback] Failed:`, error?.reason || error?.message || error);
        throw error;
    }
}

