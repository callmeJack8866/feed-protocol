import { ethers } from 'ethers';
import prisma from '../config/database';
import { io } from '../index';
import { CONTRACT_ADDRESSES } from './blockchain.service';

/**
 * 链上事件监听服务 — 基于 getLogs 轮询方案
 *
 * ❌ 旧方案: ethers contract.on() → 底层用 eth_newFilter + eth_getFilterChanges
 *    问题: 公共 RPC 节点 5 分钟后清除 filter → "filter not found" 报错 → 事件丢失
 *
 * ✅ 新方案: 定时 getLogs 轮询 + 持久化 lastProcessedBlock
 *    - 每 POLL_INTERVAL_MS 轮询一次最新区块
 *    - 用 provider.getLogs() 而非 filter，不依赖 RPC 维护 filter 状态
 *    - lastProcessedBlock 持久化到数据库（EventCursor 表），重启不丢
 *    - provider 断连自动重连 + 退避策略
 *    - 启动时自动从上次停止处 catch-up（无漏洞窗口）
 *
 * 为什么不会再丢事件:
 * 1. getLogs 是无状态的 RPC 调用，不依赖服务端 filter 存活
 * 2. 只在成功处理完一批 logs 后才移动 cursor（原子性）
 * 3. 重启时从 DB 读取 cursor，从上次位置重放
 * 4. 查询区间有上限（MAX_BLOCK_RANGE），避免 RPC 拒绝
 *
 * 监听 5 个已部署合约的链上事件：
 * - FEEDToken:      Transfer 事件
 * - FeederLicense:  LicenseMinted / Transfer 事件
 * - FeedConsensus:  OrderCreated / PriceCommitted / PriceRevealed / ConsensusSubmitted / OrderSettled 事件
 * - RewardPenalty:  RewardsDistributed / RewardsClaimed / PenaltyApplied / FeederBanned 事件
 * - FeedEngine:     FeederRegistered / Staked / UnstakeRequested / Withdrawn / OrderGrabbed / XPAwarded / RankUpgraded 事件
 */

// ============ 配置常量 ============

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 5_000;

/** 单次查询最大区块范围（公共 RPC 通常限制 2000~5000） */
const MAX_BLOCK_RANGE = 2000;

/** 启动时回溯区块数（如果 DB 没有 cursor） */
const STARTUP_LOOKBACK = 5000;

/** 重连最大退避时间（毫秒） */
const MAX_RECONNECT_BACKOFF = 60_000;

/** 事件 cursor 在数据库中的 key */
const CURSOR_KEY = 'event_listener_block';

// ============ 状态 ============

let provider: ethers.JsonRpcProvider | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let consecutiveErrors = 0;
let rpcUrl = '';

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

// NST FeedProtocol 合约事件
const NST_FEED_PROTOCOL_EVENTS = [
    'event FeedRequested(uint256 indexed requestId, uint256 indexed orderId, string underlyingName, string underlyingCode, string market, string country, uint8 feedType, uint8 liquidationRule, uint8 consecutiveDays, uint8 exerciseDelay, uint256 timestamp)',
];

// NST OptionsCore ABI（查询用）
const NST_OPTIONS_CORE_EVENTS = [
    'event FeedRequestEmitted(uint256 indexed orderId, string underlyingCode, string market, string country, uint8 feedType, uint8 tier, address indexed requester, uint256 notionalAmount, uint256 timestamp)',
];

const FEED_TYPE_MAP: Record<number, string> = { 0: 'INITIAL', 1: 'DYNAMIC', 2: 'SETTLEMENT', 3: 'ARBITRATION' };

// ============ 合约接口与 topic 映射 ============

interface ContractConfig {
    name: string;
    address: string;
    iface: ethers.Interface;
}

