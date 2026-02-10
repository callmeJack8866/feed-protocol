import prisma from '../config/database';
import { io } from '../index';

/**
 * 惩罚分级服务
 * 实现方案 §9.2 的四级惩罚机制
 *
 * | 级别   | 偏差范围       | 惩罚内容                                  |
 * |--------|---------------|------------------------------------------|
 * | 轻微   | 1%-5%         | 扣除本单奖励 + 警告                        |
 * | 中等   | 5%-10%        | 质押扣10% + 降1级 + 禁7天                  |
 * | 严重   | >10% 或恶意    | 质押扣30% + 降2级 + 禁30天                 |
 * | 极端   | 串通/重复违规   | 没收全部质押 + 永久封禁                     |
 */

// ============ 类型定义 ============

export type PenaltyLevel = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' | 'EXTREME';

export interface PenaltyConfig {
    level: PenaltyLevel;
    stakeSlashPercent: number;     // 质押扣除百分比
    rankDowngrade: number;         // 降级数量
    banDays: number;               // 禁止天数（0 = 无禁止, Infinity = 永久）
    xpPenalty: number;             // 额外 XP 惩罚
    description: string;           // 惩罚描述
}

export interface PenaltyResult {
    level: PenaltyLevel;
    executed: boolean;
    slashedAmount: number;
    oldRank: string;
    newRank: string;
    banUntil: Date | null;
    description: string;
}

// ============ 惩罚配置 ============

const PENALTY_CONFIGS: Record<PenaltyLevel, PenaltyConfig> = {
    NONE: {
        level: 'NONE',
        stakeSlashPercent: 0,
        rankDowngrade: 0,
        banDays: 0,
        xpPenalty: 0,
        description: '无惩罚'
    },
    MINOR: {
        level: 'MINOR',
        stakeSlashPercent: 0,
        rankDowngrade: 0,
        banDays: 0,
        xpPenalty: -20,
        description: '轻微偏差 (1%-5%): 扣除本单奖励 + 警告'
    },
    MODERATE: {
        level: 'MODERATE',
        stakeSlashPercent: 10,
        rankDowngrade: 1,
        banDays: 7,
        xpPenalty: -100,
        description: '中等偏差 (5%-10%): 质押扣10% + 降1级 + 禁止7天'
    },
    SEVERE: {
        level: 'SEVERE',
        stakeSlashPercent: 30,
        rankDowngrade: 2,
        banDays: 30,
        xpPenalty: -500,
        description: '严重偏差 (>10%): 质押扣30% + 降2级 + 禁止30天'
    },
    EXTREME: {
        level: 'EXTREME',
        stakeSlashPercent: 100,
        rankDowngrade: 99,  // 降到最低
        banDays: Infinity,  // 永久封禁
        xpPenalty: -10000,
        description: '极端违规 (串通/恶意): 没收全部质押 + 永久封禁'
    }
};

const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

// ============ 核心函数 ============

/**
 * 根据偏差百分比判定惩罚级别
 * @param deviation 偏差百分比 (0-100)
 * @returns 惩罚级别
 */
export function evaluatePenalty(deviation: number): PenaltyLevel {
    if (deviation <= 1.0) return 'NONE';
    if (deviation <= 5.0) return 'MINOR';
    if (deviation <= 10.0) return 'MODERATE';
    return 'SEVERE';
}

/**
 * 执行惩罚（质押扣除 + 降级 + 禁止抢单）
 * @param feederId 喂价员 ID
 * @param level 惩罚级别
 * @param orderId 关联的订单 ID (用于记录)
 * @returns 惩罚执行结果
 */
