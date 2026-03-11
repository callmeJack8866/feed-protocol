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

// NST Options 协议事件（外部客户协议）
const NST_OPTIONS_CORE_EVENTS = [
    'event FeedRequestEmitted(uint256 indexed orderId, string underlyingCode, string market, string country, uint8 feedType, uint8 tier, address indexed requester, uint256 notionalAmount, uint256 timestamp)',
];

// NST FeedProtocol 合约事件（requestFeedPublic 调用后 emit）
const NST_FEED_PROTOCOL_EVENTS = [
    'event FeedRequested(uint256 indexed requestId, uint256 indexed orderId, string underlyingName, string underlyingCode, string market, string country, uint8 feedType, uint8 liquidationRule, uint8 consecutiveDays, uint8 exerciseDelay, uint256 timestamp)',
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

        // NST 外部协议监听 — OptionsCore
        if (CONTRACT_ADDRESSES.NST_OPTIONS_CORE) {
            contracts.nstOptionsCore = new ethers.Contract(
                CONTRACT_ADDRESSES.NST_OPTIONS_CORE, NST_OPTIONS_CORE_EVENTS, provider
            );
            setupNstListeners();
            console.log('   🔗 NST OptionsCore: ' + CONTRACT_ADDRESSES.NST_OPTIONS_CORE);
        } else {
            console.log('   ⚠️ NST OptionsCore: 未配置 (跳过监听)');
        }

        // NST FeedProtocol 监听（requestFeedPublic 的 FeedRequested 事件）
        if (CONTRACT_ADDRESSES.NST_FEED_PROTOCOL) {
            contracts.nstFeedProtocol = new ethers.Contract(
                CONTRACT_ADDRESSES.NST_FEED_PROTOCOL, NST_FEED_PROTOCOL_EVENTS, provider
            );
            setupNstFeedProtocolListeners();
            console.log('   🔗 NST FeedProtocol: ' + CONTRACT_ADDRESSES.NST_FEED_PROTOCOL);

            // 启动时扫描历史事件补漏（最近 5000 个区块）
            scanHistoricalFeedRequests(contracts.nstFeedProtocol, provider!);
        } else {
            console.log('   ⚠️ NST FeedProtocol: 未配置 (跳过监听)');
        }

        console.log('📡 Event listeners started for all contracts');
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
                    data: { totalEarnings: { increment: parseFloat(ethers.formatUnits(amount, 18)) } }
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
                    data: { isBanned: true }
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

// ============ NST Options 协议事件 ============

const FEED_TYPE_MAP: Record<number, string> = { 0: 'INITIAL', 1: 'DYNAMIC', 2: 'FINAL', 3: 'ARBITRATION' };
const FEED_TIER_MAP: Record<number, string> = { 0: 'TIER_5_3', 1: 'TIER_7_5', 2: 'TIER_10_7' };

function setupNstListeners(): void {
    const c = contracts.nstOptionsCore;
    if (!c) return;

    /** NST 喂价请求事件 — 创建 FeedEngine 内部订单 */
    c.on('FeedRequestEmitted', async (
        orderId: bigint,
        underlyingCode: string,
        market: string,
        country: string,
        feedType: number,
        tier: number,
        requester: string,
        notionalAmount: bigint,
        timestamp: bigint,
        event: any
    ) => {
        const feedTypeName = FEED_TYPE_MAP[feedType] || 'UNKNOWN';
        const tierName = FEED_TIER_MAP[tier] || 'TIER_5_3';
        console.log(`\n🔗 [NST] FeedRequestEmitted:`);
        console.log(`   orderId=${orderId}, symbol=${underlyingCode}, type=${feedTypeName}, tier=${tierName}`);
        console.log(`   requester=${requester}, notional=${ethers.formatUnits(notionalAmount, 6)} USDT`);

        try {
            // 创建 FeedEngine 内部订单
            const quorumMap: Record<string, number> = { 'TIER_5_3': 3, 'TIER_7_5': 5, 'TIER_10_7': 7 };
            const requiredFeedersMap: Record<string, number> = { 'TIER_5_3': 5, 'TIER_7_5': 7, 'TIER_10_7': 10 };

            const order = await prisma.order.create({
                data: {
                    symbol: underlyingCode,
                    market: market || 'UNKNOWN',
                    country: country || 'UNKNOWN',
                    exchange: market || 'UNKNOWN',
                    feedType: feedTypeName,
                    notionalAmount: parseFloat(ethers.formatUnits(notionalAmount, 6)),
                    requiredFeeders: requiredFeedersMap[tierName] || 5,
                    consensusThreshold: `${quorumMap[tierName] || 3}/${requiredFeedersMap[tierName] || 5}`,
                    rewardAmount: 10,
                    status: 'OPEN',
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟超时
                    sourceProtocol: 'NST',
                    externalOrderId: orderId.toString(),
                    callbackUrl: '',
                    txHash: event.log?.transactionHash || '',
                }
            });

            console.log(`   ✅ FeedEngine 订单已创建: ${order.id}`);

            // WebSocket 广播给喂价员前端
            io.emit('nst:feedRequest', {
                feedEngineOrderId: order.id,
                nstOrderId: orderId.toString(),
                symbol: underlyingCode,
                market,
                country,
                feedType: feedTypeName,
                tier: tierName,
                notionalAmount: parseFloat(ethers.formatUnits(notionalAmount, 6)),
                requester,
                txHash: event.log?.transactionHash || '',
            });

        } catch (error) {
            console.error('❌ [NST] Failed to create FeedEngine order from NST event:', error);
        }
    });
}

// ============ NST FeedProtocol 事件 ============

/**
 * 监听 FeedProtocol 合约的 FeedRequested 事件
 * 这是 requestFeedPublic 调用后 emit 的实际事件
 */
function setupNstFeedProtocolListeners(): void {
    const c = contracts.nstFeedProtocol;
    if (!c) return;

    c.on('FeedRequested', async (
        requestId: bigint,
        orderId: bigint,
        underlyingName: string,
        underlyingCode: string,
        market: string,
        country: string,
        feedType: number,
        liquidationRule: number,
        consecutiveDays: number,
        exerciseDelay: number,
        timestamp: bigint,
        event: any
    ) => {
        const feedTypeName = FEED_TYPE_MAP[feedType] || 'UNKNOWN';
        console.log(`\n🔗 [NST FeedProtocol] FeedRequested:`);
        console.log(`   requestId=${requestId}, orderId=${orderId}, symbol=${underlyingCode || underlyingName || 'N/A'}, type=${feedTypeName}`);

        try {
            // 尝试从 OptionsCore 获取订单详情
            let symbol = underlyingCode || underlyingName || 'UNKNOWN';
            let orderMarket = market || 'UNKNOWN';
            let orderCountry = country || 'UNKNOWN';
            let notionalAmount = 0;

            if (CONTRACT_ADDRESSES.NST_OPTIONS_CORE) {
                try {
                    const optionsCoreAbi = [
                        'function getOrder(uint256 orderId) view returns (tuple(uint256 orderId, address buyer, address seller, string underlyingName, string underlyingCode, string market, string country, string refPrice, uint8 direction, uint256 notionalUSDT, uint256 strikePrice, uint256 expiryTimestamp, uint256 premiumRate, uint256 premiumAmount, uint256 initialMargin, uint256 currentMargin, uint256 minMarginRate, uint8 liquidationRule, uint8 consecutiveDays, uint8 dailyLimitPercent, uint8 exerciseDelay, uint8 sellerType, address designatedSeller, uint256 arbitrationWindow, uint256 marginCallDeadline, bool dividendAdjustment, uint8 feedRule, uint8 status, uint256 createdAt, uint256 matchedAt, uint256 settledAt, uint256 lastFeedPrice, uint256 dividendAmount))'
                    ];
                    const optionsCore = new ethers.Contract(CONTRACT_ADDRESSES.NST_OPTIONS_CORE, optionsCoreAbi, provider!);
                    const order = await optionsCore.getOrder(orderId);
                    symbol = order.underlyingName || order.underlyingCode || symbol;
                    orderMarket = order.market || orderMarket;
                    orderCountry = order.country || orderCountry;
                    notionalAmount = parseFloat(ethers.formatUnits(order.notionalUSDT, 18));
                    console.log(`   📋 订单详情: ${symbol}, market=${orderMarket}, notional=${notionalAmount}`);
                } catch (err) {
                    console.warn('   ⚠️ 无法获取 OptionsCore 订单详情，使用事件数据');
                }
            }

            // 创建 FeedEngine 内部订单
            const order = await prisma.order.create({
                data: {
                    symbol: symbol,
                    market: orderMarket,
                    country: orderCountry,
                    exchange: orderMarket,
                    feedType: feedTypeName,
                    notionalAmount: notionalAmount,
                    requiredFeeders: 1,  // 测试模式: Tier_5_3 只需1人
                    consensusThreshold: '1/1',
                    rewardAmount: 2.7,  // 2.7 USDT feeder reward
                    status: 'OPEN',
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                    sourceProtocol: 'NST',
                    externalOrderId: orderId.toString(),
                    callbackUrl: '',
                    txHash: event.log?.transactionHash || '',
                }
            });

            console.log(`   ✅ FeedEngine 订单已创建: ${order.id} (from FeedProtocol event)`);

            // WebSocket 广播给喂价员前端
            io.emit('nst:feedRequest', {
                feedEngineOrderId: order.id,
                nstOrderId: orderId.toString(),
                nstRequestId: requestId.toString(),
                symbol: symbol,
                market: orderMarket,
                country: orderCountry,
                feedType: feedTypeName,
                notionalAmount: notionalAmount,
                txHash: event.log?.transactionHash || '',
            });

        } catch (error) {
            console.error('❌ [NST FeedProtocol] Failed to create FeedEngine order:', error);
        }
    });
}

// ============ 启动时历史事件扫描 ============

/**
 * 扫描历史 FeedRequested 事件，补漏后端重启期间错过的喂价请求
 * 检查最近 5000 个区块，对比数据库去重
 */
async function scanHistoricalFeedRequests(
    contract: ethers.Contract,
    provider: ethers.JsonRpcProvider
): Promise<void> {
    console.log('\n🔍 [Catch-up] 扫描历史 FeedRequested 事件...');

    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 5000);
        console.log(`   扫描区块范围: ${fromBlock} → ${currentBlock}`);

        const filter = contract.filters.FeedRequested();
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);

        console.log(`   找到 ${events.length} 个历史 FeedRequested 事件`);

        if (events.length === 0) return;

        for (const event of events) {
            const log = event as ethers.EventLog;
            const args = log.args;
            if (!args) continue;

            const [requestId, orderId, underlyingName, underlyingCode, market, country, feedType] = args;
            const feedTypeName = FEED_TYPE_MAP[Number(feedType)] || 'UNKNOWN';

            // 检查数据库是否已有该订单
            const existing = await prisma.order.findFirst({
                where: {
                    sourceProtocol: 'NST',
                    externalOrderId: orderId.toString(),
                }
            });

            if (existing) {
                console.log(`   ⏭️ orderId=${orderId} 已存在 (FeedEngine #${existing.id}), 跳过`);
                continue;
            }

            // 从 OptionsCore 获取订单详情
            let symbol = underlyingCode || underlyingName || 'UNKNOWN';
            let orderMarket = market || 'UNKNOWN';
            let orderCountry = country || 'UNKNOWN';
            let notionalAmount = 0;

            if (CONTRACT_ADDRESSES.NST_OPTIONS_CORE) {
                try {
                    const optionsCoreAbi = [
                        'function getOrder(uint256 orderId) view returns (tuple(uint256 orderId, address buyer, address seller, string underlyingName, string underlyingCode, string market, string country, string refPrice, uint8 direction, uint256 notionalUSDT, uint256 strikePrice, uint256 expiryTimestamp, uint256 premiumRate, uint256 premiumAmount, uint256 initialMargin, uint256 currentMargin, uint256 minMarginRate, uint8 liquidationRule, uint8 consecutiveDays, uint8 dailyLimitPercent, uint8 exerciseDelay, uint8 sellerType, address designatedSeller, uint256 arbitrationWindow, uint256 marginCallDeadline, bool dividendAdjustment, uint8 feedRule, uint8 status, uint256 createdAt, uint256 matchedAt, uint256 settledAt, uint256 lastFeedPrice, uint256 dividendAmount))'
                    ];
                    const optionsCore = new ethers.Contract(CONTRACT_ADDRESSES.NST_OPTIONS_CORE, optionsCoreAbi, provider);
                    const order = await optionsCore.getOrder(orderId);
                    symbol = order.underlyingName || order.underlyingCode || symbol;
                    orderMarket = order.market || orderMarket;
                    orderCountry = order.country || orderCountry;
                    notionalAmount = parseFloat(ethers.formatUnits(order.notionalUSDT, 18));
                } catch (err) {
                    console.warn(`   ⚠️ 无法获取 OptionsCore 订单 ${orderId} 详情`);
                }
            }

            // 创建 FeedEngine 订单
            const newOrder = await prisma.order.create({
                data: {
                    symbol: symbol,
                    market: orderMarket,
                    country: orderCountry,
                    exchange: orderMarket,
                    feedType: feedTypeName,
                    notionalAmount: notionalAmount,
                    requiredFeeders: 1,
                    consensusThreshold: '1/1',
                    rewardAmount: 2.7,
                    status: 'OPEN',
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                    sourceProtocol: 'NST',
                    externalOrderId: orderId.toString(),
                    callbackUrl: '',
                    txHash: log.transactionHash || '',
                }
            });

            console.log(`   ✅ 补漏创建: orderId=${orderId}, symbol=${symbol} → FeedEngine #${newOrder.id}`);

            // WebSocket 广播
            io.emit('nst:feedRequest', {
                feedEngineOrderId: newOrder.id,
                nstOrderId: orderId.toString(),
                nstRequestId: requestId.toString(),
                symbol: symbol,
                market: orderMarket,
                country: orderCountry,
                feedType: feedTypeName,
                notionalAmount: notionalAmount,
                txHash: log.transactionHash || '',
            });
        }

        console.log('✅ [Catch-up] 历史事件扫描完成');
    } catch (error) {
        console.error('❌ [Catch-up] 历史事件扫描失败:', error);
    }
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
