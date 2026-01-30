import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// ============================================
// 成就定义数据（初始化数据）
// ============================================
const ACHIEVEMENTS_DATA = [
    // 🏆 里程碑徽章
    { code: 'FIRST_FEED', name: '初出茅庐', description: '完成首次喂价', category: 'MILESTONE', icon: '🎯', conditions: { totalFeeds: 1 }, xpReward: 50, rarity: 'COMMON' },
    { code: 'FEEDS_100', name: '百单达人', description: '累计完成 100 单', category: 'MILESTONE', icon: '💯', conditions: { totalFeeds: 100 }, xpReward: 200, rarity: 'RARE' },
    { code: 'FEEDS_1000', name: '千单大师', description: '累计完成 1,000 单', category: 'MILESTONE', icon: '🏅', conditions: { totalFeeds: 1000 }, xpReward: 500, rarity: 'EPIC' },
    { code: 'FEEDS_10000', name: '万单传奇', description: '累计完成 10,000 单', category: 'MILESTONE', icon: '👑', conditions: { totalFeeds: 10000 }, xpReward: 2000, feedReward: 1000, rarity: 'LEGENDARY' },

    // 🎯 精准徽章
    { code: 'SHARPSHOOTER', name: '神枪手', description: '连续 10 单偏差 < 0.05%', category: 'PRECISION', icon: '🎯', conditions: { consecutivePrecision: 10, threshold: 0.05 }, xpReward: 150, rarity: 'RARE' },
    { code: 'BULLSEYE', name: '百发百中', description: '连续 50 单偏差 < 0.1%', category: 'PRECISION', icon: '🎪', conditions: { consecutivePrecision: 50, threshold: 0.1 }, xpReward: 300, rarity: 'EPIC' },
    { code: 'PRECISION_KING', name: '精准之王', description: '月度准确率第一名', category: 'PRECISION', icon: '🎖️', conditions: { seasonRank: { accuracy: 1 } }, xpReward: 500, rarity: 'LEGENDARY' },

    // ⚡ 速度徽章
    { code: 'LIGHTNING', name: '闪电手', description: '响应时间 < 30秒 完成 50 单', category: 'SPEED', icon: '⚡', conditions: { fastFeeds: 50, threshold: 30 }, xpReward: 200, rarity: 'RARE' },
    { code: 'LIGHTSPEED', name: '光速喂价', description: '月度响应速度第一名', category: 'SPEED', icon: '🚀', conditions: { seasonRank: { speed: 1 } }, xpReward: 500, rarity: 'LEGENDARY' },

    // 🌟 特殊徽章
    { code: 'ARBITRATOR', name: '仲裁官', description: '成功参与 10 次仲裁', category: 'SPECIAL', icon: '⚖️', conditions: { arbitrations: 10 }, xpReward: 300, rarity: 'EPIC' },
    { code: 'ALL_ROUNDER', name: '全能王', description: '覆盖全部 6 种市场类型', category: 'SPECIAL', icon: '🌍', conditions: { marketTypes: 6 }, xpReward: 400, rarity: 'EPIC' },
    { code: 'SEASON_CHAMPION', name: '赛季冠军', description: '获得月赛季第一名', category: 'SPECIAL', icon: '🏆', conditions: { seasonRank: { overall: 1 } }, xpReward: 1000, feedReward: 500, rarity: 'LEGENDARY' }
];

// ============================================
// 成就 API
// ============================================

/**
 * GET /api/achievements
 * 获取所有成就定义
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { category, rarity } = req.query;

        const where: any = { isActive: true };
        if (category) where.category = category;
        if (rarity) where.rarity = rarity;

        let achievements = await prisma.achievement.findMany({
            where,
            orderBy: [
                { category: 'asc' },
                { rarity: 'asc' }
            ]
        });

        // 如果数据库为空，初始化成就数据
        if (achievements.length === 0) {
            await prisma.achievement.createMany({
                data: ACHIEVEMENTS_DATA.map(a => ({
                    ...a,
                    conditions: JSON.stringify(a.conditions)
                }))
            });
            achievements = await prisma.achievement.findMany({ where });
        }

        res.json({ success: true, achievements });
    } catch (error) {
        console.error('Get achievements error:', error);
        res.status(500).json({ error: 'Failed to get achievements' });
    }
});

/**
 * GET /api/achievements/my
 * 获取当前用户的成就
 */