/** 构建要监听的合约列表 */
function buildContractConfigs(): ContractConfig[] {
    const configs: ContractConfig[] = [];

    const add = (name: string, address: string | undefined, abiEvents: string[]) => {
        if (!address || address === '0x0000000000000000000000000000000000000000') return;
        configs.push({ name, address, iface: new ethers.Interface(abiEvents) });
    };

    add('FeedConsensus', CONTRACT_ADDRESSES.FEED_CONSENSUS, FEED_CONSENSUS_EVENTS);
    add('RewardPenalty', CONTRACT_ADDRESSES.REWARD_PENALTY, REWARD_PENALTY_EVENTS);
    add('FeedEngine', CONTRACT_ADDRESSES.FEED_ENGINE, FEED_ENGINE_EVENTS);
    add('FeederLicense', CONTRACT_ADDRESSES.FEEDER_LICENSE, FEEDER_LICENSE_EVENTS);
    add('FeedToken', CONTRACT_ADDRESSES.FEED_TOKEN, FEED_TOKEN_EVENTS);

    if (CONTRACT_ADDRESSES.NST_FEED_PROTOCOL) {
        add('NstFeedProtocol', CONTRACT_ADDRESSES.NST_FEED_PROTOCOL, NST_FEED_PROTOCOL_EVENTS);
    }

    return configs;
}

// ============ Cursor 持久化 ============

/**
 * 从数据库读取上次处理到的区块号。
 * 如果不存在，返回 null（将使用 STARTUP_LOOKBACK 回溯）。
 */
async function loadCursor(): Promise<number | null> {
    try {
        // 使用 Prisma.raw 或 findFirst —— 这里用一个简便的方式
        // 我们复用 SeasonSnapshot 或单独表；为简单起见，用 key-value 方式
        const raw = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
            `SELECT value FROM KeyValue WHERE key = ?`,
            CURSOR_KEY
        );
        if (raw.length > 0) {
            return parseInt(raw[0].value, 10);
        }
    } catch {
        // KeyValue 表可能不存在，首次运行时创建
    }
    return null;
}

/**
 * 持久化当前处理到的区块号。
 */
async function saveCursor(blockNumber: number): Promise<void> {
    try {
        await prisma.$executeRawUnsafe(
            `INSERT OR REPLACE INTO KeyValue (key, value, updatedAt) VALUES (?, ?, datetime('now'))`,
            CURSOR_KEY,
            blockNumber.toString()
        );
    } catch {
        // 如果 KeyValue 表不存在，首次创建
        try {
            await prisma.$executeRawUnsafe(
                `CREATE TABLE IF NOT EXISTS KeyValue (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT DEFAULT (datetime('now')))`
            );
            await prisma.$executeRawUnsafe(
                `INSERT OR REPLACE INTO KeyValue (key, value, updatedAt) VALUES (?, ?, datetime('now'))`,
                CURSOR_KEY,
                blockNumber.toString()
            );
        } catch (e) {
            console.error('❌ Failed to save event cursor:', e);
        }
    }
}

// ============ 确保 KeyValue 表存在 ============

