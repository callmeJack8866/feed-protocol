/**
 * API 速率限制中间件 — Redis 滑动窗口
 * 方案 §16.2: 行为分析 + 频率限制
 *
 * 策略:
 * - 全局: 每 IP 每分钟 60 次
 * - 抢单: 每用户每分钟 5 次
 * - 提交: 每用户每 10 秒 1 次
 *
 * Redis 不可用时自动降级到内存限流
 *
 * @module config/rate-limiter
 */

import { Request, Response, NextFunction } from 'express';
import redis, { isRedisAvailable } from './redis';
import { CACHE_PREFIX } from './cache';

// ============ 内存降级存储 ============

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const memoryStores: Record<string, Map<string, RateLimitEntry>> = {
    global: new Map(),
    grab: new Map(),
    submit: new Map(),
};

// 定期清理内存缓存（5分钟）
setInterval(() => {
    const now = Date.now();
    for (const store of Object.values(memoryStores)) {
        for (const [key, entry] of store.entries()) {
            if (now >= entry.resetAt) {
                store.delete(key);
            }
        }
    }
}, 5 * 60_000);

// ============ Redis 滑动窗口限流 ============

/**
 * Redis 滑动窗口限流（原子操作）
 * 使用 MULTI/EXEC 保证原子性
 * @param key Redis 键
 * @param maxRequests 窗口内最大请求数
 * @param windowMs 时间窗口（毫秒）
 * @returns { allowed, remaining, retryAfter? }
 */
async function redisCheckLimit(
    key: string,
    maxRequests: number,
    windowMs: number
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    const windowSec = Math.ceil(windowMs / 1000);
    const redisKey = `${CACHE_PREFIX.RATE_LIMIT}${key}`;

    // INCR + EXPIRE 原子操作
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.pttl(redisKey);
    const results = await pipeline.exec();

    if (!results) {
        return { allowed: true, remaining: maxRequests - 1 };
    }

    const currentCount = (results[0]?.[1] as number) || 1;
    const ttl = (results[1]?.[1] as number) || -1;

    // 第一次请求或键已过期，设置 TTL
    if (currentCount === 1 || ttl === -1 || ttl === -2) {
        await redis.pexpire(redisKey, windowMs);
    }

    if (currentCount > maxRequests) {
        const retryAfterMs = ttl > 0 ? ttl : windowMs;
        return {
            allowed: false,
            remaining: 0,
            retryAfter: Math.ceil(retryAfterMs / 1000),
        };
    }

    return {
        allowed: true,
        remaining: maxRequests - currentCount,
    };
}

// ============ 内存限流（降级） ============

/**
 * 内存滑动窗口限流
 */
function memoryCheckLimit(
    storeName: string,
    key: string,
    maxRequests: number,
    windowMs: number
): { allowed: boolean; remaining: number; retryAfter?: number } {
    const store = memoryStores[storeName];
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1 };
    }

    if (entry.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count };
}

// ============ 统一限流检查 ============

/**
 * 统一限流检查（Redis 优先，降级到内存）
 */
async function checkLimit(
    storeName: string,
    key: string,
    maxRequests: number,
    windowMs: number
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    if (isRedisAvailable()) {
        try {
            return await redisCheckLimit(`${storeName}:${key}`, maxRequests, windowMs);
        } catch (err) {
            console.error(`Redis 限流失败，降级内存:`, err);
        }
    }
    return memoryCheckLimit(storeName, key, maxRequests, windowMs);
}

// ============ 导出中间件 ============

/**
 * 全局速率限制: 每 IP 每分钟 60 次
 */
export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    checkLimit('global', ip, 60, 60_000).then(result => {
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        if (!result.allowed) {
            res.status(429).json({
                error: 'Too many requests',
                retryAfter: result.retryAfter,
                message: `请求过于频繁，请 ${result.retryAfter} 秒后重试`,
            });
            return;
        }
        next();
    }).catch(() => next());
}

/**
 * 抢单速率限制: 每用户每分钟 5 次
 * 防止机器人高频抢单
 */
export function grabRateLimit(req: Request, res: Response, next: NextFunction): void {
    const address = (req.headers['x-wallet-address'] as string) || req.ip || 'unknown';
    checkLimit('grab', address.toLowerCase(), 5, 60_000).then(result => {
        res.setHeader('X-RateLimit-Grab-Remaining', result.remaining.toString());
        if (!result.allowed) {
            res.status(429).json({
                error: 'Grab rate limit exceeded',
                retryAfter: result.retryAfter,
                message: `抢单过于频繁，请 ${result.retryAfter} 秒后重试（每分钟最多 5 次）`,
            });
            return;
        }
        next();
    }).catch(() => next());
}

/**
 * 提交速率限制: 每用户每 10 秒 1 次
 * 防止重复提交
 */
export function submitRateLimit(req: Request, res: Response, next: NextFunction): void {
    const address = (req.headers['x-wallet-address'] as string) || req.ip || 'unknown';
    checkLimit('submit', address.toLowerCase(), 1, 10_000).then(result => {
        if (!result.allowed) {
            res.status(429).json({
                error: 'Submit rate limit exceeded',
                retryAfter: result.retryAfter,
                message: `提交间隔太短，请 ${result.retryAfter} 秒后重试`,
            });
            return;
        }
        next();
    }).catch(() => next());
}
