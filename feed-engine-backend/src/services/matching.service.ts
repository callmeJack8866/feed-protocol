import prisma from '../config/database';
import { Order, Feeder } from '@prisma/client';

/**
 * 智能订单匹配服务
 * 根据喂价员的偏好设置（国家、交易所、资产类型）匹配订单
 */

/**
 * 解析 JSON 字符串为数组
 */
function parseJsonArray(jsonStr: string): string[] {
    try {
        const arr = JSON.parse(jsonStr);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
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

    // 解析喂价员偏好
    const countries = parseJsonArray(feeder.countries);
    const exchanges = parseJsonArray(feeder.exchanges);
    const assetTypes = parseJsonArray(feeder.assetTypes);

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
 * 为订单匹配合适的喂价员（内存过滤版本，适配 SQLite）
 */
export async function matchFeedersForOrder(orderId: string): Promise<Feeder[]> {
    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return [];
    }

    // SQLite 不支持数组查询，先获取所有非禁用喂价员
    const allFeeders = await prisma.feeder.findMany({
        where: { isBanned: false },
        orderBy: [
            { accuracyRate: 'desc' },
            { totalFeeds: 'desc' }
        ]
    });

    // 在内存中过滤
    const requiredRank = getRequiredRank(order.notionalAmount);

    return allFeeders.filter(feeder => {
        const countries = parseJsonArray(feeder.countries);

        // 等级检查
        if (getRankLevel(feeder.rank) < getRankLevel(requiredRank)) {
            return false;
        }

        // 国家检查（如果没有设置偏好，则匹配所有）
        if (countries.length > 0 && !countries.includes(order.country)) {
            return false;
        }

        return true;
    }).slice(0, 100);
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
