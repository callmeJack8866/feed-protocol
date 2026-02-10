import prisma from '../config/database';
import { calculateReward, updateFeederRank, updateFeederStats } from './rank.service';
import { detectAndUnlockAchievements } from './achievement-detection.service';
import { evaluateAndExecutePenalty } from './penalty.service';

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