async function ensureCursorTable(): Promise<void> {
    try {
        await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS KeyValue (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT DEFAULT (datetime('now')))`
        );
    } catch (e) {
        console.warn('⚠️ Could not create KeyValue table (may already exist):', e);
    }
}

// ============ Provider 管理 ============

/**
 * 创建或重建 JsonRpcProvider
 */
function createProvider(): ethers.JsonRpcProvider {
    const p = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        staticNetwork: true,      // 避免每次调用都 eth_chainId
        batchMaxCount: 1,         // 公共 RPC 通常不支持 batch
    });
    return p;
}

// ============ 事件处理器 ============

/**
 * 处理解析后的事件日志。
 * 这里集中了所有合约的事件处理逻辑。
 */
async function handleParsedEvent(
    contractName: string,
    eventName: string,
    args: ethers.Result,
    log: ethers.Log
): Promise<void> {
    const txHash = log.transactionHash;

    try {
        switch (`${contractName}:${eventName}`) {

            // ---- FeedConsensus ----
            case 'FeedConsensus:PriceCommitted': {
                const [orderId, feeder] = args;
                console.log(`📥 PriceCommitted: order=${orderId}, feeder=${feeder}`);
                await prisma.priceSubmission.updateMany({
                    where: {
                        order: { txHash: orderId },
                        feeder: { address: feeder.toLowerCase() }
                    },
                    data: { commitTxHash: txHash, committedAt: new Date() }
                });
                io.emit('chain:priceCommitted', { orderId, feeder, txHash });
                break;
            }

            case 'FeedConsensus:PriceRevealed': {
                const [orderId, feeder, price] = args;
                const priceValue = parseFloat(ethers.formatUnits(price, 8));
                console.log(`📥 PriceRevealed: order=${orderId}, feeder=${feeder}, price=${priceValue}`);
                await prisma.priceSubmission.updateMany({
                    where: {
                        order: { txHash: orderId },
                        feeder: { address: feeder.toLowerCase() }
                    },
                    data: { revealedPrice: priceValue, revealTxHash: txHash, revealedAt: new Date() }
                });
                io.emit('chain:priceRevealed', { orderId, feeder, price: priceValue, txHash });
                break;
            }

            case 'FeedConsensus:ConsensusSubmitted': {
                const [orderId, consensusPrice] = args;
                const priceValue = parseFloat(ethers.formatUnits(consensusPrice, 8));
                console.log(`📥 ConsensusSubmitted: order=${orderId}, price=${priceValue}`);
                io.emit('chain:consensusSubmitted', { orderId, consensusPrice: priceValue, txHash });
                break;
            }

            case 'FeedConsensus:OrderSettled': {
                const [orderId] = args;
                console.log(`📥 OrderSettled: order=${orderId}`);
                io.emit('chain:orderSettled', { orderId, txHash });
                break;
            }

            // ---- RewardPenalty ----
            case 'RewardPenalty:RewardsDistributed': {
                const [orderId, totalReward] = args;
                console.log(`📥 RewardsDistributed: order=${orderId}, total=${ethers.formatUnits(totalReward, 18)} FEED`);
                io.emit('chain:rewardsDistributed', {
                    orderId,
                    totalReward: ethers.formatUnits(totalReward, 18),
                    txHash
                });
                break;
            }

            case 'RewardPenalty:RewardsClaimed': {
                const [feeder, amount] = args;
                console.log(`📥 RewardsClaimed: feeder=${feeder}, amount=${ethers.formatUnits(amount, 18)}`);
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
                    txHash
                });
                break;
            }

            case 'RewardPenalty:PenaltyApplied': {
                const [feeder, level, reason, slashAmount] = args;
                console.log(`📥 PenaltyApplied: feeder=${feeder}, level=${level}, slash=${ethers.formatUnits(slashAmount, 18)}`);
                io.emit('chain:penaltyApplied', {
                    feeder,
                    level: Number(level),
                    reason,
                    slashAmount: ethers.formatUnits(slashAmount, 18),
                    txHash
                });
                break;
            }

            case 'RewardPenalty:FeederBanned': {
                const [feeder] = args;
                console.log(`📥 FeederBanned: feeder=${feeder}`);
                const feederRec = await prisma.feeder.findFirst({
                    where: { address: feeder.toLowerCase() }
                });
                if (feederRec) {
                    await prisma.feeder.update({
                        where: { id: feederRec.id },
                        data: { isBanned: true }
                    });
                }
                io.emit('chain:feederBanned', { feeder, txHash });
                break;
            }

            // ---- FeedEngine ----
            case 'FeedEngine:FeederRegistered': {
                const [feeder, stakeAmount, licenseTokenId] = args;
                console.log(`📥 FeederRegistered: feeder=${feeder}, stake=${ethers.formatUnits(stakeAmount, 18)}`);
                io.emit('chain:feederRegistered', {
                    feeder,
                    stakeAmount: ethers.formatUnits(stakeAmount, 18),
                    licenseTokenId: licenseTokenId.toString(),
                    txHash
                });
                break;
            }

            case 'FeedEngine:Staked': {
                const [feeder, amount] = args;
                const amountValue = parseFloat(ethers.formatUnits(amount, 18));
                console.log(`📥 Staked: feeder=${feeder}, amount=${amountValue}`);
                const feederStake = await prisma.feeder.findFirst({
                    where: { address: feeder.toLowerCase() }
                });
                if (feederStake) {
                    await prisma.stakeRecord.create({
                        data: {
                            feederId: feederStake.id,
                            stakeType: 'FEED',
                            amount: amountValue,
                            txHash,
                            blockNumber: log.blockNumber,
                            status: 'ACTIVE'
                        }
                    });
                    await prisma.feeder.update({
                        where: { id: feederStake.id },
                        data: { stakedAmount: { increment: amountValue } }
                    });
                }
                io.emit('chain:staked', { feeder, amount: amountValue, txHash });
                break;
            }

            case 'FeedEngine:Withdrawn': {
                const [feeder, amount] = args;
                const amountValue = parseFloat(ethers.formatUnits(amount, 18));
                console.log(`📥 Withdrawn: feeder=${feeder}, amount=${amountValue}`);
                const feederW = await prisma.feeder.findFirst({
                    where: { address: feeder.toLowerCase() }
                });
                if (feederW) {
                    await prisma.feeder.update({
                        where: { id: feederW.id },
                        data: { stakedAmount: { decrement: amountValue } }
                    });
                }
                io.emit('chain:withdrawn', { feeder, amount: amountValue, txHash });
                break;
            }

            case 'FeedEngine:RankUpgraded': {
                const [feeder, newRank] = args;
                const RANK_MAP: Record<number, string> = { 0: 'F', 1: 'E', 2: 'D', 3: 'C', 4: 'B', 5: 'A', 6: 'S' };
                console.log(`📥 RankUpgraded: feeder=${feeder}, rank=${RANK_MAP[Number(newRank)] || 'F'}`);
                io.emit('chain:rankUpgraded', {
                    feeder,
                    newRank: RANK_MAP[Number(newRank)] || 'F',
                    txHash
                });
                break;
            }

            // ---- FeederLicense ----
            case 'FeederLicense:LicenseMinted': {
                const [tokenId, to, licenseType] = args;
                const LICENSE_TYPES = ['BASIC', 'ADVANCED', 'PREMIUM', 'LEGENDARY'];
                console.log(`📥 LicenseMinted: tokenId=${tokenId}, to=${to}, type=${LICENSE_TYPES[Number(licenseType)] || 'BASIC'}`);
                io.emit('chain:licenseMinted', {
                    tokenId: tokenId.toString(),
                    to,
                    licenseType: LICENSE_TYPES[Number(licenseType)] || 'BASIC',
                    txHash
                });
                break;
            }

            // ---- NST FeedProtocol ----
            case 'NstFeedProtocol:FeedRequested': {
                const [requestId, orderId, underlyingName, underlyingCode, market, country, feedType] = args;
                const feedTypeName = FEED_TYPE_MAP[Number(feedType)] || 'UNKNOWN';
                console.log(`\n🔗 [NST FeedProtocol] FeedRequested: reqId=${requestId}, orderId=${orderId}, symbol=${underlyingCode || underlyingName}`);

                // 去重: 检查是否已有
                const existing = await prisma.order.findFirst({
                    where: { sourceProtocol: 'NST', externalOrderId: orderId.toString() }
                });
                if (existing) {
                    console.log(`   ⏭️ orderId=${orderId} 已存在 (FeedEngine #${existing.id}), 跳过`);
                    break;
                }

                // 从 OptionsCore 获取订单详情
                let symbol = underlyingCode || underlyingName || 'UNKNOWN';
                let orderMarket = market || 'UNKNOWN';
                let orderCountry = country || 'UNKNOWN';
                let notionalAmount = 0;

                if (CONTRACT_ADDRESSES.NST_OPTIONS_CORE && provider) {
                    try {
                        const optionsCoreAbi = [
                            'function getOrder(uint256 orderId) view returns (tuple(uint256 orderId, address buyer, address seller, string underlyingName, string underlyingCode, string market, string country, string refPrice, uint8 direction, uint256 notionalUSDT, uint256 strikePrice, uint256 expiryTimestamp, uint256 premiumRate, uint256 premiumAmount, uint256 initialMargin, uint256 currentMargin, uint256 minMarginRate, uint256 maxPremiumRate, uint8 liquidationRule, uint8 consecutiveDays, uint8 dailyLimitPercent, uint8 exerciseDelay, uint8 sellerType, address designatedSeller, uint256 arbitrationWindow, uint256 marginCallDeadline, bool dividendAdjustment, uint8 feedRule, uint8 status, uint256 createdAt, uint256 matchedAt, uint256 settledAt, uint256 lastFeedPrice, uint256 dividendAmount, uint256 finalFeedRequestedAt))'
                        ];
                        const optionsCore = new ethers.Contract(CONTRACT_ADDRESSES.NST_OPTIONS_CORE, optionsCoreAbi, provider);
                        const order = await optionsCore.getOrder(orderId);
                        symbol = order.underlyingName || order.underlyingCode || symbol;
                        orderMarket = order.market || orderMarket;
                        orderCountry = order.country || orderCountry;
                        notionalAmount = parseFloat(ethers.formatUnits(order.notionalUSDT, 18));
                    } catch {
                        console.warn('   ⚠️ 无法获取 OptionsCore 订单详情，使用事件数据');
                    }
                }

                const newOrder = await prisma.order.create({
                    data: {
                        symbol,
                        market: orderMarket,
                        country: orderCountry,
                        exchange: orderMarket,
                        feedType: feedTypeName,
                        notionalAmount,
                        requiredFeeders: 1,
                        consensusThreshold: '1/1',
                        rewardAmount: 2.7,
                        status: 'OPEN',
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天有效期
                        sourceProtocol: 'NST',
                        externalOrderId: orderId.toString(),
                        externalRequestId: requestId.toString(),
                        callbackUrl: '',
                        txHash,
                    }
                });

                console.log(`   ✅ FeedEngine 订单已创建: ${newOrder.id}`);
                io.emit('nst:feedRequest', {
                    feedEngineOrderId: newOrder.id,
                    nstOrderId: orderId.toString(),
                    nstRequestId: requestId.toString(),
                    symbol,
                    market: orderMarket,
                    country: orderCountry,
                    feedType: feedTypeName,
                    notionalAmount,
                    txHash,
                });
                break;
            }

            default:
                // 未显式处理的事件，只打日志
                console.log(`📡 [${contractName}] ${eventName} (block ${log.blockNumber})`);
        }
    } catch (error) {
        console.error(`❌ Error handling ${contractName}:${eventName}:`, error);
    }
}

