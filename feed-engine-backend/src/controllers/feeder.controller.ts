import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { cacheOrFetch, CACHE_PREFIX, CACHE_TTL } from '../config/cache';

const router = Router();

/**
 * GET /api/feeders/me
 * 获取当前喂价员详细信息
 */
router.get('/me', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() },
            include: {
                history: {
                    take: 20,
                    orderBy: { createdAt: 'desc' }
                },
                dailyTasks: {
                    where: {
                        date: new Date(new Date().toDateString())
                    }
                }
            }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        res.json({ success: true, feeder });
    } catch (error) {
        console.error('Get feeder error:', error);
        res.status(500).json({ error: 'Failed to get feeder' });
    }
});

/**
 * PUT /api/feeders/preferences
 * 更新偏好设置
 */
router.put('/preferences', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;
        const { countries, exchanges, assetTypes } = req.body;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.update({
            where: { address: address.toLowerCase() },
            data: {
                countries: countries || [],
                exchanges: exchanges || [],
                assetTypes: assetTypes || []
            }
        });

        res.json({ success: true, feeder });
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

/**
 * GET /api/feeders/history
 * 获取喂价历史
 */
router.get('/history', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;
        const { page = 1, limit = 20 } = req.query;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [history, total] = await Promise.all([
            prisma.feedHistory.findMany({
                where: { feederId: feeder.id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit)
            }),
            prisma.feedHistory.count({
                where: { feederId: feeder.id }
            })
        ]);

        res.json({
            success: true,
            history,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

/**
 * GET /api/feeders/leaderboard
 * 获取排行榜
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
    try {
        const { type = 'xp', limit = 50 } = req.query;
        const cacheKey = `${CACHE_PREFIX.LEADERBOARD}${type}:${limit}`;

        const leaderboard = await cacheOrFetch(cacheKey, async () => {
            let orderBy: any = { xp: 'desc' };
            if (type === 'feeds') orderBy = { totalFeeds: 'desc' };
            if (type === 'accuracy') orderBy = { accuracyRate: 'desc' };
            if (type === 'staking') orderBy = { stakedAmount: 'desc' };

            const feeders = await prisma.feeder.findMany({
                where: { isBanned: false },
                orderBy,
                take: Number(limit),
                select: {
                    id: true,
                    address: true,
                    nickname: true,
                    rank: true,
                    xp: true,
                    totalFeeds: true,
                    accuracyRate: true,
                    stakedAmount: true
                }
            });

            return feeders.map((feeder, index) => ({
                ...feeder,
                position: index + 1
            }));
        }, CACHE_TTL.LONG); // 30分钟缓存

        res.json({ success: true, leaderboard });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

/**
 * GET /api/feeders/daily-tasks
 * 获取每日任务进度
 */
router.get('/daily-tasks', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const today = new Date(new Date().toDateString());

        let dailyTask = await prisma.dailyTask.findUnique({
            where: {
                feederId_date: { feederId: feeder.id, date: today }
            }
        });

        // 如果今天没有记录，创建一个
        if (!dailyTask) {
            dailyTask = await prisma.dailyTask.create({
                data: {
                    feederId: feeder.id,
                    date: today
                }
            });
        }

        res.json({ success: true, dailyTask });
    } catch (error) {
        console.error('Get daily tasks error:', error);
        res.status(500).json({ error: 'Failed to get daily tasks' });
    }
});

export default router;
