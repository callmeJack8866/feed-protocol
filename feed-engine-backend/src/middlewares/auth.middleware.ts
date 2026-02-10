/**
 * JWT 认证中间件 — Feed Engine
 * 
 * 功能:
 * - JWT Token 验证（从 Authorization: Bearer <token> 提取）
 * - 解析 payload 并注入 req.user
 * - 可选认证（不阻止无 token 请求）和强制认证两种模式
 * - 管理员权限验证
 * 
 * @module middlewares/auth.middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/** JWT Payload 类型 */
export interface JwtPayload {
    /** 喂价员 ID */
    sub: string;
    /** 钱包地址（小写） */
    address: string;
    /** 签发时间 */
    iat?: number;
    /** 过期时间 */
    exp?: number;
}

/** 扩展 Express Request 类型 */
declare global {
    namespace Express {
        interface Request {
            /** JWT 解析后的用户信息 */
            user?: JwtPayload;
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'feed-engine-dev-secret-2026';
const JWT_EXPIRES_IN = '7d'; // Token 有效期 7 天

// ============ Token 工具函数 ============

/**
 * 签发 JWT Token
 * @param feederId 喂价员 ID
 * @param address 钱包地址
 * @returns JWT Token 字符串
 */
export function signToken(feederId: string, address: string): string {
    const payload: JwtPayload = {
        sub: feederId,
        address: address.toLowerCase(),
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证并解析 JWT Token
 * @param token JWT Token 字符串
 * @returns 解析后的 payload 或 null
 */
export function verifyToken(token: string): JwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
        return null;
    }
}

// ============ 中间件 ============

/**
 * 从请求中提取 Token
 * 支持: Authorization: Bearer <token>
 */
function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return null;
}

/**
 * 强制认证中间件
 * 无有效 Token 返回 401
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = extractToken(req);

    if (!token) {
        res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
        return;
    }

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
        return;
    }

    req.user = payload;

    // 兼容性：同时设置 x-wallet-address header（向后兼容旧代码）
    req.headers['x-wallet-address'] = payload.address;

    next();
}

/**
 * 可选认证中间件
 * 有 Token 则解析，无 Token 也允许通过
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    const token = extractToken(req);

    if (token) {
        const payload = verifyToken(token);
        if (payload) {
            req.user = payload;
            req.headers['x-wallet-address'] = payload.address;
        }
    }

    next();
}

/**
 * 管理员认证中间件
 * 检查 JWT Token 并验证管理员白名单
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
    const token = extractToken(req);

    if (!token) {
        // 兼容旧的 x-wallet-address 模式（开发环境）
        const address = req.headers['x-wallet-address'] as string;
        if (process.env.NODE_ENV === 'development' && address) {
            req.headers['x-wallet-address'] = address.toLowerCase();
            return next();
        }
        res.status(401).json({ error: 'Admin authentication required' });
        return;
    }

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }

    req.user = payload;
    req.headers['x-wallet-address'] = payload.address;

    // 管理员白名单检查
    const adminAddresses = (process.env.ADMIN_ADDRESSES || '').toLowerCase().split(',').filter(Boolean);

    if (adminAddresses.length > 0 && !adminAddresses.includes(payload.address)) {
        res.status(403).json({ error: 'Admin access denied' });
        return;
    }

    next();
}