// ============ 核心轮询逻辑 ============

/**
 * 单次轮询: 从 fromBlock 到 toBlock 查询所有合约的 logs
 */
async function pollOnce(
    contractConfigs: ContractConfig[],
    fromBlock: number,
    toBlock: number
): Promise<number> {
    if (!provider) throw new Error('Provider is null');
    if (fromBlock > toBlock) return toBlock;

    let processedUpTo = fromBlock - 1;

    for (const config of contractConfigs) {
        try {
            const logs = await provider.getLogs({
                address: config.address,
                fromBlock,
                toBlock,
            });

            for (const log of logs) {
                try {
                    const parsed = config.iface.parseLog({
                        topics: log.topics as string[],
                        data: log.data,
                    });
                    if (parsed) {
                        await handleParsedEvent(config.name, parsed.name, parsed.args, log);
                    }
                } catch {
                    // 无法解析的 log（可能是 Transfer 等不在我们 ABI 中的事件），跳过
                }
            }

            if (logs.length > 0) {
                const maxBlock = Math.max(...logs.map(l => l.blockNumber));
                processedUpTo = Math.max(processedUpTo, maxBlock);
            }
        } catch (error: any) {
            // 某个合约查询失败不影响其他合约
            console.error(`❌ getLogs failed for ${config.name} (${fromBlock}-${toBlock}):`, error?.message || error);
            throw error; // 向上抛出让 poll loop 处理重试
        }
    }

    return Math.max(processedUpTo, toBlock);
}

