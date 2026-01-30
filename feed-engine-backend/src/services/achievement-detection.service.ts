/**
 * 成就检测服务
 * 自动检测并解锁成就，在喂价完成后调用
 */

import prisma from '../config/database';
import { mintAchievementBadge } from './nft-badge.service';

// 成就定义常量
const ACHIEVEMENT_CONDITIONS = {
    // 里程碑成就
    FIRST_FEED: { totalFeeds: 1 },
    FEEDS_100: { totalFeeds: 100 },
    FEEDS_1000: { totalFeeds: 1000 },
    FEEDS_10000: { totalFeeds: 10000 },

    // 精准成就
    SHARPSHOOTER: { consecutivePrecision: 10, threshold: 0.05 },
    BULLSEYE: { consecutivePrecision: 50, threshold: 0.1 },

    // 速度成就
    LIGHTNING: { fastFeeds: 50, threshold: 30 }
};

interface DetectionResult {
    feederId: string;
    newlyUnlocked: {
        code: string;
        name: string;
        xpEarned: number;
        nftMinted: boolean;
    }[];
}

/**
 * 检测里程碑成就（基于总喂价数）
 */
export async function checkMilestoneAchievements(feederId: string): Promise<string[]> {
    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId }
    });

    if (!feeder) return [];

    const unlockedCodes: string[] = [];

    // 检查各里程碑
    const milestones = [
        { code: 'FIRST_FEED', threshold: 1 },
        { code: 'FEEDS_100', threshold: 100 },
        { code: 'FEEDS_1000', threshold: 1000 },
        { code: 'FEEDS_10000', threshold: 10000 }
    ];

    for (const milestone of milestones) {
        if (feeder.totalFeeds >= milestone.threshold) {
            // 检查是否已解锁
            const achievement = await prisma.achievement.findUnique({
                where: { code: milestone.code }
            });

            if (achievement) {
                const existing = await prisma.feederAchievement.findUnique({
                    where: {
                        feederId_achievementId: {
                            feederId,
                            achievementId: achievement.id
                        }
                    }
                });

                if (!existing) {
                    unlockedCodes.push(milestone.code);
                }
            }
        }
    }

    return unlockedCodes;
}

/**
 * 检测精准成就（基于连续高精准喂价）
 */
