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
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
        if (times > 10) {
            console.error('❌ Redis 连接重试超过 10 次，停止重试');
            return null;
        }
        const delay = Math.min(times * 500, 5000);
        console.log(`🔄 Redis 重连中... 第 ${times} 次 (${delay}ms 后)`);
        return delay;
    },
    connectTimeout: 10000,
    commandTimeout: 5000,
    enableOfflineQueue: true,
    lazyConnect: false,
});

// ============ 事件监听 ============

redis.on('connect', () => {
    console.log('🔗 Redis 连接建立');
});

redis.on('ready', () => {
    isRedisReady = true;
    console.log('✅ Redis 就绪');
});

redis.on('error', (err) => {
    isRedisReady = false;
    console.error('❌ Redis 错误:', err.message);
});

redis.on('close', () => {
    isRedisReady = false;
    console.log('🔌 Redis 连接关闭');
});

redis.on('reconnecting', () => {
    console.log('🔄 Redis 重连中...');
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
