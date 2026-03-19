/**
 * verify-season-ranking.ts
 *
 * 验证脚本：对比「全局字段排名」与「赛季聚合排名」的差异。
 * 用法: npx ts-node src/scripts/verify-season-ranking.ts
 */

import prisma from '../config/database';

async function main() {
    console.log('=== 赛季排行榜验证脚本 ===\n');

    // 1. 获取当前赛季
    const now = new Date();
    const season = await prisma.season.findFirst({
        where: {
            startDate: { lte: now },
            endDate: { gte: now }
        },
        orderBy: { startDate: 'desc' }
    });

    if (!season) {
        console.log('❌ 没有找到当前赛季，请先调用 GET /api/seasons/current 创建。');
        process.exit(0);
    }

    console.log(`当前赛季: ${season.name} (${season.code})`);
    console.log(`时间范围: ${season.startDate.toISOString()} ~ ${season.endDate.toISOString()}\n`);

    // 2. 旧逻辑 — 全局字段 top 5
    const globalTop5 = await prisma.feeder.findMany({
        where: { isBanned: false },
        orderBy: { xp: 'desc' },
        take: 5,
        select: { id: true, address: true, nickname: true, xp: true, totalFeeds: true, accuracyRate: true }
    });

    console.log('--- 旧逻辑：全局 feeder.xp 排名 Top 5 ---');
    globalTop5.forEach((f, i) => {
        console.log(`  #${i + 1} ${f.nickname ?? f.address.slice(0, 10)} | XP=${f.xp} | Feeds=${f.totalFeeds} | Acc=${f.accuracyRate}%`);
    });
    console.log('');

    // 3. 新逻辑 — 赛季聚合 top 5
    const seasonStats = await prisma.feedHistory.groupBy({
        by: ['feederId'],
        where: {
            createdAt: { gte: season.startDate, lte: season.endDate }
        },
        _count: { id: true },
        _sum: { xpEarned: true, reward: true },
        _avg: { deviation: true }
    });

    const sorted = seasonStats
        .map(row => ({
            feederId: row.feederId,
            feeds: row._count.id,
            xp: row._sum.xpEarned ?? 0,
            reward: row._sum.reward ?? 0,
            avgDev: row._avg.deviation ?? 0
        }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 5);

    // 获取展示信息
    const feederIds = sorted.map(s => s.feederId);
    const feeders = await prisma.feeder.findMany({
        where: { id: { in: feederIds } },
        select: { id: true, address: true, nickname: true }
    });
    const feederMap = new Map(feeders.map(f => [f.id, f]));

    console.log(`--- 新逻辑：赛季内 FeedHistory 聚合 Top 5 (${season.code}) ---`);
    if (sorted.length === 0) {
        console.log('  (当前赛季内暂无 FeedHistory 记录)');
    } else {
        sorted.forEach((s, i) => {
            const f = feederMap.get(s.feederId);
            const label = f?.nickname ?? f?.address?.slice(0, 10) ?? s.feederId.slice(0, 8);
            console.log(`  #${i + 1} ${label} | XP=${s.xp} | Feeds=${s.feeds} | Reward=${s.reward.toFixed(2)} | AvgDev=${s.avgDev.toFixed(4)}`);
        });
    }
    console.log('');

    // 4. 对比差异
    const globalIds = globalTop5.map(f => f.id);
    const seasonIds = sorted.map(s => s.feederId);
    const onlyInGlobal = globalIds.filter(id => !seasonIds.includes(id));
    const onlyInSeason = seasonIds.filter(id => !globalIds.includes(id));

    if (onlyInGlobal.length === 0 && onlyInSeason.length === 0) {
        console.log('✅ 全局与赛季排名一致 — 说明所有 feed 都发生在当前赛季内。');
    } else {
        console.log('⚠️  排名差异检测到:');
        if (onlyInGlobal.length > 0) {
            console.log(`  全局 Top5 中但赛季 Top5 中没有: ${onlyInGlobal.length} 人（他们的 XP 来自历史赛季）`);
        }
        if (onlyInSeason.length > 0) {
            console.log(`  赛季 Top5 中但全局 Top5 中没有: ${onlyInSeason.length} 人（他们本赛季表现突出）`);
        }
    }

    // 5. 总计数据量
    const totalHistoryThisSeason = await prisma.feedHistory.count({
        where: { createdAt: { gte: season.startDate, lte: season.endDate } }
    });
    const totalHistoryAll = await prisma.feedHistory.count();
    const totalFeeders = await prisma.feeder.count({ where: { isBanned: false } });

    console.log(`\n--- 数据概览 ---`);
    console.log(`  FeedHistory 总记录: ${totalHistoryAll}`);
    console.log(`  本赛季 FeedHistory: ${totalHistoryThisSeason}`);
    console.log(`  历史赛季 FeedHistory: ${totalHistoryAll - totalHistoryThisSeason}`);
    console.log(`  活跃 Feeder 总数: ${totalFeeders}`);

    console.log('\n=== 验证完成 ===');
}

main()
    .catch(e => {
        console.error('验证脚本出错:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