export async function checkPrecisionAchievements(feederId: string): Promise<string[]> {
    const unlockedCodes: string[] = [];

    // 获取最近的喂价历史记录
    const recentHistory = await prisma.feedHistory.findMany({
        where: { feederId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    if (recentHistory.length === 0) return [];

    // 检查连续高精准（偏差 < 0.05%）
    let consecutiveSharpshooter = 0;
    for (const record of recentHistory) {
        if (record.deviation <= 0.05) {
            consecutiveSharpshooter++;
        } else {
            break;
        }
    }

    if (consecutiveSharpshooter >= 10) {
        const achievement = await prisma.achievement.findUnique({
            where: { code: 'SHARPSHOOTER' }
        });
        if (achievement) {
            const existing = await prisma.feederAchievement.findUnique({
                where: {
                    feederId_achievementId: {
                        feederId,
                        achievementId: achievement.id
                    }
                }
            });
            if (!existing) unlockedCodes.push('SHARPSHOOTER');
        }
    }

    // 检查连续高精准（偏差 < 0.1%）
    let consecutiveBullseye = 0;
    for (const record of recentHistory) {
        if (record.deviation <= 0.1) {
            consecutiveBullseye++;
        } else {
            break;
        }
    }

    if (consecutiveBullseye >= 50) {
        const achievement = await prisma.achievement.findUnique({
            where: { code: 'BULLSEYE' }
        });
        if (achievement) {
            const existing = await prisma.feederAchievement.findUnique({
                where: {
                    feederId_achievementId: {
                        feederId,
                        achievementId: achievement.id
                    }
                }
            });
            if (!existing) unlockedCodes.push('BULLSEYE');
        }
    }

    return unlockedCodes;
}

/**
 * 检测速度成就（基于快速响应喂价）
 */
export async function checkSpeedAchievements(feederId: string): Promise<string[]> {
    const unlockedCodes: string[] = [];

    // 获取快速响应的喂价记录（响应时间 < 30秒）
    const submissions = await prisma.priceSubmission.findMany({
        where: {
            feederId,
            revealedPrice: { not: null }
        },
        orderBy: { createdAt: 'desc' }
    });

    // 计算快速喂价数量（假设从创建到提交 < 30秒）
    // 注意：当前缺少 grabbedAt 字段，这里使用简化逻辑
    const fastCount = submissions.filter(s => {
        // 暂时使用存在 revealedPrice 作为完成标志
        return s.revealedPrice !== null;
    }).length;

    if (fastCount >= 50) {
        const achievement = await prisma.achievement.findUnique({
            where: { code: 'LIGHTNING' }
        });
        if (achievement) {
            const existing = await prisma.feederAchievement.findUnique({
                where: {
                    feederId_achievementId: {
                        feederId,
                        achievementId: achievement.id
                    }
                }
            });
            if (!existing) unlockedCodes.push('LIGHTNING');
        }
    }

    return unlockedCodes;
}

/**
 * 解锁成就并发放奖励
 */
async function unlockAchievement(feederId: string, achievementCode: string): Promise<{
    achievement: any;
    xpEarned: number;
    nftMinted: boolean;
    nftTxHash?: string;
}> {
    const achievement = await prisma.achievement.findUnique({
        where: { code: achievementCode }
    });

    if (!achievement) {
        throw new Error(`Achievement ${achievementCode} not found`);
    }

    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId }
    });

    if (!feeder) {
        throw new Error('Feeder not found');
    }

    // 创建解锁记录
    const record = await prisma.feederAchievement.create({
        data: {
            feederId,
            achievementId: achievement.id
        }
    });

    // 发放 XP 奖励
    if (achievement.xpReward > 0) {
        await prisma.feeder.update({
            where: { id: feederId },
            data: {
                xp: { increment: achievement.xpReward }
            }
        });
    }

    // 为传奇和史诗成就铸造 NFT
    let nftMinted = false;
    let nftTxHash: string | undefined;

    if (achievement.rarity === 'LEGENDARY' || achievement.rarity === 'EPIC') {
        try {
            const mintResult = await mintAchievementBadge(
                feeder.address,
                {
                    id: achievement.id,
                    code: achievement.code,
                    name: achievement.name,
                    description: achievement.description,
                    icon: achievement.icon,
                    category: achievement.category,
                    rarity: achievement.rarity
                },
                record.unlockedAt
            );

            if (mintResult.success) {
                nftMinted = true;
                nftTxHash = mintResult.txHash;

                // 回写 NFT Token ID
                await prisma.feederAchievement.update({
                    where: { id: record.id },
                    data: { nftTokenId: mintResult.tokenId }
                });
            }
        } catch (error) {
            console.error('NFT minting failed (non-blocking):', error);
        }
    }

    console.log(`🏆 Unlocked achievement: ${achievement.name} for feeder ${feederId}`);

    return {
        achievement,
        xpEarned: achievement.xpReward,
        nftMinted,
        nftTxHash
    };
}

/**
 * 主检测函数 - 在喂价完成后调用
 */
export async function detectAndUnlockAchievements(feederId: string): Promise<DetectionResult> {
    console.log(`🔍 Detecting achievements for feeder ${feederId}...`);

    const newlyUnlocked: DetectionResult['newlyUnlocked'] = [];

    try {
        // 并行检测所有成就类型
        const [milestones, precision, speed] = await Promise.all([
            checkMilestoneAchievements(feederId),
            checkPrecisionAchievements(feederId),
            checkSpeedAchievements(feederId)
        ]);

        const allToUnlock = [...milestones, ...precision, ...speed];

        // 解锁所有检测到的成就
        for (const code of allToUnlock) {
            try {
                const result = await unlockAchievement(feederId, code);
                newlyUnlocked.push({
                    code,
                    name: result.achievement.name,
                    xpEarned: result.xpEarned,
                    nftMinted: result.nftMinted
                });
            } catch (error) {
                console.error(`Failed to unlock ${code}:`, error);
            }
        }

        if (newlyUnlocked.length > 0) {
            console.log(`✅ Unlocked ${newlyUnlocked.length} achievements for feeder ${feederId}`);
        }

    } catch (error) {
        console.error('Achievement detection error:', error);
    }

    return {
        feederId,
        newlyUnlocked
    };
}

export default {
    checkMilestoneAchievements,
    checkPrecisionAchievements,
    checkSpeedAchievements,
    detectAndUnlockAchievements
};
