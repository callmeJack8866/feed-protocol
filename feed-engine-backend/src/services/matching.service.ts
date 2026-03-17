import prisma from '../config/database';
import { Order, Feeder } from '@prisma/client';

/**
 * 智能订单匹配服务
 * 根据喂价员的偏好设置（国家、交易所、资产类型）匹配订单
 */

/**
 * 安全地将 Prisma Json 字段转为 string[]
 * @param jsonValue Prisma Json 类型值（已自动反序列化）
 */
function toStringArray(jsonValue: any): string[] {
    if (Array.isArray(jsonValue)) {
        return jsonValue as string[];
    }
    if (typeof jsonValue === 'string') {
        try {
            const arr = JSON.parse(jsonValue);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * 为喂价员匹配适合的订单
 */
export async function matchOrdersForFeeder(feederId: string): Promise<Order[]> {
    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId }
    });

    if (!feeder) {
        return [];
    }

    // 解析喂价员偏好 (PostgreSQL Json 类型自动反序列化)
    const countries = toStringArray(feeder.countries);
    const exchanges = toStringArray(feeder.exchanges);
    const assetTypes = toStringArray(feeder.assetTypes);

    const where: any = {
        status: { in: ['OPEN', 'GRABBED'] },
        expiresAt: { gt: new Date() }
    };

    // 根据喂价员偏好筛选
    if (countries.length > 0) {
        where.country = { in: countries };
    }

    if (exchanges.length > 0) {
        where.exchange = { in: exchanges };
    }

    if (assetTypes.length > 0) {
        where.market = { in: assetTypes };
    }

    // 根据等级限制高价值订单
    const rankLimits: Record<string, number> = {
        'F': 100000,    // 10万U
        'E': 200000,
        'D': 500000,
        'C': 1000000,   // 100万U
        'B': 2000000,
        'A': 5000000,   // 500万U
        'S': Infinity   // 无限制
    };

    const maxNotional = rankLimits[feeder.rank] || 100000;
    where.notionalAmount = { lte: maxNotional };

    const orders = await prisma.order.findMany({
        where,
        orderBy: [
            { rewardAmount: 'desc' },
            { createdAt: 'asc' }
        ],
        take: 50,
        include: {
            submissions: {
                select: { feederId: true }
            }
        }
    });

    // 过滤掉已经抢过的订单
    return orders.filter(order =>
        !order.submissions.some(s => s.feederId === feederId)
    );
}

/**
 * 为订单匹配合适的喂价员（带权重排序 — 方案 §5.2）
 * 优先级权重：准确率 40% + 响应速度 30% + 等级 30%
 */
export async function matchFeedersForOrder(orderId: string): Promise<Feeder[]> {
    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return [];
    }

    // 获取所有非禁用喂价员
    const allFeeders = await prisma.feeder.findMany({
        where: { isBanned: false }
    });

    // 在内存中过滤
    const requiredRank = getRequiredRank(order.notionalAmount);

    const qualified = allFeeders.filter(feeder => {
        const countries = toStringArray(feeder.countries);
        const exchanges = toStringArray(feeder.exchanges);
        const assetTypes = toStringArray(feeder.assetTypes);

        // 等级检查
        if (getRankLevel(feeder.rank) < getRankLevel(requiredRank)) {
            return false;
        }

        // 国家检查（如果没有设置偏好，则匹配所有）
        if (countries.length > 0 && !countries.includes(order.country)) {
            return false;
        }

        // 交易所检查（方案 §5.1: 喂价员选择的交易所包含该订单交易所）
        if (exchanges.length > 0 && !exchanges.includes(order.exchange)) {
            return false;
        }

        // 资产类型检查（方案 §5.1: 喂价员选择的资产类型匹配）
        if (assetTypes.length > 0 && !assetTypes.includes(order.market)) {
            return false;
        }

        return true;
    });

    // === 方案 §5.2: 权重排序 ===
    // 准确率 40% + 响应速度(totalFeeds作代理) 30% + 等级 30%
    const maxFeeds = Math.max(...qualified.map(f => f.totalFeeds), 1);

    const scored = qualified.map(feeder => {
        const accuracyScore = (feeder.accuracyRate / 100) * 0.4;               // 40% 准确率
        const speedScore = (feeder.totalFeeds / maxFeeds) * 0.3;               // 30% 经验/速度
        const rankScore = (getRankLevel(feeder.rank) / 7) * 0.3;              // 30% 等级
        const totalScore = accuracyScore + speedScore + rankScore;
        return { feeder, totalScore };
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);

    return scored.map(s => s.feeder).slice(0, 100);
}

/**
 * 获取订单所需的最低等级
 */
function getRequiredRank(notionalAmount: number): string {
    if (notionalAmount >= 1000000) return 'A'; // 100万U 以上需要 A 级
    if (notionalAmount >= 500000) return 'B';
    if (notionalAmount >= 100000) return 'C';
    return 'F';
}

/**
 * 等级转数值
 */
function getRankLevel(rank: string): number {
    const levels: Record<string, number> = {
        'F': 1, 'E': 2, 'D': 3, 'C': 4, 'B': 5, 'A': 6, 'S': 7
    };
    return levels[rank] || 1;
}

