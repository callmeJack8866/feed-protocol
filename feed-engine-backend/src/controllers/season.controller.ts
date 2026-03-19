import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { cacheOrFetch, CACHE_PREFIX, CACHE_TTL } from '../config/cache';

const router = Router();

// ============================================
// 赛季管理 API
// ============================================

/**
 * 按赛季时间范围从 FeedHistory 聚合排行榜数据。
 * 返回每个 feeder 在赛季内的 feeds 总数、累计 XP、累计 reward、平均偏差。
 */
async function aggregateSeasonStats(startDate: Date, endDate: Date) {
    // FeedHistory 每条记录对应一次喂价完成
    const rows = await prisma.feedHistory.groupBy({
        by: ['feederId'],
        where: {
            createdAt: { gte: startDate, lte: endDate }
        },
        _count: { id: true },
        _sum: { xpEarned: true, reward: true },
        _avg: { deviation: true }
    });

    return rows.map(row => ({
        feederId: row.feederId,
        feeds: row._count.id,
        xp: row._sum.xpEarned ?? 0,
        reward: row._sum.reward ?? 0,
        avgDeviation: row._avg.deviation ?? 0
    }));
}

/**
 * 获取 feeder 展示信息（nickname、rank、address 等），批量查询。
 */
async function getFeederDisplayMap(feederIds: string[]) {
    if (feederIds.length === 0) return new Map<string, any>();

    const feeders = await prisma.feeder.findMany({
        where: { id: { in: feederIds }, isBanned: false },
        select: {
            id: true,
            address: true,
            nickname: true,
            rank: true,
            stakedAmount: true
        }
    });

    const map = new Map<string, any>();
    feeders.forEach(f => map.set(f.id, f));
    return map;
}

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
 * 获取当前赛季（如果不存在则自动创建当月赛季）
 */
