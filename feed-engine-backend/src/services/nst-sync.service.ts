/**
 * NST 订单定时同步服务
 * 
 * 每 SYNC_INTERVAL_MS 毫秒扫描链上 FeedProtocol 的 feedRequests，
 * 将新的（未注入的）订单同步到 FeedEngine 数据库。
 * 
 * 这是 event-listener 的可靠备份：即使事件监听因 RPC 限制或 cursor 问题失败，
 * 定时同步也能保证所有链上订单最终被发现。
 * 
 * @module services/nst-sync.service
 */

import { ethers } from 'ethers';
import prisma from '../config/database';
import { io } from '../index';

// ============ 配置 ============

/** 同步间隔（毫秒）— 每 30 秒检查一次 */
const SYNC_INTERVAL_MS = 30_000;

/** NST 订单默认有效期（7天） */
const ORDER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FEED_TYPE_MAP: Record<number, string> = {
    0: 'INITIAL', 1: 'DYNAMIC', 2: 'FINAL', 3: 'ARBITRATION'
};

// ABI — 只包含我们需要调用的函数
const FEED_PROTOCOL_ABI = [
    'function nextRequestId() view returns (uint256)',
    'function feedRequests(uint256) view returns (uint256 requestId, uint256 orderId, uint8 feedType, uint8 tier, uint256 deadline, uint256 createdAt, uint256 totalFeeders, uint256 submittedCount, uint256 finalPrice, bool finalized)',
];

const OPTIONS_CORE_ABI = [
    'function getOrder(uint256 orderId) view returns (tuple(uint256 orderId, address buyer, address seller, string underlyingName, string underlyingCode, string market, string country, string refPrice, uint8 direction, uint256 notionalUSDT, uint256 strikePrice, uint256 expiryTimestamp, uint256 premiumRate, uint256 premiumAmount, uint256 initialMargin, uint256 currentMargin, uint256 minMarginRate, uint256 maxPremiumRate, uint8 liquidationRule, uint8 consecutiveDays, uint8 dailyLimitPercent, uint8 exerciseDelay, uint8 sellerType, address designatedSeller, uint256 arbitrationWindow, uint256 marginCallDeadline, bool dividendAdjustment, uint8 feedRule, uint8 status, uint256 createdAt, uint256 matchedAt, uint256 settledAt, uint256 lastFeedPrice, uint256 dividendAmount, uint256 finalFeedRequestedAt))',
];

// ============ 状态 ============

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let lastKnownRequestId = 0;

// ============ 核心同步逻辑 ============

/**
 * 单次同步：扫描 FeedProtocol 上所有未 finalized 的 feedRequest，
 * 检查 FeedEngine DB 中是否已存在，不存在则创建。
 */
