import { ethers } from 'ethers';
import prisma from '../config/database';
import { io } from '../index';
import { CONTRACT_ADDRESSES } from './blockchain.service';

/**
 * 链上事件监听服务
 * 
 * 监听 5 个已部署合约的链上事件，同步到数据库并广播给前端：
 * - FEEDToken:      Transfer 事件
 * - FeederLicense:  LicenseMinted / Transfer 事件
 * - FeedConsensus:  OrderCreated / PriceCommitted / PriceRevealed / ConsensusSubmitted / OrderSettled 事件
 * - RewardPenalty:  RewardsDistributed / RewardsClaimed / PenaltyApplied / FeederBanned 事件
 * - FeedEngine:     FeederRegistered / Staked / UnstakeRequested / Withdrawn / OrderGrabbed / XPAwarded / RankUpgraded 事件
 */

let provider: ethers.JsonRpcProvider | null = null;
let contracts: Record<string, ethers.Contract> = {};

// ============ ABI 定义（仅事件部分） ============

const FEED_TOKEN_EVENTS = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const FEEDER_LICENSE_EVENTS = [
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    'event LicenseMinted(uint256 indexed tokenId, address indexed to, uint8 licenseType)',
];

const FEED_CONSENSUS_EVENTS = [
    'event OrderCreated(bytes32 indexed orderId, string symbol, uint256 notionalAmount, uint256 quorum)',
    'event PriceCommitted(bytes32 indexed orderId, address indexed feeder)',
    'event PriceRevealed(bytes32 indexed orderId, address indexed feeder, uint256 price)',
    'event ConsensusSubmitted(bytes32 indexed orderId, uint256 consensusPrice)',
    'event OrderSettled(bytes32 indexed orderId)',
];

const REWARD_PENALTY_EVENTS = [
    'event RewardsDistributed(bytes32 indexed orderId, uint256 totalReward)',
    'event RewardsClaimed(address indexed feeder, uint256 amount)',
    'event PenaltyApplied(address indexed feeder, uint8 level, string reason, uint256 slashAmount)',
    'event FeederBanned(address indexed feeder)',
];

const FEED_ENGINE_EVENTS = [
    'event FeederRegistered(address indexed feeder, uint256 stakeAmount, uint256 licenseTokenId)',
    'event Staked(address indexed feeder, uint256 amount)',
    'event UnstakeRequested(address indexed feeder, uint256 unlockTime)',
    'event Withdrawn(address indexed feeder, uint256 amount)',
    'event OrderGrabbed(bytes32 indexed orderId, address indexed feeder)',
    'event XPAwarded(address indexed feeder, uint256 amount, string reason)',
    'event RankUpgraded(address indexed feeder, uint8 newRank)',
];

/**
 * 初始化事件监听
 */
