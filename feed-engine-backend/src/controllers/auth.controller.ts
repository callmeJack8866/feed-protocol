/**
 * 钱包认证控制器 — EIP-4361 SIWE (Sign-In with Ethereum)
 * 
 * 流程:
 * 1. GET  /api/auth/nonce    → 获取 nonce（Redis 存储，5分钟过期）
 * 2. POST /api/auth/verify   → 提交签名验证 + JWT 签发
 * 3. POST /api/auth/register → 设置喂价员偏好
 * 4. GET  /api/auth/profile  → 获取当前用户信息（需 JWT）
 * 5. POST /api/auth/refresh  → 刷新 JWT Token
 * 6. POST /api/auth/logout   → 登出（可选：失效 token）
 * 
 * @module controllers/auth.controller
 */

import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import redis, { isRedisAvailable } from '../config/redis';
import { signToken, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// ============ Nonce 存储 ============

/** 内存降级存储（Redis 不可用时） */
const nonceMemoryStore = new Map<string, { nonce: string; expiresAt: number }>();

/** Nonce 过期时间（5 分钟） */
const NONCE_TTL = 300;

/**
 * 存储 nonce 到 Redis（或内存）
 * @param address 钱包地址
 * @param nonce 随机 nonce
 */
async function storeNonce(address: string, nonce: string): Promise<void> {
    const key = `siwe:nonce:${address.toLowerCase()}`;
    if (isRedisAvailable()) {
        await redis.setex(key, NONCE_TTL, nonce);
    } else {
        nonceMemoryStore.set(key, {
            nonce,
            expiresAt: Date.now() + NONCE_TTL * 1000,
        });
    }
}

/**
 * 获取并消费 nonce（使用后立即删除，防重放）
 * @param address 钱包地址
 * @returns nonce 字符串 或 null
 */
async function consumeNonce(address: string): Promise<string | null> {
    const key = `siwe:nonce:${address.toLowerCase()}`;
    if (isRedisAvailable()) {
        const nonce = await redis.get(key);
        if (nonce) {
            await redis.del(key); // 消费后删除
        }
        return nonce;
    }
    // 内存降级
    const entry = nonceMemoryStore.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        nonceMemoryStore.delete(key); // 消费后删除
        return entry.nonce;
    }
    nonceMemoryStore.delete(key);
    return null;
}

// ============ EIP-4361 消息构造 ============

/**
 * 构造 EIP-4361 SIWE 消息
 * @see https://eips.ethereum.org/EIPS/eip-4361
 */
function buildSiweMessage(params: {
    address: string;
    nonce: string;
    chainId: number;
    domain: string;
    uri: string;
    issuedAt: string;
    expirationTime: string;
    statement?: string;
}): string {
    const lines = [
        `${params.domain} wants you to sign in with your Ethereum account:`,
        params.address,
        '',
        params.statement || 'Sign in to Feed Engine - Decentralized Human Oracle Network',
        '',
        `URI: ${params.uri}`,
        `Version: 1`,
        `Chain ID: ${params.chainId}`,
        `Nonce: ${params.nonce}`,
        `Issued At: ${params.issuedAt}`,
        `Expiration Time: ${params.expirationTime}`,
    ];
    return lines.join('\n');
}

/**
 * 从 EIP-4361 消息中解析字段
 * @param message EIP-4361 格式消息
 * @returns 解析后的字段 或 null
 */
function parseSiweMessage(message: string): {
    domain: string;
    address: string;
    nonce: string;
    chainId: number;
    issuedAt: string;
    expirationTime?: string;
} | null {
    try {
        const lines = message.split('\n');

        // 第 1 行: "{domain} wants you to sign in with your Ethereum account:"
        const domainMatch = lines[0]?.match(/^(.+) wants you to sign in/);
        const domain = domainMatch?.[1] || '';

        // 第 2 行: 地址
        const address = lines[1]?.trim() || '';

        // 解析键值对
        const getValue = (prefix: string): string | undefined => {
            const line = lines.find(l => l.startsWith(prefix));
            return line?.slice(prefix.length).trim();
        };

        const nonce = getValue('Nonce: ') || '';
        const chainIdStr = getValue('Chain ID: ') || '56';
        const issuedAt = getValue('Issued At: ') || '';
        const expirationTime = getValue('Expiration Time: ');

        if (!address || !nonce) return null;

        return {
            domain,
            address,
            nonce,
            chainId: parseInt(chainIdStr),
            issuedAt,
            expirationTime,
        };
    } catch {
        return null;
    }
}

// ============ API 端点 ============

/**
 * GET /api/auth/nonce
 * 获取随机 nonce（SIWE 第一步）
 * 
 * @query address - 钱包地址
 * @returns { nonce, expiresIn, message } — 预构造的 EIP-4361 消息
 */
router.get('/nonce', async (req: Request, res: Response) => {
    try {
        const { address } = req.query;

        if (!address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Wallet address required' });
        }

        // 校验地址格式
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }

        // 生成随机 nonce
        const nonce = uuidv4().replace(/-/g, '');
        await storeNonce(address, nonce);

        // 预构造 EIP-4361 消息
        const now = new Date();
        const expiresAt = new Date(now.getTime() + NONCE_TTL * 1000);
        const domain = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).host : 'localhost:5173';

        const message = buildSiweMessage({
            address: ethers.getAddress(address), // checksummed
            nonce,
            chainId: 56, // BSC
            domain,
            uri: process.env.FRONTEND_URL || 'http://localhost:5173',
            issuedAt: now.toISOString(),
            expirationTime: expiresAt.toISOString(),
        });

        res.json({
            success: true,
            nonce,
            expiresIn: NONCE_TTL,
            message, // 前端可直接使用此消息让用户签名
        });
    } catch (error) {
        console.error('Nonce error:', error);
        res.status(500).json({ error: 'Failed to generate nonce' });
    }
});

