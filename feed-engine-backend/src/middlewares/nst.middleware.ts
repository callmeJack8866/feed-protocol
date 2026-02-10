/**
 * NST 协议 API Key 认证中间件
 * 
 * 功能:
 * - 验证 x-api-key header 中的 API Key
 * - 支持多 Key（逗号分隔配置）
 * - 注入 req.protocolName 标识来源协议
 * - 独立于 JWT 认证体系，专用于第三方协议接入
 * 
 * @module middlewares/nst.middleware
 */

import { Request, Response, NextFunction } from 'express';

/** 扩展 Express Request — 协议认证信息 */
declare global {
    namespace Express {
        interface Request {
            /** 来源协议名称（由 API Key 映射） */
            protocolName?: string;
            /** API Key（已验证） */
            apiKey?: string;
        }
    }
}

/**
 * API Key 配置
 * 格式: KEY1:PROTOCOL_NAME,KEY2:PROTOCOL_NAME
 * 示例: abc123:NST,def456:DEFI_PROTOCOL
 */
interface ApiKeyEntry {
    key: string;
    protocol: string;
}

/**
 * 解析 .env 中的 API Key 配置
 * @returns API Key 映射表
 */
function parseApiKeys(): ApiKeyEntry[] {
    const raw = process.env.PROTOCOL_API_KEYS || process.env.NST_API_KEYS || '';
    if (!raw) return [];

    return raw.split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
            const [key, protocol] = entry.split(':');
            return {
                key: key?.trim() || '',
                protocol: protocol?.trim() || 'UNKNOWN'
            };
        })
        .filter(e => e.key.length > 0);
}

/** 缓存解析结果 */
let _cachedKeys: ApiKeyEntry[] | null = null;

/**
 * 获取 API Key 列表（带缓存）
 */
function getApiKeys(): ApiKeyEntry[] {
    if (!_cachedKeys) {
        _cachedKeys = parseApiKeys();
    }
    return _cachedKeys;
}

/**
 * 清除 API Key 缓存（用于热更新）
 */
export function clearApiKeyCache(): void {
    _cachedKeys = null;
}

/**
 * 协议 API Key 认证中间件
 * 
 * 验证 x-api-key header，成功后注入：
 * - req.protocolName — 来源协议名
 * - req.apiKey — 已验证的 Key
 * 
 * @example
 * router.post('/request-feed', requireApiKey, handler);
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
        res.status(401).json({
            success: false,
            error: 'API key required',
            code: 'NO_API_KEY',
            hint: 'Include x-api-key header in your request'
        });
        return;
    }

    const keys = getApiKeys();

    // 开发环境：如果没有配置任何 Key，允许任意 Key 通过
    if (keys.length === 0 && process.env.NODE_ENV === 'development') {
        console.warn('⚠️ No PROTOCOL_API_KEYS configured — dev mode allows any key');
        req.protocolName = 'DEV_PROTOCOL';
        req.apiKey = apiKey;
        return next();
    }

    if (keys.length === 0) {
        res.status(503).json({
            success: false,
            error: 'Protocol integration not configured',
            code: 'NOT_CONFIGURED'
        });
        return;
    }

    // 查找匹配的 Key
    const matched = keys.find(k => k.key === apiKey);

    if (!matched) {
        res.status(403).json({
            success: false,
            error: 'Invalid API key',
            code: 'INVALID_API_KEY'
        });
        return;
    }

    // 注入协议信息
    req.protocolName = matched.protocol;
    req.apiKey = apiKey;

    next();
}

/**
 * 可选 API Key 中间件
 * 有 Key 则验证并注入，无 Key 也通过
 */
export function optionalApiKey(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'] as string;

    if (apiKey) {
        const keys = getApiKeys();
        const matched = keys.find(k => k.key === apiKey);
        if (matched) {
            req.protocolName = matched.protocol;
            req.apiKey = apiKey;
        }
    }

    next();
}
