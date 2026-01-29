import { ethers } from 'ethers';
import prisma from '../config/database';
import { io } from '../index';

/**
 * 链上事件监听服务
 */

let provider: ethers.JsonRpcProvider | null = null;
let feedEngineContract: ethers.Contract | null = null;
let stakingContract: ethers.Contract | null = null;

// 合约 ABI（事件部分）
const FEED_ENGINE_ABI = [
    'event OrderCreated(bytes32 indexed orderId, string symbol, uint256 notionalAmount, uint256 requiredFeeders)',
    'event PriceSubmitted(bytes32 indexed orderId, address indexed feeder, bytes32 priceHash)',
    'event PriceRevealed(bytes32 indexed orderId, address indexed feeder, uint256 price)',
    'event ConsensusReached(bytes32 indexed orderId, uint256 consensusPrice, uint256 timestamp)',
    'event OrderSettled(bytes32 indexed orderId, uint256 finalPrice)',
    'event DisputeRaised(bytes32 indexed orderId, address indexed initiator, string reason)',
];

const STAKING_ABI = [
    'event Staked(address indexed user, uint256 amount, uint8 stakeType)',
    'event UnstakeRequested(address indexed user, uint256 amount, uint256 unlockTime)',
    'event Unstaked(address indexed user, uint256 amount)',
    'event Slashed(address indexed user, uint256 amount, string reason)',
];

/**
 * 初始化事件监听
 */
export function initEventListener(): void {
    const rpcUrl = process.env.NODE_ENV === 'production'
        ? process.env.BSC_RPC_URL
        : process.env.BSC_TESTNET_RPC_URL;

    if (!rpcUrl) {
        console.warn('⚠️ Event listener: RPC URL not configured');
        return;
    }

    // 使用 WebSocket 提供者以获得实时事件
    const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    try {
        provider = new ethers.JsonRpcProvider(rpcUrl);

        // 初始化 FeedEngine 合约监听
        const feedEngineAddress = process.env.FEED_ENGINE_CONTRACT;
        if (feedEngineAddress) {
            feedEngineContract = new ethers.Contract(feedEngineAddress, FEED_ENGINE_ABI, provider);
            setupFeedEngineListeners();
            console.log(`📡 FeedEngine contract listener started: ${feedEngineAddress}`);
        }

        // 初始化 Staking 合约监听
        const stakingAddress = process.env.STAKING_CONTRACT;
        if (stakingAddress) {
            stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, provider);
            setupStakingListeners();
            console.log(`📡 Staking contract listener started: ${stakingAddress}`);
        }

    } catch (error) {
        console.error('Failed to initialize event listener:', error);
    }
}

/**
 * 设置 FeedEngine 合约事件监听
 */