router.get('/current', async (req: Request, res: Response) => {
    try {
        const now = new Date();

        // 将已过期的 ACTIVE 赛季标记为 ENDED
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
 * 获取赛季排行榜 — 严格按赛季时间范围聚合
 *
 * type=OVERALL  → 赛季内 SUM(xpEarned) 降序
 * type=FEEDS    → 赛季内 COUNT(feeds) 降序
 * type=ACCURACY → 赛季内 AVG(deviation) 升序（偏差越小越好）
 * type=STAKING  → feeder.stakedAmount 降序（实时质押快照）
 */
router.get('/:code/leaderboard', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;
        const { type = 'OVERALL', limit = 100 } = req.query;
        const take = Math.min(Number(limit) || 100, 500);
        const cacheKey = `${CACHE_PREFIX.LEADERBOARD}season:${code}:${type}:${take}`;

        const result = await cacheOrFetch(cacheKey, async () => {
            const season = await prisma.season.findUnique({ where: { code } });
            if (!season) {
                return { leaderboard: [], source: 'empty', error: 'Season not found' };
            }

            // 已结算赛季 → 直接从快照读取
            if (season.status === 'SETTLED' || season.status === 'ENDED') {
                const snapshots = await prisma.seasonSnapshot.findMany({
                    where: { season: code, rankType: type as string },
                    orderBy: { rank: 'asc' },
                    take
                });
                return { leaderboard: snapshots, source: 'snapshot' };
            }

            // ===== 进行中的赛季 → 实时聚合 =====

            // STAKING 维度：质押是实时快照，不按赛季时间过滤
            if (type === 'STAKING') {
                const feeders = await prisma.feeder.findMany({
                    where: { isBanned: false, stakedAmount: { gt: 0 } },
                    orderBy: { stakedAmount: 'desc' },
                    take,
                    select: {
                        id: true, address: true, nickname: true, rank: true,
                        stakedAmount: true
                    }
                });
                return {
                    leaderboard: feeders.map((f, i) => ({
                        ...f, position: i + 1, rankType: 'STAKING',
                        feeds: 0, totalXp: 0, accuracy: 0, reward: 0
                    })),
                    source: 'realtime'
                };
            }

            // OVERALL / FEEDS / ACCURACY → 从 FeedHistory 聚合
            const stats = await aggregateSeasonStats(season.startDate, season.endDate);

            if (stats.length === 0) {
                return { leaderboard: [], source: 'realtime' };
            }

            // 按请求维度排序
            let sorted: typeof stats;
            if (type === 'FEEDS') {
                sorted = stats.sort((a, b) => b.feeds - a.feeds);
            } else if (type === 'ACCURACY') {
                // 偏差越小越好；过滤出至少有 1 次 feed 的
                sorted = stats
                    .filter(s => s.feeds > 0)
                    .sort((a, b) => Math.abs(a.avgDeviation) - Math.abs(b.avgDeviation));
            } else {
                // OVERALL → XP
                sorted = stats.sort((a, b) => b.xp - a.xp);
            }

            const topSlice = sorted.slice(0, take);
            const feederMap = await getFeederDisplayMap(topSlice.map(s => s.feederId));

            const leaderboard = topSlice
                .filter(s => feederMap.has(s.feederId)) // 排除已封禁
                .map((s, i) => {
                    const feeder = feederMap.get(s.feederId)!;
                    return {
                        position: i + 1,
                        rankType: type,
                        feederId: s.feederId,
                        address: feeder.address,
                        nickname: feeder.nickname,
                        rank: feeder.rank,
                        totalXp: s.xp,
                        feeds: s.feeds,
                        accuracy: s.feeds > 0 ? +(100 - Math.abs(s.avgDeviation)).toFixed(2) : 0,
                        reward: +s.reward.toFixed(2),
                        stakedAmount: feeder.stakedAmount
                    };
                });

            return { leaderboard, source: 'realtime' };
        }, CACHE_TTL.LONG); // 30 分钟缓存

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

/**
 * GET /api/seasons/:code/my-rank
 * 获取当前用户在赛季中的排名 — 严格按赛季时间范围聚合
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

        const season = await prisma.season.findUnique({ where: { code } });
        if (!season) {
            return res.status(404).json({ error: 'Season not found' });
        }

        // 聚合全部 feeder 的赛季内数据
        const allStats = await aggregateSeasonStats(season.startDate, season.endDate);

        // 查找当前用户的赛季数据
        const myStats = allStats.find(s => s.feederId === feeder.id) || {
            feederId: feeder.id, feeds: 0, xp: 0, reward: 0, avgDeviation: 0
        };

        // 获取未被封禁的 feeder ID 集合
        const activeFeeders = await prisma.feeder.findMany({
            where: { isBanned: false },
            select: { id: true }
        });
        const activeIds = new Set(activeFeeders.map(f => f.id));

        // 只保留未封禁用户的统计数据
        const activeStats = allStats.filter(s => activeIds.has(s.feederId));

        // 计算各维度排名
        const xpRank = activeStats.filter(s => s.xp > myStats.xp).length + 1;
        const feedsRank = activeStats.filter(s => s.feeds > myStats.feeds).length + 1;

        // ACCURACY：偏差绝对值更小的排在前面
        const myAbsDev = Math.abs(myStats.avgDeviation);
        const accuracyRank = myStats.feeds > 0
            ? activeStats.filter(s => s.feeds > 0 && Math.abs(s.avgDeviation) < myAbsDev).length + 1
            : activeStats.filter(s => s.feeds > 0).length + 1; // 无 feed 则排最后

        // STAKING：仍然用实时质押金额
        const stakingRank = await prisma.feeder.count({
            where: { stakedAmount: { gt: feeder.stakedAmount }, isBanned: false }
        }) + 1;

        const myAccuracy = myStats.feeds > 0
            ? +(100 - Math.abs(myStats.avgDeviation)).toFixed(2)
            : 0;

        res.json({
            success: true,
            ranks: {
                overall: xpRank,
                feeds: feedsRank,
                accuracy: accuracyRank,
                staking: stakingRank
            },
            stats: {
                xp: myStats.xp,
                totalFeeds: myStats.feeds,
                accuracyRate: myAccuracy,
                totalReward: +myStats.reward.toFixed(2),
                stakedAmount: feeder.stakedAmount
            },
            season: {
                code: season.code,
                name: season.name,
                startDate: season.startDate,
                endDate: season.endDate
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
/**
 * POST /api/seasons/:code/claim
 * 用户领取赛季奖励
 *
 * 流程:
 * 1. 赛季必须已结算 (SETTLED)
 * 2. 查找该用户的 OVERALL 排名快照
 * 3. 排名 ≤100 才有奖励
 * 4. snapshot.reward > 0 表示未领取，领取后标记为负数（-reward）防止重复领取
 * 5. 增加用户 XP + totalEarnings
 */
router.post('/:code/claim', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;
        const { code } = req.params;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // 1. 查找赛季
        const season = await prisma.season.findUnique({ where: { code } });
        if (!season) {
            return res.status(404).json({ error: 'Season not found' });
        }

        if (season.status !== 'SETTLED') {
            return res.status(400).json({
                error: 'Season not settled yet',
                message: '赛季尚未结算，无法领取奖励'
            });
        }

        // 2. 查找用户
        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 3. 查找用户在该赛季的 OVERALL 排名快照
        const snapshot = await prisma.seasonSnapshot.findFirst({
            where: {
                season: code,
                feederId: feeder.id,
                rankType: 'OVERALL'
            }
        });

        if (!snapshot) {
            return res.status(404).json({
                error: 'No ranking found',
                message: '您在该赛季没有排名记录'
            });
        }

        // 4. 检查是否有奖励（reward > 0 表示可领取，reward < 0 表示已领取）
        if (!snapshot.reward || snapshot.reward <= 0) {
            if (snapshot.reward !== null && snapshot.reward < 0) {
                return res.status(400).json({
                    error: 'Already claimed',
                    message: '您已领取过该赛季奖励',
                    claimed: true,
                    reward: Math.abs(snapshot.reward)
                });
            }
            return res.status(400).json({
                error: 'No reward',
                message: '您的排名未进入奖励范围（Top 100）'
            });
        }

        const feedReward = snapshot.reward;

        // 使用配置获取对应排名的 XP 奖励
        const RANK_XP: Record<string, number> = {
            '1': 2000, '2': 1500, '3': 1500,
            '4-10': 1000, '11-50': 500, '51-100': 300
        };
        let xpReward = 0;
        const rank = snapshot.rank;
        if (rank === 1) xpReward = RANK_XP['1'];
        else if (rank <= 3) xpReward = RANK_XP['2'];
        else if (rank <= 10) xpReward = RANK_XP['4-10'];
        else if (rank <= 50) xpReward = RANK_XP['11-50'];
        else if (rank <= 100) xpReward = RANK_XP['51-100'];

        // 5. 执行领取: 更新 feeder + 标记快照已领取（reward 设为负数）
        await prisma.$transaction([
            // 增加用户 XP 和收益
            prisma.feeder.update({
                where: { id: feeder.id },
                data: {
                    xp: { increment: xpReward },
                    totalEarnings: { increment: feedReward }
                }
            }),
            // 标记快照已领取（负数 = 已领取的金额）
            prisma.seasonSnapshot.update({
                where: { id: snapshot.id },
                data: { reward: -feedReward }
            })
        ]);

        console.log(`🎁 Season reward claimed: ${feeder.address} rank #${rank} → +${feedReward} FEED, +${xpReward} XP`);

        res.json({
            success: true,
            claimed: true,
            rank: snapshot.rank,
            reward: {
                feed: feedReward,
                xp: xpReward,
            },
            season: {
                code: season.code,
                name: season.name
            }
        });
    } catch (error) {
        console.error('Claim season reward error:', error);
        res.status(500).json({ error: 'Failed to claim season reward' });
    }
});

export default router;