export async function executePenalty(
    feederId: string,
    level: PenaltyLevel,
    orderId?: string
): Promise<PenaltyResult> {
    const config = PENALTY_CONFIGS[level];

    if (level === 'NONE') {
        return {
            level: 'NONE',
            executed: false,
            slashedAmount: 0,
            oldRank: '',
            newRank: '',
            banUntil: null,
            description: config.description
        };
    }

    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId },
        include: { stakeRecords: { where: { status: 'ACTIVE' } } }
    });

    if (!feeder) {
        throw new Error(`Feeder not found: ${feederId}`);
    }

    const oldRank = feeder.rank;
    let slashedAmount = 0;
    let banUntil: Date | null = null;

    // 1. 质押扣除 (Slashing)
    if (config.stakeSlashPercent > 0) {
        slashedAmount = feeder.stakedAmount * (config.stakeSlashPercent / 100);

        if (slashedAmount > 0) {
            // 从活跃质押记录中扣除
            let remainingSlash = slashedAmount;
            for (const record of feeder.stakeRecords) {
                if (remainingSlash <= 0) break;
                const slashFromRecord = Math.min(record.amount, remainingSlash);
                const newAmount = record.amount - slashFromRecord;

                await prisma.stakeRecord.update({
                    where: { id: record.id },
                    data: {
                        amount: newAmount,
                        slashedAmount: record.slashedAmount + slashFromRecord,
                        slashReason: `${config.description} (订单: ${orderId || 'N/A'})`,
                        status: newAmount <= 0 ? 'SLASHED' : 'ACTIVE'
                    }
                });
                remainingSlash -= slashFromRecord;
            }

            // 更新喂价员总质押额
            await prisma.feeder.update({
                where: { id: feederId },
                data: {
                    stakedAmount: Math.max(0, feeder.stakedAmount - slashedAmount)
                }
            });

            console.log(`💸 质押扣除: ${feederId} 扣除 ${slashedAmount.toFixed(2)} USDT (${config.stakeSlashPercent}%)`);
        }
    }

    // 2. 等级降级
    let newRank = oldRank;
    if (config.rankDowngrade > 0) {
        const currentIndex = RANK_ORDER.indexOf(oldRank);
        const newIndex = Math.max(0, currentIndex - config.rankDowngrade);
        newRank = RANK_ORDER[newIndex];
    }

    // 3. 禁止抢单
    if (config.banDays > 0) {
        if (config.banDays === Infinity) {
            // 永久封禁：设为 2099 年
            banUntil = new Date('2099-12-31T23:59:59Z');
        } else {
            banUntil = new Date();
            banUntil.setDate(banUntil.getDate() + config.banDays);
        }
    }

    // 4. 应用 XP 惩罚 + 等级 + 封禁
    const newXp = Math.max(0, feeder.xp + config.xpPenalty);
    await prisma.feeder.update({
        where: { id: feederId },
        data: {
            xp: newXp,
            rank: newRank,
            isBanned: banUntil !== null,
            banUntil: banUntil
        }
    });

    console.log(`⚖️ 惩罚执行: ${feederId} [${level}]`);
    console.log(`   等级: ${oldRank} → ${newRank}`);
    console.log(`   质押扣除: ${slashedAmount.toFixed(2)} USDT`);
    console.log(`   禁止至: ${banUntil ? banUntil.toISOString() : '无'}`);

    // 5. 广播惩罚事件
    io.emit('penalty:executed', {
        feederId,
        level,
        oldRank,
        newRank,
        slashedAmount,
        banUntil,
        description: config.description
    });

    return {
        level,
        executed: true,
        slashedAmount,
        oldRank,
        newRank,
        banUntil,
        description: config.description
    };
}

/**
 * 评估并执行惩罚（根据偏差自动判定级别）
 * @param feederId 喂价员 ID
 * @param deviation 偏差百分比
 * @param orderId 关联的订单 ID
 * @returns 惩罚结果（如无惩罚则返回 null）
 */
export async function evaluateAndExecutePenalty(
    feederId: string,
    deviation: number,
    orderId?: string
): Promise<PenaltyResult | null> {
    const level = evaluatePenalty(deviation);
    if (level === 'NONE') return null;

    return executePenalty(feederId, level, orderId);
}

/**
 * 检查喂价员是否被禁止
 * @param feederId 喂价员 ID
 * @returns { banned: boolean, banUntil: Date | null, reason: string }
 */
export async function checkBanStatus(
    feederId: string
): Promise<{ banned: boolean; banUntil: Date | null; reason: string }> {
    const feeder = await prisma.feeder.findUnique({
        where: { id: feederId }
    });

    if (!feeder) {
        throw new Error(`Feeder not found: ${feederId}`);
    }

    // 如果没有被封禁
    if (!feeder.isBanned) {
        return { banned: false, banUntil: null, reason: '' };
    }

    // 检查封禁是否已过期
    if (feeder.banUntil && new Date() >= feeder.banUntil) {
        // 封禁已过期，自动解除
        await prisma.feeder.update({
            where: { id: feederId },
            data: {
                isBanned: false,
                banUntil: null
            }
        });
        console.log(`🔓 自动解除封禁: ${feederId}`);
        return { banned: false, banUntil: null, reason: '封禁已过期，已自动解除' };
    }

    // 仍在封禁期内
    return {
        banned: true,
        banUntil: feeder.banUntil,
        reason: feeder.banUntil
            ? `禁止抢单至 ${feeder.banUntil.toISOString()}`
            : '永久封禁'
    };
}

/**
 * 获取惩罚配置信息（供前端展示）
 */
export function getPenaltyConfigs(): Record<PenaltyLevel, PenaltyConfig> {
    return { ...PENALTY_CONFIGS };
}