function setupFeedEngineListeners(): void {
    if (!feedEngineContract) return;

    // 监听 PriceSubmitted 事件
    feedEngineContract.on('PriceSubmitted', async (orderId, feeder, priceHash, event) => {
        console.log(`📥 PriceSubmitted: Order ${orderId}, Feeder ${feeder}`);

        try {
            // 更新数据库中的提交记录
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

            // 广播事件
            io.emit('chain:priceSubmitted', {
                orderId,
                feeder,
                priceHash,
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling PriceSubmitted event:', error);
        }
    });

    // 监听 PriceRevealed 事件
    feedEngineContract.on('PriceRevealed', async (orderId, feeder, price, event) => {
        console.log(`📥 PriceRevealed: Order ${orderId}, Feeder ${feeder}, Price ${price}`);

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

            io.emit('chain:priceRevealed', {
                orderId,
                feeder,
                price: priceValue,
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling PriceRevealed event:', error);
        }
    });

    // 监听 ConsensusReached 事件
    feedEngineContract.on('ConsensusReached', async (orderId, consensusPrice, timestamp, event) => {
        console.log(`📥 ConsensusReached: Order ${orderId}, Price ${consensusPrice}`);

        try {
            const priceValue = parseFloat(ethers.formatUnits(consensusPrice, 8));

            await prisma.order.updateMany({
                where: { txHash: orderId },
                data: {
                    finalPrice: priceValue,
                    status: 'SETTLED',
                    settledAt: new Date(Number(timestamp) * 1000)
                }
            });

            io.emit('chain:consensusReached', {
                orderId,
                consensusPrice: priceValue,
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling ConsensusReached event:', error);
        }
    });

    // 监听 DisputeRaised 事件
    feedEngineContract.on('DisputeRaised', async (orderId, initiator, reason, event) => {
        console.log(`📥 DisputeRaised: Order ${orderId}, Initiator ${initiator}`);

        try {
            // 自动创建仲裁案件
            const order = await prisma.order.findFirst({
                where: { txHash: orderId }
            });

            if (order) {
                const feeder = await prisma.feeder.findFirst({
                    where: { address: initiator.toLowerCase() }
                });

                if (feeder) {
                    await prisma.arbitrationCase.create({
                        data: {
                            orderId: order.id,
                            initiatorId: feeder.id,
                            initiatorType: 'FEEDER',
                            disputeReason: reason,
                            description: `Chain dispute raised: ${reason}`,
                            status: 'PENDING'
                        }
                    });
                }
            }

            io.emit('chain:disputeRaised', {
                orderId,
                initiator,
                reason,
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling DisputeRaised event:', error);
        }
    });
}

/**
 * 设置 Staking 合约事件监听
 */
function setupStakingListeners(): void {
    if (!stakingContract) return;

    // 监听 Staked 事件
    stakingContract.on('Staked', async (user, amount, stakeType, event) => {
        console.log(`📥 Staked: User ${user}, Amount ${amount}`);

        try {
            const amountValue = parseFloat(ethers.formatUnits(amount, 18));
            const stakeTypeMap: Record<number, string> = { 0: 'FEED', 1: 'USDT', 2: 'NFT' };

            const feeder = await prisma.feeder.findFirst({
                where: { address: user.toLowerCase() }
            });

            if (feeder) {
                await prisma.stakeRecord.create({
                    data: {
                        feederId: feeder.id,
                        stakeType: stakeTypeMap[stakeType] || 'USDT',
                        amount: amountValue,
                        txHash: event.log.transactionHash,
                        blockNumber: event.log.blockNumber,
                        status: 'ACTIVE'
                    }
                });

                await prisma.feeder.update({
                    where: { id: feeder.id },
                    data: {
                        stakedAmount: { increment: amountValue },
                        stakeType: stakeTypeMap[stakeType] || 'USDT'
                    }
                });
            }

            io.emit('chain:staked', {
                user,
                amount: amountValue,
                stakeType: stakeTypeMap[stakeType],
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling Staked event:', error);
        }
    });

    // 监听 Slashed 事件
    stakingContract.on('Slashed', async (user, amount, reason, event) => {
        console.log(`📥 Slashed: User ${user}, Amount ${amount}, Reason ${reason}`);

        try {
            const amountValue = parseFloat(ethers.formatUnits(amount, 18));

            const feeder = await prisma.feeder.findFirst({
                where: { address: user.toLowerCase() }
            });

            if (feeder) {
                // 更新最近的活跃质押记录
                await prisma.stakeRecord.updateMany({
                    where: {
                        feederId: feeder.id,
                        status: 'ACTIVE'
                    },
                    data: {
                        slashedAmount: { increment: amountValue },
                        slashReason: reason,
                        slashTxHash: event.log.transactionHash
                    }
                });

                await prisma.feeder.update({
                    where: { id: feeder.id },
                    data: {
                        stakedAmount: { decrement: amountValue }
                    }
                });
            }

            io.emit('chain:slashed', {
                user,
                amount: amountValue,
                reason,
                txHash: event.log.transactionHash
            });
        } catch (error) {
            console.error('Error handling Slashed event:', error);
        }
    });
}

/**
 * 停止事件监听
 */
export function stopEventListener(): void {
    if (feedEngineContract) {
        feedEngineContract.removeAllListeners();
    }
    if (stakingContract) {
        stakingContract.removeAllListeners();
    }
    console.log('📴 Event listeners stopped');
}