async function syncOnce(): Promise<void> {
    const feedProtocolAddress = process.env.NST_FEED_PROTOCOL_CONTRACT;
    const optionsCoreAddress = process.env.NST_OPTIONS_CORE_CONTRACT;
    const rpcUrl = process.env.NODE_ENV === 'production'
        ? (process.env.BSC_RPC_URL || '')
        : (process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com');

    if (!feedProtocolAddress || !optionsCoreAddress || !rpcUrl) {
        return; // 未配置则跳过
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true, batchMaxCount: 1 });
    const feedProtocol = new ethers.Contract(feedProtocolAddress, FEED_PROTOCOL_ABI, provider);
    const optionsCore = new ethers.Contract(optionsCoreAddress, OPTIONS_CORE_ABI, provider);

    try {
        const nextId = Number(await feedProtocol.nextRequestId());

        // 如果没有新的 request，直接返回
        if (nextId <= lastKnownRequestId) {
            return;
        }

        // 从上次已知的 requestId+1 开始扫描
        const startFrom = lastKnownRequestId > 0 ? lastKnownRequestId : 1;
        let injected = 0;
        const processedOrderIds = new Set<string>();

        for (let reqId = startFrom; reqId < nextId; reqId++) {
            try {
                const req = await feedProtocol.feedRequests(reqId);
                const orderId = Number(req.orderId);
                const feedType = FEED_TYPE_MAP[Number(req.feedType)] || 'INITIAL';
                const finalized = req.finalized;

                // 跳过已完成的、deadline 已过的、本轮已处理的请求
                const nowSec = Math.floor(Date.now() / 1000);
                const deadline = Number(req.deadline);
                if (finalized || (deadline > 0 && nowSec > deadline) || processedOrderIds.has(`${orderId}-${feedType}`)) continue;
                processedOrderIds.add(`${orderId}-${feedType}`);

                // 去重：检查 FeedEngine DB 是否已有此 orderId + feedType 组合
                const existing = await prisma.order.findFirst({
                    where: { sourceProtocol: 'NST', externalOrderId: orderId.toString(), feedType: feedType }
                });
                if (existing) continue;

                // 从 OptionsCore 获取订单详情
                let symbol = 'UNKNOWN';
                let market = 'UNKNOWN';
                let country = 'CN';
                let notionalAmount = 0;

                try {
                    const order = await optionsCore.getOrder(orderId);
                    symbol = order.underlyingName || order.underlyingCode || 'UNKNOWN';
                    market = order.market || 'UNKNOWN';
                    country = order.country || 'CN';
                    notionalAmount = parseFloat(ethers.formatUnits(order.notionalUSDT, 18));
                } catch {
                    console.warn(`[NST Sync] ⚠️ 无法获取 orderId=${orderId} 详情`);
                }

                // 创建 FeedEngine 订单
                const newOrder = await prisma.order.create({
                    data: {
                        symbol,
                        market,
                        country,
                        exchange: market,
                        feedType,
                        notionalAmount,
                        requiredFeeders: 1,
                        consensusThreshold: '1/1',
                        rewardAmount: 2.7,
                        status: 'OPEN',
                        expiresAt: new Date(Date.now() + ORDER_TTL_MS),
                        sourceProtocol: 'NST',
                        externalOrderId: orderId.toString(),
                        externalRequestId: reqId.toString(),
                        callbackUrl: '',
                        specialConditions: '[]',
                    }
                });

                console.log(`[NST Sync] ✅ 新订单同步: "${symbol}" (orderId=${orderId}) → FeedEngine #${newOrder.id}`);
                injected++;

                // 通知前端
                io.emit('nst:feedRequest', {
                    feedEngineOrderId: newOrder.id,
                    nstOrderId: orderId.toString(),
                    nstRequestId: reqId.toString(),
                    symbol,
                    market,
                    country,
                    feedType,
                    notionalAmount,
                });
            } catch (e: any) {
                console.error(`[NST Sync] ❌ reqId=${reqId} 处理失败:`, e.message);
            }
        }

        lastKnownRequestId = nextId;

        if (injected > 0) {
            console.log(`[NST Sync] 本轮同步完成，新增 ${injected} 个订单`);
        }
    } catch (e: any) {
        console.error('[NST Sync] ❌ 同步失败:', e.message);
    } finally {
        provider.destroy();
    }
}

// ============ 公共 API ============

/**
 * 启动 NST 定时同步服务
 */
export function startNstSync(): void {
    if (isRunning) return;

    const feedProtocolAddress = process.env.NST_FEED_PROTOCOL_CONTRACT;
    if (!feedProtocolAddress) {
        console.log('[NST Sync] ⏭️ NST_FEED_PROTOCOL_CONTRACT 未配置，跳过');
        return;
    }

    isRunning = true;
    console.log(`[NST Sync] 🔄 启动定时同步（每 ${SYNC_INTERVAL_MS / 1000} 秒）`);
    console.log(`[NST Sync]    FeedProtocol: ${feedProtocolAddress}`);

    // 立即执行一次
    syncOnce().then(() => {
        scheduleNext();
    });
}

/**
 * 停止同步
 */
export function stopNstSync(): void {
    isRunning = false;
    if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
    }
    console.log('[NST Sync] 📴 已停止');
}

function scheduleNext(): void {
    if (!isRunning) return;
    syncTimer = setTimeout(async () => {
        await syncOnce();
        scheduleNext();
    }, SYNC_INTERVAL_MS);
}
