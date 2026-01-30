/**
 * 赛季结算服务 - 月末自动结算排名和发放奖励
 */

import prisma from '../config/database';

// 赛季奖励配置
const SEASON_REWARDS: Record<string, { feed: number; xp: number; nft: boolean }> = {
    '1': { feed: 5000, xp: 2000, nft: true },
    '2': { feed: 3000, xp: 1500, nft: true },
    '3': { feed: 3000, xp: 1500, nft: true },
    '4-10': { feed: 1500, xp: 1000, nft: false },
    '11-50': { feed: 500, xp: 500, nft: false },
    '51-100': { feed: 200, xp: 300, nft: false }
};

/**
 * 获取排名对应的奖励
 */
function getRewardForRank(rank: number): { feed: number; xp: number; nft: boolean } | null {
    if (rank === 1) return SEASON_REWARDS['1'];
    if (rank === 2 || rank === 3) return SEASON_REWARDS['2'];
    if (rank >= 4 && rank <= 10) return SEASON_REWARDS['4-10'];
    if (rank >= 11 && rank <= 50) return SEASON_REWARDS['11-50'];
    if (rank >= 51 && rank <= 100) return SEASON_REWARDS['51-100'];
    return null;
}

/**
 * 生成赛季快照
 */
export async function generateSeasonSnapshot(seasonCode: string): Promise<void> {
    console.log(`📸 Generating season snapshot for ${seasonCode}...`);

    const season = await prisma.season.findUnique({
        where: { code: seasonCode }
    });

    if (!season) {
        throw new Error(`Season ${seasonCode} not found`);
    }

    // 获取所有活跃喂价员按不同维度排名
    const feeders = await prisma.feeder.findMany({
        where: { isBanned: false },
        orderBy: { xp: 'desc' }
    });

    // 生成综合排名快照
    const overallSnapshots = feeders.map((feeder, index) => ({
        season: seasonCode,
        seasonId: season.id,
        feederId: feeder.id,
        rank: index + 1,
        rankType: 'OVERALL',
        totalXp: feeder.xp,
        feeds: feeder.totalFeeds,
        accuracy: feeder.accuracyRate,
        avgSpeed: null,
        reward: getRewardForRank(index + 1)?.feed || null
    }));

    // 生成喂价数量排名快照
    const feedsSorted = [...feeders].sort((a, b) => b.totalFeeds - a.totalFeeds);
    const feedsSnapshots = feedsSorted.map((feeder, index) => ({
        season: seasonCode,
        seasonId: season.id,
        feederId: feeder.id,
        rank: index + 1,
        rankType: 'FEEDS',
        totalXp: feeder.xp,
        feeds: feeder.totalFeeds,
        accuracy: feeder.accuracyRate,
        avgSpeed: null,
        reward: null
    }));

    // 生成准确率排名快照
    const accuracySorted = [...feeders].sort((a, b) => b.accuracyRate - a.accuracyRate);
    const accuracySnapshots = accuracySorted.map((feeder, index) => ({
        season: seasonCode,
        seasonId: season.id,
        feederId: feeder.id,
        rank: index + 1,
        rankType: 'ACCURACY',
        totalXp: feeder.xp,
        feeds: feeder.totalFeeds,
        accuracy: feeder.accuracyRate,
        avgSpeed: null,
        reward: null
    }));

    // 批量创建快照
    const allSnapshots = [...overallSnapshots, ...feedsSnapshots, ...accuracySnapshots];
    for (const snapshot of allSnapshots) {
        await prisma.seasonSnapshot.create({
            data: snapshot as any
        }).catch(() => {
            // 忽略重复记录错误
        });
    }

    console.log(`✅ Created ${overallSnapshots.length * 3} snapshots for season ${seasonCode}`);
}

/**
 * 结算赛季奖励
 */