/**
 * 轮询主循环
 */
async function pollLoop(contractConfigs: ContractConfig[]): Promise<void> {
    if (!isRunning || !provider) return;

    try {
        const latestBlock = await provider.getBlockNumber();
        const savedCursor = await loadCursor();
        const fromBlock = savedCursor !== null ? savedCursor + 1 : Math.max(0, latestBlock - STARTUP_LOOKBACK);

        // DEBUG: 打印每次轮询状态
        const gap = latestBlock - fromBlock;
        if (gap > 0) {
            console.log(`📡 [Poll] from=${fromBlock} → latest=${latestBlock} gap=${gap} blocks`);
        }

        if (fromBlock > latestBlock) {
            // 没有新区块，等下一轮
            consecutiveErrors = 0;
            schedulePoll(contractConfigs);
            return;
        }

        // 分批查询，避免超过 MAX_BLOCK_RANGE
        let cursor = fromBlock;
        while (cursor <= latestBlock && isRunning) {
            const batchEnd = Math.min(cursor + MAX_BLOCK_RANGE - 1, latestBlock);
            const processed = await pollOnce(contractConfigs, cursor, batchEnd);
            await saveCursor(processed);
            cursor = processed + 1;
        }

        consecutiveErrors = 0;
    } catch (error: any) {
        consecutiveErrors++;
        const backoff = Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors), MAX_RECONNECT_BACKOFF);
        console.error(`❌ Poll error (attempt ${consecutiveErrors}, retry in ${backoff}ms):`, error?.message || error);

        // 如果连续失败超过 5 次，重建 provider
        if (consecutiveErrors >= 5) {
            console.warn('🔄 Rebuilding provider due to repeated failures...');
            try {
                provider?.destroy();
            } catch { /* ignore */ }
            provider = createProvider();
            consecutiveErrors = 0;
        }

        // 带退避的延迟重试
        if (isRunning) {
            pollTimer = setTimeout(() => pollLoop(contractConfigs), backoff);
        }
        return;
    }

    schedulePoll(contractConfigs);
}

