/**
 * 数据转换服务 - 后端数据到前端类型的转换
 */

import {
    FeedOrder,
    FeederProfile,
    FeedHistoryItem,
    MarketType,
    FeedType,
    OrderStatus,
    FeederRank,
    SpecialCondition,
    ConditionType
} from '../types';

/**
 * 转换后端订单数据到前�?FeedOrder 类型
 */
export function transformOrder(backendOrder: any): FeedOrder & { sourceProtocol?: string } {
    return {
        id: backendOrder.id,
        orderId: backendOrder.id,
        symbol: backendOrder.symbol,
        market: backendOrder.market as MarketType,
        country: backendOrder.country,
        exchange: backendOrder.exchange,
        feedType: backendOrder.feedType as FeedType,
        notionalAmount: backendOrder.notionalAmount,
        requiredFeeders: backendOrder.requiredFeeders,
        consensusThreshold: backendOrder.consensusThreshold,
        specialConditions: parseSpecialConditions(backendOrder.specialConditions),
        rewardAmount: backendOrder.rewardAmount,
        status: mapOrderStatus(backendOrder.status),
        timeRemaining: calculateTimeRemaining(backendOrder.expiresAt),
        sourceProtocol: backendOrder.sourceProtocol || undefined,
        // NST 订单详情扩展字段
        underlyingName: backendOrder.underlyingName || backendOrder.symbol,
        underlyingCode: backendOrder.underlyingCode || '',
        direction: backendOrder.direction || '',
        strikePrice: backendOrder.strikePrice || 0,
        expiryTimestamp: backendOrder.expiryTimestamp ? new Date(backendOrder.expiryTimestamp).getTime() / 1000 : 0,
        refPrice: backendOrder.refPrice || '',
        externalOrderId: backendOrder.externalOrderId || '',
    };
}

/**
 * 转换后端喂价员数据到前端 FeederProfile 类型
 */
export function transformFeeder(backendFeeder: any, history: any[] = []): FeederProfile {
    const rawAccuracyRate = Number(backendFeeder.accuracyRate ?? 0);
    const accuracyRate = rawAccuracyRate <= 1 ? rawAccuracyRate * 100 : rawAccuracyRate;

    return {
        address: backendFeeder.address,
        nickname: backendFeeder.nickname || shortenAddress(backendFeeder.address),
        rank: backendFeeder.rank as FeederRank,
        xp: backendFeeder.xp ?? 0,
        totalFeeds: backendFeeder.totalFeeds ?? 0,
        accuracyRate,
        balanceFEED: Number(backendFeeder.balanceFEED ?? 0),
        balanceUSDT: Number(backendFeeder.balanceUSDT ?? 0),
        balanceNative: Number(backendFeeder.balanceNative ?? 0),
        history: history.map(transformHistoryItem),
        stakedAmount: Number(backendFeeder.stakedAmount ?? 0),
        stakeType: backendFeeder.stakeType || 'USDT',
    };
}

/**
 * 转换喂价历史记录
 */
export function transformHistoryItem(backendItem: any): FeedHistoryItem {
    return {
        id: backendItem.id,
        symbol: backendItem.symbol,
        price: backendItem.price ?? backendItem.revealedPrice ?? 0,
        deviation: backendItem.deviation ?? 0,
        reward: backendItem.reward ?? backendItem.rewardEarned ?? 0,
        timestamp: new Date(backendItem.createdAt).getTime(),
    };
}

/**
 * 解析特殊条件 JSON
 */
function parseSpecialConditions(conditionsJson: string | any[]): SpecialCondition[] {
    if (!conditionsJson) return [];

    try {
        const conditions = typeof conditionsJson === 'string'
            ? JSON.parse(conditionsJson)
            : conditionsJson;

        if (!Array.isArray(conditions)) return [];

        return conditions.map(c => ({
            type: c.type as ConditionType,
            description: c.description || '',
            highlightLevel: c.highlightLevel || 'normal',
        }));
    } catch {
        return [];
    }
}

/**
 * 映射订单状�?
 */
function mapOrderStatus(status: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
        'OPEN': OrderStatus.OPEN,
        'GRABBED': OrderStatus.GRABBED,
        'COMMITTED': OrderStatus.FEEDING,
        'REVEALING': OrderStatus.FEEDING,
        'CONSENSUS': OrderStatus.CONSENSUS,
        'SETTLED': OrderStatus.SETTLED,
        'DISPUTED': OrderStatus.DISPUTED,
        'CANCELLED': OrderStatus.SETTLED, // 前端没有 CANCELLED 状�?
    };
    return statusMap[status] || OrderStatus.OPEN;
}

/**
 * 计算剩余时间（秒�?
 */
function calculateTimeRemaining(expiresAt: string | Date): number {
    if (!expiresAt) return 0;
    const expiry = new Date(expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((expiry - now) / 1000));
}

/**
 * 缩短地址显示
 */
export function shortenAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * 格式化时�?
 */
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化金�?
 */
export function formatAmount(amount: number): string {
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toFixed(2);
}

/**
 * 排行榜数据转�?
 */
export function transformLeaderboardItem(item: any, index: number) {
    return {
        position: index + 1,
        address: shortenAddress(item.address),
        nickname: item.nickname || shortenAddress(item.address),
        rank: item.rank as FeederRank,
        xp: item.xp,
        feeds: item.totalFeeds,
        accuracy: (item.accuracyRate * 100).toFixed(1),
    };
}

/**
 * 仲裁案件转换
 */
export function transformArbitrationCase(backendCase: any) {
    return {
        ...backendCase,
        evidenceUrls: parseJsonArray(backendCase.evidenceUrls),
        arbitrators: parseJsonArray(backendCase.arbitrators),
    };
}

/**
 * 解析 JSON 数组
 */
function parseJsonArray(jsonStr: string | any[]): any[] {
    if (!jsonStr) return [];
    if (Array.isArray(jsonStr)) return jsonStr;
    try {
        return JSON.parse(jsonStr);
    } catch {
        return [];
    }
}