router.get('/my', async (req: Request, res: Response) => {
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

        // 获取所有成就和用户解锁记录
        const [allAchievements, unlocked] = await Promise.all([
            prisma.achievement.findMany({ where: { isActive: true } }),
            prisma.feederAchievement.findMany({
                where: { feederId: feeder.id },
                include: { achievement: true }
            })
        ]);

        const unlockedIds = new Set(unlocked.map(u => u.achievementId));

        // 合并数据
        const achievements = allAchievements.map(a => ({
            ...a,
            unlocked: unlockedIds.has(a.id),
            unlockedAt: unlocked.find(u => u.achievementId === a.id)?.unlockedAt
        }));

        // 统计
        const stats = {
            total: allAchievements.length,
            unlocked: unlocked.length,
            byCategory: {
                MILESTONE: achievements.filter(a => a.category === 'MILESTONE' && a.unlocked).length,
                PRECISION: achievements.filter(a => a.category === 'PRECISION' && a.unlocked).length,
                SPEED: achievements.filter(a => a.category === 'SPEED' && a.unlocked).length,
                SPECIAL: achievements.filter(a => a.category === 'SPECIAL' && a.unlocked).length
            }
        };

        res.json({ success: true, achievements, stats });
    } catch (error) {
        console.error('Get my achievements error:', error);
        res.status(500).json({ error: 'Failed to get achievements' });
    }
});

/**
 * GET /api/achievements/:id
 * 获取成就详情
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const achievement = await prisma.achievement.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { unlocks: true }
                }
            }
        });

        if (!achievement) {
            return res.status(404).json({ error: 'Achievement not found' });
        }

        // 获取总喂价员数用于计算稀有度
        const totalFeeders = await prisma.feeder.count();

        res.json({
            success: true,
            achievement: {
                ...achievement,
                unlockRate: totalFeeders > 0
                    ? ((achievement._count.unlocks / totalFeeders) * 100).toFixed(2)
                    : 0
            }
        });
    } catch (error) {
        console.error('Get achievement error:', error);
        res.status(500).json({ error: 'Failed to get achievement' });
    }
});

/**
 * POST /api/achievements/check
 * 检查并解锁成就
 */
router.post('/check', async (req: Request, res: Response) => {
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

        // 获取未解锁的成就
        const [allAchievements, unlockedRecords] = await Promise.all([
            prisma.achievement.findMany({ where: { isActive: true } }),
            prisma.feederAchievement.findMany({
                where: { feederId: feeder.id }
            })
        ]);

        const unlockedIds = new Set(unlockedRecords.map(r => r.achievementId));
        const pendingAchievements = allAchievements.filter(a => !unlockedIds.has(a.id));

        // 检查每个未解锁的成就
        const newlyUnlocked: any[] = [];

        for (const achievement of pendingAchievements) {
            let conditions: any = {};
            try {
                conditions = JSON.parse(achievement.conditions);
            } catch (e) {
                continue;
            }

            let shouldUnlock = false;

            // 检查里程碑条件
            if (conditions.totalFeeds && feeder.totalFeeds >= conditions.totalFeeds) {
                shouldUnlock = true;
            }

            // 检查精准条件（简化：基于准确率）
            if (conditions.consecutivePrecision && feeder.accuracyRate >= 95) {
                // 简化逻辑：准确率 >= 95% 视为满足精准条件
                shouldUnlock = true;
            }

            // 可以添加更多条件检查...

            if (shouldUnlock) {
                // 解锁成就
                const record = await prisma.feederAchievement.create({
                    data: {
                        feederId: feeder.id,
                        achievementId: achievement.id
                    }
                });

                // 奖励 XP
                if (achievement.xpReward > 0) {
                    await prisma.feeder.update({
                        where: { id: feeder.id },
                        data: { xp: { increment: achievement.xpReward } }
                    });
                }

                newlyUnlocked.push({
                    achievement,
                    unlockedAt: record.unlockedAt,
                    xpEarned: achievement.xpReward,
                    feedEarned: achievement.feedReward
                });
            }
        }

        res.json({
            success: true,
            newlyUnlocked,
            message: newlyUnlocked.length > 0
                ? `恭喜！解锁了 ${newlyUnlocked.length} 个新成就！`
                : '暂无新成就解锁'
        });
    } catch (error) {
        console.error('Check achievements error:', error);
        res.status(500).json({ error: 'Failed to check achievements' });
    }
});

export default router;
