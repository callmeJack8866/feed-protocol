/**
 * 奖励分配服务 — 方案 §10.2
 * 
 * 喂价奖励分配比例:
 * - 70% → 喂价员 (feeders)
 * - 10% → 平台运营 (platform)
 * - 10% → DAO 国库 (daoTreasury)
 * - 10% → 代币销毁 (burn)
 */

import prisma from '../config/database';
import { io } from '../index';

/** 分配比例常量 */
const REWARD_DISTRIBUTION = {
    FEEDER_PERCENT: 70,
    PLATFORM_PERCENT: 10,
    DAO_PERCENT: 10,
    BURN_PERCENT: 10,
} as const;

/** 平台钱包 (可通过环境变量配置) */
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '0x0000000000000000000000000000000000000001';
const DAO_TREASURY_WALLET = process.env.DAO_TREASURY_WALLET || '0x0000000000000000000000000000000000000002';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

/**
 * 计算奖励分配明细
 * @param totalReward 总奖励金额 (FEED)
 * @returns 各方分配金额
 */
export function calculateDistribution(totalReward: number) {
    const feederReward = Math.floor(totalReward * REWARD_DISTRIBUTION.FEEDER_PERCENT / 100);
    const platformFee = Math.floor(totalReward * REWARD_DISTRIBUTION.PLATFORM_PERCENT / 100);
    const daoFee = Math.floor(totalReward * REWARD_DISTRIBUTION.DAO_PERCENT / 100);
    const burnAmount = totalReward - feederReward - platformFee - daoFee; // 余数归销毁

    return {
        feederReward,
        platformFee,
        daoFee,
        burnAmount,
        breakdown: {
            total: totalReward,
            feeder: `${REWARD_DISTRIBUTION.FEEDER_PERCENT}% = ${feederReward}`,
            platform: `${REWARD_DISTRIBUTION.PLATFORM_PERCENT}% = ${platformFee}`,
            dao: `${REWARD_DISTRIBUTION.DAO_PERCENT}% = ${daoFee}`,
            burn: `${REWARD_DISTRIBUTION.BURN_PERCENT}% = ${burnAmount}`,
        }
    };
}

/**
 * 在多个喂价员之间均分奖励
 * @param feederReward 喂价员总奖励
 * @param feederIds 喂价员 ID 数组
 * @param weights 权重数组 (可选，默认均分)
 * @returns 每个喂价员分到的金额
 */
export function distributeAmongFeeders(
    feederReward: number,
    feederIds: string[],
    weights?: number[]
): Record<string, number> {
    const result: Record<string, number> = {};

    if (weights && weights.length === feederIds.length) {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        feederIds.forEach((id, i) => {
            result[id] = Math.floor(feederReward * weights[i] / totalWeight);
        });
    } else {
        // 均分
        const perFeeder = Math.floor(feederReward / feederIds.length);
        feederIds.forEach(id => {
            result[id] = perFeeder;
        });
    }

    return result;
}

/**
 * 执行订单奖励分配
 * @param orderId 订单 ID
 * @param totalReward 总奖励
 * @param feederIds 参与喂价的喂价员 ID
 * @returns 分配结果
 */
export async function executeRewardDistribution(
    orderId: string,
    totalReward: number,
    feederIds: string[]
) {
    const distribution = calculateDistribution(totalReward);
    const feederShares = distributeAmongFeeders(distribution.feederReward, feederIds);

    try {
        // 1. 给每个喂价员发放奖励
        const feederUpdates = feederIds.map(feederId =>
            prisma.feeder.update({
                where: { id: feederId },
                data: {
                    totalEarnings: { increment: feederShares[feederId] },
                }
            })
        );

        // 2. 记录分配到账
        const distributionRecord = prisma.rewardDistribution.create({
            data: {
                orderId,
                totalReward,
                feederTotal: distribution.feederReward,
                platformFee: distribution.platformFee,
                daoFee: distribution.daoFee,
                burnAmount: distribution.burnAmount,
                feederShares: JSON.stringify(feederShares),
                platformWallet: PLATFORM_WALLET,
                daoWallet: DAO_TREASURY_WALLET,
                burnAddress: BURN_ADDRESS,
                status: 'DISTRIBUTED',
            }
        });

        await prisma.$transaction([...feederUpdates, distributionRecord]);

        // 3. WebSocket 通知
        io.emit('reward:distributed', {
            orderId,
            distribution: distribution.breakdown,
        });

        console.log(
            `✅ 奖励分配完成 (订单 ${orderId}): ` +
            `喂价员 ${distribution.feederReward} / ` +
            `平台 ${distribution.platformFee} / ` +
            `DAO ${distribution.daoFee} / ` +
            `销毁 ${distribution.burnAmount}`
        );

        return {
            success: true,
            orderId,
            distribution,
            feederShares,
        };
    } catch (error) {
        console.error(`❌ 奖励分配失败 (订单 ${orderId}):`, error);
        throw error;
    }
}

export default {
    calculateDistribution,
    distributeAmongFeeders,
    executeRewardDistribution,
    REWARD_DISTRIBUTION,
};