export async function settleSeasonRewards(seasonCode: string): Promise<{ settled: number; totalFeed: number; totalXp: number }> {
    console.log(`💰 Settling rewards for season ${seasonCode}...`);

    const season = await prisma.season.findUnique({
        where: { code: seasonCode }
    });

    if (!season) {
        throw new Error(`Season ${seasonCode} not found`);
    }

    // 获取综合排名前100名
    const topFeeders = await prisma.seasonSnapshot.findMany({
        where: {
            season: seasonCode,
            rankType: 'OVERALL',
            rank: { lte: 100 }
        },
        orderBy: { rank: 'asc' }
    });

    let settledCount = 0;
    let totalFeedRewarded = 0;
    let totalXpRewarded = 0;

    for (const snapshot of topFeeders) {
        const reward = getRewardForRank(snapshot.rank);
        if (!reward) continue;

        // 更新喂价员 XP
        await prisma.feeder.update({
            where: { id: snapshot.feederId },
            data: {
                xp: { increment: reward.xp }
            }
        });

        // 更新快照奖励记录
        await prisma.seasonSnapshot.update({
            where: { id: snapshot.id },
            data: { reward: reward.feed }
        });

        totalFeedRewarded += reward.feed;
        totalXpRewarded += reward.xp;
        settledCount++;

        console.log(`  🎁 Rank #${snapshot.rank}: +${reward.xp} XP, +${reward.feed} FEED`);
    }

    // 更新赛季状态为已结算
    await prisma.season.update({
        where: { code: seasonCode },
        data: { status: 'SETTLED' }
    });

    console.log(`✅ Settled ${settledCount} rewards: ${totalFeedRewarded} FEED, ${totalXpRewarded} XP`);

    return {
        settled: settledCount,
        totalFeed: totalFeedRewarded,
        totalXp: totalXpRewarded
    };
}

/**
 * 创建新赛季
 */
export async function createNewSeason(): Promise<any> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const code = `${year}-${String(month).padStart(2, '0')}`;

    // 检查是否已存在
    const existing = await prisma.season.findUnique({
        where: { code }
    });

    if (existing) {
        console.log(`Season ${code} already exists`);
        return existing;
    }

    const startDate = new Date(year, now.getMonth(), 1);
    const endDate = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

    const season = await prisma.season.create({
        data: {
            name: `${year}年${month}月赛季`,
            code,
            startDate,
            endDate,
            status: 'ACTIVE',
            rewardConfig: JSON.stringify(SEASON_REWARDS)
        }
    });

    console.log(`🆕 Created new season: ${season.name}`);
    return season;
}

/**
 * 结束当前赛季
 */
export async function endCurrentSeason(): Promise<void> {
    const activeSeason = await prisma.season.findFirst({
        where: { status: 'ACTIVE' }
    });

    if (!activeSeason) {
        console.log('No active season to end');
        return;
    }

    // 更新状态为已结束
    await prisma.season.update({
        where: { id: activeSeason.id },
        data: { status: 'ENDED' }
    });

    console.log(`🏁 Ended season: ${activeSeason.name}`);
}

/**
 * 运行月末结算流程
 */
export async function runMonthEndSettlement(): Promise<void> {
    console.log('🚀 Starting month-end settlement process...');
    console.log('='.repeat(50));

    try {
        // 1. 获取当前活跃赛季
        const activeSeason = await prisma.season.findFirst({
            where: { status: 'ACTIVE' }
        });

        if (!activeSeason) {
            console.log('⚠️ No active season found');
            return;
        }

        console.log(`📅 Processing season: ${activeSeason.name}`);

        // 2. 生成快照
        await generateSeasonSnapshot(activeSeason.code);

        // 3. 结算奖励
        const result = await settleSeasonRewards(activeSeason.code);
        console.log(`📊 Settlement result: ${JSON.stringify(result)}`);

        // 4. 创建下一个赛季
        await createNewSeason();

        console.log('='.repeat(50));
        console.log('✅ Month-end settlement completed successfully!');

    } catch (error) {
        console.error('❌ Settlement error:', error);
        throw error;
    }
}

/**
 * 手动触发结算（管理员使用）
 */
export async function manualSettlement(seasonCode: string): Promise<any> {
    console.log(`🔧 Manual settlement triggered for ${seasonCode}`);

    await generateSeasonSnapshot(seasonCode);
    const result = await settleSeasonRewards(seasonCode);

    return result;
}

export default {
    generateSeasonSnapshot,
    settleSeasonRewards,
    createNewSeason,
    endCurrentSeason,
    runMonthEndSettlement,
    manualSettlement
};