export function initEventListener(): void {
    const rpcUrl = process.env.NODE_ENV === 'production'
        ? process.env.BSC_RPC_URL
        : (process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com');

    if (!rpcUrl) {
        console.warn('⚠️ Event listener: RPC URL not configured');
        return;
    }

    try {
        provider = new ethers.JsonRpcProvider(rpcUrl);

        // 初始化 5 个合约实例
        contracts.feedConsensus = new ethers.Contract(
            CONTRACT_ADDRESSES.FEED_CONSENSUS, FEED_CONSENSUS_EVENTS, provider
        );
        contracts.rewardPenalty = new ethers.Contract(
            CONTRACT_ADDRESSES.REWARD_PENALTY, REWARD_PENALTY_EVENTS, provider
        );
        contracts.feedEngine = new ethers.Contract(
            CONTRACT_ADDRESSES.FEED_ENGINE, FEED_ENGINE_EVENTS, provider
        );
        contracts.feederLicense = new ethers.Contract(
            CONTRACT_ADDRESSES.FEEDER_LICENSE, FEEDER_LICENSE_EVENTS, provider
        );
        contracts.feedToken = new ethers.Contract(
            CONTRACT_ADDRESSES.FEED_TOKEN, FEED_TOKEN_EVENTS, provider
        );

        // 设置监听器
        setupFeedConsensusListeners();
        setupRewardPenaltyListeners();
        setupFeedEngineListeners();
        setupFeederLicenseListeners();

        console.log('📡 Event listeners started for all 5 contracts');
        Object.entries(CONTRACT_ADDRESSES).forEach(([name, addr]) => {
            console.log(`   ${name}: ${addr}`);
        });

    } catch (error) {
        console.error('❌ Failed to initialize event listener:', error);
    }
}

// ============ FeedConsensus 事件 ============

function setupFeedConsensusListeners(): void {
    const c = contracts.feedConsensus;
    if (!c) return;

    /** 价格已提交 (Commit 阶段) */
    c.on('PriceCommitted', async (orderId: string, feeder: string, event: any) => {
        console.log(`📥 PriceCommitted: order=${orderId}, feeder=${feeder}`);
        try {
            await prisma.priceSubmission.updateMany({
                where: {
                    order: { txHash: orderId },
                    feeder: { address: feeder.toLowerCase() }
                },
                data: {
                    commitTxHash: event.log.transactionHash,
                    committedAt: new Date()
                }
            });
            io.emit('chain:priceCommitted', { orderId, feeder, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling PriceCommitted:', error);
        }
    });

    /** 价格已揭示 (Reveal 阶段) */
    c.on('PriceRevealed', async (orderId: string, feeder: string, price: bigint, event: any) => {
        console.log(`📥 PriceRevealed: order=${orderId}, feeder=${feeder}, price=${price}`);
        try {
            const priceValue = parseFloat(ethers.formatUnits(price, 8));
            await prisma.priceSubmission.updateMany({
                where: {
                    order: { txHash: orderId },
                    feeder: { address: feeder.toLowerCase() }
                },
                data: {
                    revealedPrice: priceValue,
                    revealTxHash: event.log.transactionHash,
                    revealedAt: new Date()
                }
            });
            io.emit('chain:priceRevealed', { orderId, feeder, price: priceValue, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling PriceRevealed:', error);
        }
    });

    /** 共识价格已提交 */
    c.on('ConsensusSubmitted', async (orderId: string, consensusPrice: bigint, event: any) => {
        console.log(`📥 ConsensusSubmitted: order=${orderId}, price=${consensusPrice}`);
        try {
            const priceValue = parseFloat(ethers.formatUnits(consensusPrice, 8));
            io.emit('chain:consensusSubmitted', { orderId, consensusPrice: priceValue, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling ConsensusSubmitted:', error);
        }
    });

    /** 订单已结算 */
    c.on('OrderSettled', async (orderId: string, event: any) => {
        console.log(`📥 OrderSettled: order=${orderId}`);
        try {
            io.emit('chain:orderSettled', { orderId, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling OrderSettled:', error);
        }
    });
}

// ============ RewardPenalty 事件 ============

function setupRewardPenaltyListeners(): void {
    const c = contracts.rewardPenalty;
    if (!c) return;

    /** 奖励已分配 (70/10/10/10) */
    c.on('RewardsDistributed', async (orderId: string, totalReward: bigint, event: any) => {
        console.log(`📥 RewardsDistributed: order=${orderId}, total=${ethers.formatUnits(totalReward, 18)} FEED`);
        try {
            io.emit('chain:rewardsDistributed', {
                orderId,
                totalReward: ethers.formatUnits(totalReward, 18),
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling RewardsDistributed:', error);
        }
    });

    /** 喂价员领取奖励 */
    c.on('RewardsClaimed', async (feeder: string, amount: bigint, event: any) => {
        console.log(`📥 RewardsClaimed: feeder=${feeder}, amount=${ethers.formatUnits(amount, 18)}`);
        try {
            const feederRecord = await prisma.feeder.findFirst({
                where: { address: feeder.toLowerCase() }
            });
            if (feederRecord) {
                await prisma.feeder.update({
                    where: { id: feederRecord.id },
                    data: { totalEarned: { increment: parseFloat(ethers.formatUnits(amount, 18)) } }
                });
            }
            io.emit('chain:rewardsClaimed', {
                feeder,
                amount: ethers.formatUnits(amount, 18),
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling RewardsClaimed:', error);
        }
    });

    /** 惩罚已执行 */
    c.on('PenaltyApplied', async (feeder: string, level: number, reason: string, slashAmount: bigint, event: any) => {
        console.log(`📥 PenaltyApplied: feeder=${feeder}, level=${level}, slash=${ethers.formatUnits(slashAmount, 18)}`);
        try {
            io.emit('chain:penaltyApplied', {
                feeder,
                level,
                reason,
                slashAmount: ethers.formatUnits(slashAmount, 18),
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling PenaltyApplied:', error);
        }
    });

    /** 喂价员被永久封禁 */
    c.on('FeederBanned', async (feeder: string, event: any) => {
        console.log(`📥 FeederBanned: feeder=${feeder}`);
        try {
            const feederRecord = await prisma.feeder.findFirst({
                where: { address: feeder.toLowerCase() }
            });
            if (feederRecord) {
                await prisma.feeder.update({
                    where: { id: feederRecord.id },
                    data: { status: 'BANNED' }
                });
            }
            io.emit('chain:feederBanned', { feeder, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling FeederBanned:', error);
        }
    });
}

// ============ FeedEngine 事件 ============

function setupFeedEngineListeners(): void {
    const c = contracts.feedEngine;
    if (!c) return;

    /** 喂价员注册 */
    c.on('FeederRegistered', async (feeder: string, stakeAmount: bigint, licenseTokenId: bigint, event: any) => {
        console.log(`📥 FeederRegistered: feeder=${feeder}, stake=${ethers.formatUnits(stakeAmount, 18)}`);
        try {
            io.emit('chain:feederRegistered', {
                feeder,
                stakeAmount: ethers.formatUnits(stakeAmount, 18),
                licenseTokenId: licenseTokenId.toString(),
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling FeederRegistered:', error);
        }
    });

    /** 质押 */
    c.on('Staked', async (feeder: string, amount: bigint, event: any) => {
        console.log(`📥 Staked: feeder=${feeder}, amount=${ethers.formatUnits(amount, 18)}`);
        try {
            const amountValue = parseFloat(ethers.formatUnits(amount, 18));
            const feederRecord = await prisma.feeder.findFirst({
                where: { address: feeder.toLowerCase() }
            });

            if (feederRecord) {
                await prisma.stakeRecord.create({
                    data: {
                        feederId: feederRecord.id,
                        stakeType: 'FEED',
                        amount: amountValue,
                        txHash: event.log.transactionHash,
                        blockNumber: event.log.blockNumber,
                        status: 'ACTIVE'
                    }
                });
                await prisma.feeder.update({
                    where: { id: feederRecord.id },
                    data: { stakedAmount: { increment: amountValue } }
                });
            }
            io.emit('chain:staked', { feeder, amount: amountValue, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling Staked:', error);
        }
    });

    /** 提取 */
    c.on('Withdrawn', async (feeder: string, amount: bigint, event: any) => {
        console.log(`📥 Withdrawn: feeder=${feeder}, amount=${ethers.formatUnits(amount, 18)}`);
        try {
            const amountValue = parseFloat(ethers.formatUnits(amount, 18));
            const feederRecord = await prisma.feeder.findFirst({
                where: { address: feeder.toLowerCase() }
            });

            if (feederRecord) {
                await prisma.feeder.update({
                    where: { id: feederRecord.id },
                    data: { stakedAmount: { decrement: amountValue } }
                });
            }
            io.emit('chain:withdrawn', { feeder, amount: amountValue, txHash: event.log.transactionHash });
        } catch (error) {
            console.error('Error handling Withdrawn:', error);
        }
    });

    /** 等级升级 */
    c.on('RankUpgraded', async (feeder: string, newRank: number, event: any) => {
        console.log(`📥 RankUpgraded: feeder=${feeder}, rank=${newRank}`);
        try {
            const RANK_MAP: Record<number, string> = { 0: 'F', 1: 'E', 2: 'D', 3: 'C', 4: 'B', 5: 'A', 6: 'S' };
            io.emit('chain:rankUpgraded', {
                feeder,
                newRank: RANK_MAP[newRank] || 'F',
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling RankUpgraded:', error);
        }
    });
}

// ============ FeederLicense 事件 ============

function setupFeederLicenseListeners(): void {
    const c = contracts.feederLicense;
    if (!c) return;

    /** NFT 执照铸造 */
    c.on('LicenseMinted', async (tokenId: bigint, to: string, licenseType: number, event: any) => {
        console.log(`📥 LicenseMinted: tokenId=${tokenId}, to=${to}, type=${licenseType}`);
        try {
            const LICENSE_TYPES = ['BASIC', 'ADVANCED', 'PREMIUM', 'LEGENDARY'];
            io.emit('chain:licenseMinted', {
                tokenId: tokenId.toString(),
                to,
                licenseType: LICENSE_TYPES[licenseType] || 'BASIC',
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling LicenseMinted:', error);
        }
    });
}

/**
 * 停止事件监听
 */
export function stopEventListener(): void {
    Object.values(contracts).forEach(c => {
        if (c) c.removeAllListeners();
    });
    contracts = {};
    console.log('📴 Event listeners stopped');
}
