import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { cacheOrFetch, CACHE_PREFIX, CACHE_TTL } from '../config/cache';

const router = Router();

// ============================================
// 璧涘绠＄悊 API
// ============================================

/**
 * GET /api/seasons
 * 鑾峰彇璧涘鍒楄〃
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
 * 鑾峰彇褰撳墠璧涘
 */
router.get('/current', async (req: Request, res: Response) => {
    try {
        const now = new Date();

        await prisma.season.updateMany({
            where: {
                status: 'ACTIVE',
                endDate: { lt: now }
            },
            data: { status: 'ENDED' }
        });

        let season = await prisma.season.findFirst({
            where: {
                startDate: { lte: now },
                endDate: { gte: now }
            },
            orderBy: { startDate: 'desc' }
        });

        if (!season) {
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const code = `${year}-${String(month).padStart(2, '0')}`;
            const startDate = new Date(year, now.getMonth(), 1);
            const endDate = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

            season = await prisma.season.upsert({
                where: { code },
                update: {
                    startDate,
                    endDate,
                    status: 'ACTIVE'
                },
                create: {
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
        } else if (season.status !== 'ACTIVE') {
            season = await prisma.season.update({
                where: { id: season.id },
                data: { status: 'ACTIVE' }
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
 * 鑾峰彇璧涘鎺掕姒?
 */
router.get('/:code/leaderboard', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;
        const { type = 'OVERALL', limit = 100 } = req.query;
        const cacheKey = `${CACHE_PREFIX.LEADERBOARD}season:${code}:${type}:${limit}`;

        const result = await cacheOrFetch(cacheKey, async () => {
            // 妫€鏌ヨ禌瀛ｆ槸鍚﹀瓨鍦?
            const season = await prisma.season.findUnique({
                where: { code }
            });

            // 濡傛灉璧涘宸茬粨鏉燂紝浠庡揩鐓ц幏鍙?
            if (season?.status === 'SETTLED' || season?.status === 'ENDED') {
                const snapshots = await prisma.seasonSnapshot.findMany({
                    where: { season: code, rankType: type as string },
                    orderBy: { rank: 'asc' },
                    take: Number(limit)
                });
                return { leaderboard: snapshots, source: 'snapshot' };
            }

            // 杩涜涓殑璧涘锛屽疄鏃惰绠?
            let orderBy: any = { xp: 'desc' };
            if (type === 'FEEDS') orderBy = { totalFeeds: 'desc' };
            if (type === 'ACCURACY') orderBy = { accuracyRate: 'desc' };
            if (type === 'STAKING') orderBy = { stakedAmount: 'desc' };

            const feeders = await prisma.feeder.findMany({
                where: { isBanned: false },
                orderBy,
                take: Number(limit),
                select: {
                    id: true, address: true, nickname: true, rank: true,
                    xp: true, totalFeeds: true, accuracyRate: true, stakedAmount: true
                }
            });

            const leaderboard = feeders.map((feeder, index) => ({
                ...feeder, position: index + 1, rankType: type
            }));

            return { leaderboard, source: 'realtime' };
        }, CACHE_TTL.LONG); // 30鍒嗛挓缂撳瓨

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

/**
 * GET /api/seasons/:code/my-rank
 * 鑾峰彇褰撳墠鐢ㄦ埛鍦ㄨ禌瀛ｄ腑鐨勬帓鍚?
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

        // 璁＄畻鍚勭淮搴︽帓鍚?
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
                staking: stakingRank + 1  // 鏂规 搂4.7: 璐ㄦ娂閲忔帓鍚?
            },
            stats: {
                xp: feeder.xp,
                totalFeeds: feeder.totalFeeds,
                accuracyRate: feeder.accuracyRate,
                stakedAmount: feeder.stakedAmount  // 鏂规 搂4.7
            }
        });
    } catch (error) {
        console.error('Get my rank error:', error);
        res.status(500).json({ error: 'Failed to get rank' });
    }
});

/**
 * GET /api/seasons/:code/rewards
 * 鑾峰彇璧涘濂栧姳淇℃伅
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

        // Prisma Json 绫诲瀷鑷姩鍙嶅簭鍒楀寲
        const rewardConfig = season.rewardConfig || {};

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
