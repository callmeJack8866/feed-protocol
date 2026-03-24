/**
 * Redis 客户端配置 — Feed Engine
 * 
 * 功能:
 * - 单例 Redis 连接（ioredis）
 * - 自动重连 + 优雅降级
 * - 连接状态查询 + 健康检查
 * 
 * @module config/redis
 */

import Redis from 'ioredis';

/** Redis 连接状态 */
let isRedisReady = false;

/** Redis 客户端单例 */
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
        if (times > 3) {
            console.warn('⚠️ Redis 不可用，已降级到内存缓存模式');
            return null; // 停止重试
        }
        const delay = Math.min(times * 1000, 3000);
        return delay;
    },
    connectTimeout: 3000,
    commandTimeout: 3000,
    enableOfflineQueue: false,
    lazyConnect: true,
});

// 尝试连接（非阻塞，失败则静默降级）
redis.connect().catch(() => {
    console.warn('⚠️ Redis 未启动，使用内存缓存模式 (开发环境可忽略)');
});

// ============ 事件监听 ============

redis.on('connect', () => {
    console.log('🔗 Redis 连接建立');
});

redis.on('ready', () => {
    isRedisReady = true;
    console.log('✅ Redis 就绪');
});

redis.on('error', () => {
    isRedisReady = false;
    // 静默处理，不再刷屏
});

redis.on('close', () => {
    isRedisReady = false;
});

// ============ 工具函数 ============

/**
 * 检查 Redis 是否可用
 * @returns {boolean} 当前连接状态
 */
export function isRedisAvailable(): boolean {
    return isRedisReady;
}

/**
 * 安全关闭 Redis 连接（进程退出时调用）
 */
export async function closeRedis(): Promise<void> {
    try {
        await redis.quit();
        console.log('✅ Redis 连接已安全关闭');
    } catch (err) {
        console.error('❌ Redis 关闭失败:', err);
        redis.disconnect();
    }
}

/**
 * Redis 健康检查
 * @returns {{ connected: boolean, latency?: number }}
 */
export async function redisHealthCheck(): Promise<{ connected: boolean; latency?: number }> {
    if (!isRedisReady) {
        return { connected: false };
    }
    try {
        const start = Date.now();
        await redis.ping();
        return { connected: true, latency: Date.now() - start };
    } catch {
        return { connected: false };
    }
}

export default redis;
