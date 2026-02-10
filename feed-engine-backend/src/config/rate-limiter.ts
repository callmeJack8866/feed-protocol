import { Request, Response, NextFunction } from 'express';

/**
 * API 速率限制中间件 — 防机器人抢单
 * 方案 §16.2: 行为分析 + 频率限制
 *
 * 策略:
 * - 全局: 每 IP 每分钟 60 次
 * - 抢单: 每用户每分钟 5 次
 * - 提交: 每用户每 10 秒 1 次
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// 内存存储（生产环境应使用 Redis）
const globalStore = new Map<string, RateLimitEntry>();
const grabStore = new Map<string, RateLimitEntry>();
const submitStore = new Map<string, RateLimitEntry>();

/**
 * 通用速率限制检查
 * @param store 存储 Map
 * @param key 限制键
 * @param maxRequests 窗口内最大请求数
 * @param windowMs 时间窗口（毫秒）
 * @returns { allowed: boolean, remaining: number, retryAfter?: number }
 */
function checkLimit(
    store: Map<string, RateLimitEntry>,
    key: string,
    maxRequests: number,
    windowMs: number
): { allowed: boolean; remaining: number; retryAfter?: number } {
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
            retryAfter: Math.ceil((entry.resetAt - now) / 1000)
        };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count };
}

/**
 * 全局速率限制: 每 IP 每分钟 60 次
 */
export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const result = checkLimit(globalStore, ip, 60, 60_000);

    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());

    if (!result.allowed) {
        res.status(429).json({
            error: 'Too many requests',
            retryAfter: result.retryAfter,
            message: `请求过于频繁，请 ${result.retryAfter} 秒后重试`
        });
        return;
    }
    next();
}

/**
 * 抢单速率限制: 每用户每分钟 5 次
 * 防止机器人高频抢单
 */
export function grabRateLimit(req: Request, res: Response, next: NextFunction): void {
    const address = (req.headers['x-wallet-address'] as string) || req.ip || 'unknown';
    const result = checkLimit(grabStore, address.toLowerCase(), 5, 60_000);

    res.setHeader('X-RateLimit-Grab-Remaining', result.remaining.toString());

    if (!result.allowed) {
        res.status(429).json({
            error: 'Grab rate limit exceeded',
            retryAfter: result.retryAfter,
            message: `抢单过于频繁，请 ${result.retryAfter} 秒后重试（每分钟最多 5 次）`
        });
        return;
    }
    next();
}

/**
 * 提交速率限制: 每用户每 10 秒 1 次
 * 防止重复提交
 */
export function submitRateLimit(req: Request, res: Response, next: NextFunction): void {
    const address = (req.headers['x-wallet-address'] as string) || req.ip || 'unknown';
    const result = checkLimit(submitStore, address.toLowerCase(), 1, 10_000);

    if (!result.allowed) {
        res.status(429).json({
            error: 'Submit rate limit exceeded',
            retryAfter: result.retryAfter,
            message: `提交间隔太短，请 ${result.retryAfter} 秒后重试`
        });
        return;
    }
    next();
}

/**
 * 定期清理过期条目（防内存泄漏）
 * 每 5 分钟清理一次
 */
function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const store of [globalStore, grabStore, submitStore]) {
        for (const [key, entry] of store.entries()) {
            if (now >= entry.resetAt) {
                store.delete(key);
            }
        }
    }
}

setInterval(cleanupExpiredEntries, 5 * 60_000);
