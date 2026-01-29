import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';

const router = Router();

/**
 * POST /api/auth/connect
 * 钱包签名登录
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
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            feeder = await prisma.feeder.create({
                data: {
                    address: address.toLowerCase(),
                    nickname: `Feeder_${address.slice(-6)}`
                }
            });
        }

        // TODO: 生成 JWT token
        const token = uuidv4(); // 临时使用 UUID

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
                stakeType: feeder.stakeType
            }
        });
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * POST /api/auth/register
 * 喂价员注册（设置偏好）
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { address, nickname, countries, exchanges, assetTypes, stakeType } = req.body;

        if (!address) {
            return res.status(400).json({ error: 'Address required' });
        }

        const feeder = await prisma.feeder.upsert({
            where: { address: address.toLowerCase() },
            update: {
                nickname,
                countries: countries || [],
                exchanges: exchanges || [],
                assetTypes: assetTypes || [],
                stakeType: stakeType || 'USDT'
            },
            create: {
                address: address.toLowerCase(),
                nickname: nickname || `Feeder_${address.slice(-6)}`,
                countries: countries || [],
                exchanges: exchanges || [],
                assetTypes: assetTypes || [],
                stakeType: stakeType || 'USDT'
            }
        });

        res.json({ success: true, feeder });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * GET /api/auth/profile
 * 获取当前用户信息
 */
router.get('/profile', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() },
            include: {
                history: {
                    take: 10,
                    orderBy: { createdAt: 'desc' }
                }
            }
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

export default router;
