/**
 * 通用缓存服务 — 基于 Redis
 * 
 * 功能:
 * - get/set/del 基本操作
 * - 按前缀批量失效（invalidatePattern）
 * - Redis 不可用时自动降级到内存缓存
 * - 常用业务缓存封装（订单、排行榜、喂价员）
 * 
 * @module config/cache
 */

import redis, { isRedisAvailable } from './redis';

/** 缓存前缀常量 */
export const CACHE_PREFIX = {
    ORDER: 'cache:order:',
    ORDER_LIST: 'cache:orders:',
    FEEDER: 'cache:feeder:',
    LEADERBOARD: 'cache:leaderboard:',
    SEASON: 'cache:season:',
    ACHIEVEMENT: 'cache:achievement:',
    RATE_LIMIT: 'rl:',
} as const;

/** 默认 TTL（秒） */
export const CACHE_TTL = {
    SHORT: 30,         // 30 秒 — 订单列表等高频变更数据
    MEDIUM: 300,       // 5 分钟 — 喂价员详情
    LONG: 1800,        // 30 分钟 — 排行榜
    DAY: 86400,        // 1 天 — 赛季、成就定义等
} as const;

// ============ 内存降级缓存 ============

const memoryCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * 清理过期内存缓存（每 2 分钟）
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
        if (now >= entry.expiresAt) {
            memoryCache.delete(key);
        }
    }
}, 120_000);

// ============ 核心操作 ============

/**
 * 从缓存获取数据
 * @param key 缓存键
 * @returns 缓存值或 null
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
    try {
        if (isRedisAvailable()) {
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        // 降级到内存
        const entry = memoryCache.get(key);
        if (entry && Date.now() < entry.expiresAt) {
            return JSON.parse(entry.value);
        }
        return null;
    } catch (err) {
        console.error(`缓存读取失败 [${key}]:`, err);
        return null;
    }
}

/**
 * 写入缓存
 * @param key 缓存键
 * @param value 缓存值（自动 JSON 序列化）
 * @param ttl 过期时间（秒），默认 5 分钟
 */
export async function cacheSet(key: string, value: any, ttl: number = CACHE_TTL.MEDIUM): Promise<void> {
    try {
        const serialized = JSON.stringify(value);
        if (isRedisAvailable()) {
            await redis.setex(key, ttl, serialized);
        } else {
            memoryCache.set(key, {
                value: serialized,
                expiresAt: Date.now() + ttl * 1000,
            });
        }
    } catch (err) {
        console.error(`缓存写入失败 [${key}]:`, err);
    }
}

/**
 * 删除指定缓存键
 * @param key 缓存键
 */
export async function cacheDel(key: string): Promise<void> {
    try {
        if (isRedisAvailable()) {
            await redis.del(key);
        }
        memoryCache.delete(key);
    } catch (err) {
        console.error(`缓存删除失败 [${key}]:`, err);
    }
}

/**
 * 按前缀批量失效缓存
 * @param pattern 匹配模式（如 "cache:order:*"）
 */
export async function cacheInvalidatePattern(pattern: string): Promise<number> {
    try {
        if (!isRedisAvailable()) {
            // 内存模式：遍历删除
            let count = 0;
            const prefix = pattern.replace('*', '');
            for (const key of memoryCache.keys()) {
                if (key.startsWith(prefix)) {
                    memoryCache.delete(key);
                    count++;
                }
            }
            return count;
        }

        // Redis SCAN 模式删除（避免 KEYS 阻塞）
        let cursor = '0';
        let totalDeleted = 0;
        do {
            const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await redis.del(...keys);
                totalDeleted += keys.length;
            }
        } while (cursor !== '0');

        return totalDeleted;
    } catch (err) {
        console.error(`缓存批量失效失败 [${pattern}]:`, err);
        return 0;
    }
}

// ============ 业务级缓存封装 ============

/**
 * 缓存或获取：先查缓存，未命中则查库并写入缓存
 * @param key 缓存键
 * @param fetcher 数据获取函数
 * @param ttl 过期时间（秒）
 * @returns 数据
 */
export async function cacheOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM
): Promise<T> {
    const cached = await cacheGet<T>(key);
    if (cached !== null) {
        return cached;
    }
    const data = await fetcher();
    await cacheSet(key, data, ttl);
    return data;
}

/**
 * 失效订单相关缓存
 * @param orderId 订单 ID（可选，不传则清除所有订单缓存）
 */
export async function invalidateOrderCache(orderId?: string): Promise<void> {
    if (orderId) {
        await cacheDel(`${CACHE_PREFIX.ORDER}${orderId}`);
    }
    // 订单列表缓存全部失效
    await cacheInvalidatePattern(`${CACHE_PREFIX.ORDER_LIST}*`);
}

/**
 * 失效喂价员相关缓存
 * @param feederId 喂价员 ID
 */
export async function invalidateFeederCache(feederId: string): Promise<void> {
    await cacheDel(`${CACHE_PREFIX.FEEDER}${feederId}`);
    // 排行榜也需要失效
    await cacheInvalidatePattern(`${CACHE_PREFIX.LEADERBOARD}*`);
}

/**
 * 失效排行榜缓存
 */
export async function invalidateLeaderboardCache(): Promise<void> {
    await cacheInvalidatePattern(`${CACHE_PREFIX.LEADERBOARD}*`);
}

export default {
    get: cacheGet,
    set: cacheSet,
    del: cacheDel,
    invalidatePattern: cacheInvalidatePattern,
    getOrFetch: cacheOrFetch,
    invalidateOrderCache,
    invalidateFeederCache,
    invalidateLeaderboardCache,
    CACHE_PREFIX,
    CACHE_TTL,
};
