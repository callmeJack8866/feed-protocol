import prisma from '../config/database';

/**
 * 等级经验值系统服务
 */

// 等级经验值阈值
const RANK_XP_THRESHOLDS: Record<string, number> = {
    'F': 0,
    'E': 100,
    'D': 500,
    'C': 2000,
    'B': 5000,
    'A': 15000,
    'S': 50000
};

const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

/**
 * 根据偏差计算奖励和经验值
 */
export function calculateReward(
    baseReward: number,
    deviation: number,
    feederRank: string
): { reward: number; xp: number; penaltyReason?: string } {
    // 偏差容忍度
    if (deviation <= 0.05) {
        // 极度精准：全额奖励 + 额外 XP
        return {
            reward: baseReward * 1.1,
            xp: 30
        };
    } else if (deviation <= 0.1) {
        // 精准：全额奖励
        return {
            reward: baseReward,
            xp: 20
        };
    } else if (deviation <= 0.3) {
        // 可接受：部分奖励
        return {
            reward: baseReward * 0.7,
            xp: 10
        };
    } else if (deviation <= 0.5) {
        // 警告：少量奖励
        return {
            reward: baseReward * 0.3,
            xp: 5,
            penaltyReason: 'deviation_warning'
        };
    } else if (deviation <= 1.0) {
        // 不合格：无奖励 + 扣 XP
        return {
            reward: 0,
            xp: -20,
            penaltyReason: 'deviation_unacceptable'
        };
    } else {
        // 严重偏差：惩罚
        return {
            reward: 0,
            xp: -50,
            penaltyReason: 'deviation_severe'
        };
    }
}

/**
 * 根据 XP 计算新等级
 */
export function calculateRank(currentXp: number): string {
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rank = RANK_ORDER[i];
        if (currentXp >= RANK_XP_THRESHOLDS[rank]) {
            return rank;
        }
    }
    return 'F';
}

/**
 * 更新喂价员经验值和等级
 */
export async function updateFeederRank(
    feederId: string,
    xpChange: number
): Promise<{ newXp: number; newRank: string; rankUp: boolean }> {
    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId }
    });

    if (!feeder) {
        throw new Error('Feeder not found');
    }

    const newXp = Math.max(0, feeder.xp + xpChange);
    const newRank = calculateRank(newXp);
    const rankUp = RANK_ORDER.indexOf(newRank) > RANK_ORDER.indexOf(feeder.rank);

    await prisma.feeder.update({
        where: { id: feederId },
        data: {
            xp: newXp,
            rank: newRank
        }
    });

    return { newXp, newRank, rankUp };
}

/**
 * 更新喂价员统计数据
 */
export async function updateFeederStats(
    feederId: string,
    deviation: number
): Promise<void> {
    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId }
    });

    if (!feeder) return;

    const newTotalFeeds = feeder.totalFeeds + 1;

    // 计算新的平均偏差
    const newAvgDeviation = (feeder.avgDeviation * feeder.totalFeeds + deviation) / newTotalFeeds;

    // 计算新的准确率 (偏差 < 0.3% 视为准确)
    const isAccurate = deviation <= 0.3;
    const accurateCount = feeder.accuracyRate * feeder.totalFeeds / 100;
    const newAccurateCount = isAccurate ? accurateCount + 1 : accurateCount;
    const newAccuracyRate = (newAccurateCount / newTotalFeeds) * 100;

    await prisma.feeder.update({
        where: { id: feederId },
        data: {
            totalFeeds: newTotalFeeds,
            avgDeviation: newAvgDeviation,
            accuracyRate: newAccuracyRate
        }
    });
}

/**
 * 获取下一等级所需经验
 */
export function getXpToNextRank(currentXp: number, currentRank: string): number {
    const currentIndex = RANK_ORDER.indexOf(currentRank);
    if (currentIndex >= RANK_ORDER.length - 1) {
        return 0; // 已是最高级
    }

    const nextRank = RANK_ORDER[currentIndex + 1];
    return RANK_XP_THRESHOLDS[nextRank] - currentXp;
}