/**
 * POST /api/auth/verify
 * 验证签名并签发 JWT（SIWE 第二步）
 * 
 * @body message   - EIP-4361 格式消息
 * @body signature - 钱包签名
 * @returns { token, feeder }
 */
router.post('/verify', async (req: Request, res: Response) => {
    try {
        const { message, signature } = req.body;

        if (!message || !signature) {
            return res.status(400).json({ error: 'Message and signature required' });
        }

        // 1. 恢复签名者地址
        let recoveredAddress: string;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
        } catch {
            return res.status(401).json({ error: 'Invalid signature format' });
        }

        // 2. 解析 EIP-4361 消息
        const parsed = parseSiweMessage(message);
        if (!parsed) {
            return res.status(400).json({ error: 'Invalid EIP-4361 message format' });
        }

        // 3. 验证签名者与消息中地址一致
        if (recoveredAddress.toLowerCase() !== parsed.address.toLowerCase()) {
            return res.status(401).json({ error: 'Signer does not match message address' });
        }

        // 4. 验证 nonce（防重放攻击）
        const storedNonce = await consumeNonce(parsed.address);
        if (!storedNonce || storedNonce !== parsed.nonce) {
            return res.status(401).json({ error: 'Invalid or expired nonce' });
        }

        // 5. 验证消息未过期
        if (parsed.expirationTime) {
            const expTime = new Date(parsed.expirationTime);
            if (expTime < new Date()) {
                return res.status(401).json({ error: 'Message has expired' });
            }
        }

        // 6. 查找或创建喂价员
        const address = recoveredAddress.toLowerCase();
        let feeder = await prisma.feeder.findUnique({
            where: { address },
        });

        if (!feeder) {
            feeder = await prisma.feeder.create({
                data: {
                    address,
                    nickname: `Feeder_${address.slice(-6)}`,
                },
            });
        }

        // 7. 签发 JWT
        const token = signToken(feeder.id, address);

        res.json({
            success: true,
            token,
            feeder: {
                id: feeder.id,
                address: feeder.address,
                nickname: feeder.nickname,
                rank: feeder.rank,
                xp: feeder.xp,
                totalFeeds: feeder.totalFeeds,
                accuracyRate: feeder.accuracyRate,
                stakedAmount: feeder.stakedAmount,
                stakeType: feeder.stakeType,
            },
        });
    } catch (error) {
        console.error('SIWE verify error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * POST /api/auth/connect（向后兼容旧接口）
 * 简化签名验证（非 EIP-4361，用于开发/测试）
 */
router.post('/connect', async (req: Request, res: Response) => {
    try {
        const { address, signature, message } = req.body;

        if (!address || !signature || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 验证签名
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // 查找或创建用户
        let feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() },
        });

        if (!feeder) {
            feeder = await prisma.feeder.create({
                data: {
                    address: address.toLowerCase(),
                    nickname: `Feeder_${address.slice(-6)}`,
                },
            });
        }

        // 签发 JWT（替代旧的 UUID token）
        const token = signToken(feeder.id, address.toLowerCase());

        res.json({
            success: true,
            token,
            feeder: {
                id: feeder.id,
                address: feeder.address,
                nickname: feeder.nickname,
                rank: feeder.rank,
                xp: feeder.xp,
                totalFeeds: feeder.totalFeeds,
                accuracyRate: feeder.accuracyRate,
                stakedAmount: feeder.stakedAmount,
                stakeType: feeder.stakeType,
            },
        });
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * POST /api/auth/register
 * 喂价员注册（设置偏好），需要认证
 */
router.post('/register', requireAuth, async (req: Request, res: Response) => {
    try {
        const address = req.user!.address;
        const { nickname, countries, exchanges, assetTypes, stakeType } = req.body;

        const feeder = await prisma.feeder.upsert({
            where: { address },
            update: {
                nickname,
                countries: countries || [],
                exchanges: exchanges || [],
                assetTypes: assetTypes || [],
                stakeType: stakeType || 'USDT',
            },
            create: {
                address,
                nickname: nickname || `Feeder_${address.slice(-6)}`,
                countries: countries || [],
                exchanges: exchanges || [],
                assetTypes: assetTypes || [],
                stakeType: stakeType || 'USDT',
            },
        });

        res.json({ success: true, feeder });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * GET /api/auth/profile
 * 获取当前用户信息，需要认证
 */
router.get('/profile', requireAuth, async (req: Request, res: Response) => {
    try {
        const feeder = await prisma.feeder.findUnique({
            where: { address: req.user!.address },
            include: {
                history: {
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        res.json({ success: true, feeder });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

/**
 * POST /api/auth/refresh
 * 刷新 JWT Token（使用当前有效 Token 换取新 Token）
 */
router.post('/refresh', requireAuth, async (req: Request, res: Response) => {
    try {
        const { sub, address } = req.user!;
        const newToken = signToken(sub, address);
        res.json({ success: true, token: newToken });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

/**
 * POST /api/auth/logout
 * 登出（客户端删除 token 即可，此端点用于审计日志）
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
    try {
        // 可选：记录登出事件
        console.log(`👋 Feeder ${req.user!.address} logged out`);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

export default router;
