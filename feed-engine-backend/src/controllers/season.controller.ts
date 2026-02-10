import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// ============================================
// 赛季管理 API
// ============================================

/**
 * GET /api/seasons
 * 获取赛季列表
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { status, limit = 10 } = req.query;

        const where: any = {};
        if (status) where.status = status;

        const seasons = await prisma.season.findMany({
            where,
            orderBy: { startDate: 'desc' },
            take: Number(limit)
        });

        res.json({ success: true, seasons });
    } catch (error) {
        console.error('Get seasons error:', error);
        res.status(500).json({ error: 'Failed to get seasons' });
    }
});

/**
 * GET /api/seasons/current
 * 获取当前赛季
 */
router.get('/current', async (req: Request, res: Response) => {
    try {
        const now = new Date();

        // 查找当前进行中的赛季
        let season = await prisma.season.findFirst({
            where: { status: 'ACTIVE' }
        });

        // 如果没有进行中的赛季，查找最近的
        if (!season) {
            season = await prisma.season.findFirst({
                where: {
                    startDate: { lte: now }
                },
                orderBy: { startDate: 'desc' }
            });
        }

        // 如果还是没有，自动创建当前月份的赛季
        if (!season) {
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const code = `${year}-${String(month).padStart(2, '0')}`;
            const startDate = new Date(year, now.getMonth(), 1);
            const endDate = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

            season = await prisma.season.create({
                data: {
                    name: `${year}年${month}月赛季`,
                    code,
                    startDate,
                    endDate,
                    status: 'ACTIVE',
                    rewardConfig: JSON.stringify({
                        1: { feed: 5000, xp: 2000, nft: true },
                        2: { feed: 3000, xp: 1500, nft: true },
                        3: { feed: 3000, xp: 1500, nft: true },
                        '4-10': { feed: 1500, xp: 1000, nft: false },
                        '11-50': { feed: 500, xp: 500, nft: false },
                        '51-100': { feed: 200, xp: 300, nft: false }
                    })
                }
            });
        }

        res.json({ success: true, season });
    } catch (error) {
        console.error('Get current season error:', error);
        res.status(500).json({ error: 'Failed to get current season' });
    }
});

/**
 * GET /api/seasons/:code/leaderboard
 * 获取赛季排行榜
 */
router.get('/:code/leaderboard', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;
        const { type = 'OVERALL', limit = 100 } = req.query;

        // 检查赛季是否存在
        const season = await prisma.season.findUnique({
            where: { code }
        });

        // 如果赛季已结束，从快照获取
        if (season?.status === 'SETTLED' || season?.status === 'ENDED') {
            const snapshots = await prisma.seasonSnapshot.findMany({
                where: {
                    season: code,
                    rankType: type as string
                },
                orderBy: { rank: 'asc' },
                take: Number(limit)
            });

            return res.json({
                success: true,
                leaderboard: snapshots,
                source: 'snapshot'
            });
        }

        // 进行中的赛季，实时计算排行榜
        let orderBy: any = { xp: 'desc' };
        if (type === 'FEEDS') orderBy = { totalFeeds: 'desc' };
        if (type === 'ACCURACY') orderBy = { accuracyRate: 'desc' };
        if (type === 'STAKING') orderBy = { stakedAmount: 'desc' }; // 方案 §4.7: 第4维度

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
                stakedAmount: true  // 方案 §4.7: 质押量排行
            }
        });

        const leaderboard = feeders.map((feeder, index) => ({
            ...feeder,
            position: index + 1,
            rankType: type
        }));

        res.json({
            success: true,
            leaderboard,
            source: 'realtime'
        });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

/**
 * GET /api/seasons/:code/my-rank
 * 获取当前用户在赛季中的排名
 */
router.get('/:code/my-rank', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;
        const { code } = req.params;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 计算各维度排名
        const [xpRank, feedsRank, accuracyRank, stakingRank] = await Promise.all([
            prisma.feeder.count({
                where: { xp: { gt: feeder.xp }, isBanned: false }
            }),
            prisma.feeder.count({
                where: { totalFeeds: { gt: feeder.totalFeeds }, isBanned: false }
            }),
            prisma.feeder.count({
                where: { accuracyRate: { gt: feeder.accuracyRate }, isBanned: false }
            }),
            prisma.feeder.count({
                where: { stakedAmount: { gt: feeder.stakedAmount }, isBanned: false }
            })
        ]);

        res.json({
            success: true,
            ranks: {
                overall: xpRank + 1,
                feeds: feedsRank + 1,
                accuracy: accuracyRank + 1,
                staking: stakingRank + 1  // 方案 §4.7: 质押量排名
            },
            stats: {
                xp: feeder.xp,
                totalFeeds: feeder.totalFeeds,
                accuracyRate: feeder.accuracyRate,
                stakedAmount: feeder.stakedAmount  // 方案 §4.7
            }
        });
    } catch (error) {
        console.error('Get my rank error:', error);
        res.status(500).json({ error: 'Failed to get rank' });
    }
});

/**
 * GET /api/seasons/:code/rewards
 * 获取赛季奖励信息
 */
router.get('/:code/rewards', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;

        const season = await prisma.season.findUnique({
            where: { code }
        });

        if (!season) {
            return res.status(404).json({ error: 'Season not found' });
        }

        let rewardConfig = {};
        try {
            rewardConfig = JSON.parse(season.rewardConfig);
        } catch (e) {
            console.error('Parse reward config error:', e);
        }

        res.json({
            success: true,
            season: {
                code: season.code,
                name: season.name,
                status: season.status,
                startDate: season.startDate,
                endDate: season.endDate
            },
            rewards: rewardConfig
        });
    } catch (error) {
        console.error('Get rewards error:', error);
        res.status(500).json({ error: 'Failed to get rewards' });
    }
});

export default router;