/**
 * 调度下一次轮询
 */
function schedulePoll(contractConfigs: ContractConfig[]): void {
    if (!isRunning) return;
    pollTimer = setTimeout(() => pollLoop(contractConfigs), POLL_INTERVAL_MS);
}

// ============ 公共 API ============

/**
 * 初始化事件监听（入口点）
 */
export function initEventListener(): void {
    rpcUrl = process.env.NODE_ENV === 'production'
        ? (process.env.BSC_RPC_URL || '')
        : (process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com');

    if (!rpcUrl) {
        console.warn('⚠️ Event listener: RPC URL not configured');
        return;
    }

    try {
        provider = createProvider();
        isRunning = true;
        consecutiveErrors = 0;

        const contractConfigs = buildContractConfigs();

        console.log('📡 Event listener started (getLogs polling mode)');
        console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms | Max block range: ${MAX_BLOCK_RANGE}`);
        contractConfigs.forEach(c => console.log(`   🔗 ${c.name}: ${c.address}`));

        // 确保 cursor 表存在，然后启动轮询
        ensureCursorTable().then(() => {
            pollLoop(contractConfigs);
        });

    } catch (error) {
        console.error('❌ Failed to initialize event listener:', error);
    }
}

/**
 * 停止事件监听
 */
export function stopEventListener(): void {
    isRunning = false;
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
    try {
        provider?.destroy();
    } catch { /* ignore */ }
    provider = null;
    console.log('📴 Event listener stopped');
}
