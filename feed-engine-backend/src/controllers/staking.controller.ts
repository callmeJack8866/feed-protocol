import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// 质押要求配置
const STAKE_REQUIREMENTS: Record<string, { minStake: number; dailyLimit: number }> = {
    'F': { minStake: 100, dailyLimit: 10 },
    'E': { minStake: 500, dailyLimit: 20 },
    'D': { minStake: 1000, dailyLimit: 30 },
    'C': { minStake: 2500, dailyLimit: 50 },
    'B': { minStake: 5000, dailyLimit: 80 },
    'A': { minStake: 10000, dailyLimit: 120 },
    'S': { minStake: 25000, dailyLimit: Infinity }
};

// 解锁冷却期（30天）
const UNLOCK_COOLDOWN_DAYS = 30;

/**
 * GET /api/staking/info
 * 获取当前用户的质押信息
 */
router.get('/info', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() },
            include: {
                stakeRecords: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 计算总质押金额
        const activeStakes = feeder.stakeRecords.filter(s => s.status === 'ACTIVE');
        const totalStaked = activeStakes.reduce((sum, s) => sum + s.amount, 0);

        // 获取当前等级要求
        const currentRequirement = STAKE_REQUIREMENTS[feeder.rank];
        const nextRank = getNextRank(feeder.rank);
        const nextRequirement = nextRank ? STAKE_REQUIREMENTS[nextRank] : null;

        res.json({
            success: true,
            staking: {
                currentStake: totalStaked,
                stakeType: feeder.stakeType,
                nftLicenseId: feeder.nftLicenseId,
                rank: feeder.rank,
                requirement: currentRequirement,
                nextRankRequirement: nextRequirement ? {
                    rank: nextRank,
                    minStake: nextRequirement.minStake,
                    additionalNeeded: Math.max(0, nextRequirement.minStake - totalStaked)
                } : null,
                records: feeder.stakeRecords
            }
        });
    } catch (error) {
        console.error('Get staking info error:', error);
        res.status(500).json({ error: 'Failed to get staking info' });
    }
});

/**
 * POST /api/staking/stake
 * 质押代币/NFT
 */
router.post('/stake', async (req: Request, res: Response) => {
    try {
        const { stakeType, amount, nftTokenId, txHash } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !stakeType || !txHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['FEED', 'USDT', 'NFT'].includes(stakeType)) {
            return res.status(400).json({ error: 'Invalid stake type' });
        }

        if (stakeType !== 'NFT' && (!amount || amount <= 0)) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (stakeType === 'NFT' && !nftTokenId) {
            return res.status(400).json({ error: 'NFT token ID required' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 创建质押记录
        const stakeRecord = await prisma.stakeRecord.create({
            data: {
                feederId: feeder.id,
                stakeType,
                amount: stakeType === 'NFT' ? 0 : parseFloat(amount),
                nftTokenId: stakeType === 'NFT' ? nftTokenId : null,
                txHash,
                status: 'ACTIVE'
            }
        });

        // 更新喂价员质押信息
        const newStakedAmount = feeder.stakedAmount + (stakeType === 'NFT' ? 0 : parseFloat(amount));
        await prisma.feeder.update({
            where: { id: feeder.id },
            data: {
                stakedAmount: newStakedAmount,
                stakeType,
                nftLicenseId: stakeType === 'NFT' ? nftTokenId : feeder.nftLicenseId
            }
        });

        // 如果是 NFT 质押，更新 NFT 状态
        if (stakeType === 'NFT') {
            await prisma.feederLicense.updateMany({
                where: { tokenId: nftTokenId },
                data: {
                    isStaked: true,
                    stakedBy: feeder.id
                }
            });
        }

        res.json({ success: true, record: stakeRecord });
    } catch (error) {
        console.error('Stake error:', error);
        res.status(500).json({ error: 'Failed to stake' });
    }
});

/**
 * POST /api/staking/request-unlock
 * 申请解锁质押（开始 30 天冷却期）
 */
router.post('/request-unlock', async (req: Request, res: Response) => {
    try {
        const { recordId } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !recordId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const record = await prisma.stakeRecord.findUnique({
            where: { id: recordId }
        });

        if (!record || record.feederId !== feeder.id) {
            return res.status(404).json({ error: 'Stake record not found' });
        }

        if (record.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Stake is not active' });
        }

        // 计算解锁后剩余质押
        const remainingStake = feeder.stakedAmount - record.amount;
        const minRequired = STAKE_REQUIREMENTS[feeder.rank]?.minStake || 0;

        if (remainingStake < minRequired) {
            return res.status(400).json({
                error: 'Cannot unlock: remaining stake would be below minimum requirement',
                minRequired,
                remainingAfterUnlock: remainingStake
            });
        }

        // 设置解锁时间
        const unlockAvailableAt = new Date();
        unlockAvailableAt.setDate(unlockAvailableAt.getDate() + UNLOCK_COOLDOWN_DAYS);

        const updated = await prisma.stakeRecord.update({
            where: { id: recordId },
            data: {
                status: 'UNLOCKING',
                unlockRequestedAt: new Date(),
                unlockAvailableAt
            }
        });

        res.json({
            success: true,
            record: updated,
            message: `Unlock requested. Available for withdrawal on ${unlockAvailableAt.toISOString()}`
        });
    } catch (error) {
        console.error('Request unlock error:', error);
        res.status(500).json({ error: 'Failed to request unlock' });
    }
});

/**
 * POST /api/staking/withdraw
 * 提取已解锁的质押
 */
router.post('/withdraw', async (req: Request, res: Response) => {
    try {
        const { recordId, txHash } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !recordId || !txHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const record = await prisma.stakeRecord.findUnique({
            where: { id: recordId }
        });

        if (!record || record.feederId !== feeder.id) {
            return res.status(404).json({ error: 'Stake record not found' });
        }

        if (record.status !== 'UNLOCKING') {
            return res.status(400).json({ error: 'Stake is not in unlocking status' });
        }

        // 检查冷却期是否结束
        if (record.unlockAvailableAt && new Date() < record.unlockAvailableAt) {
            return res.status(400).json({
                error: 'Cooldown period not ended',
                availableAt: record.unlockAvailableAt
            });
        }

        // 更新记录
        const updated = await prisma.stakeRecord.update({
            where: { id: recordId },
            data: {
                status: 'WITHDRAWN',
                withdrawnAt: new Date(),
                withdrawTxHash: txHash
            }
        });

        // 更新喂价员质押总额
        await prisma.feeder.update({
            where: { id: feeder.id },
            data: {
                stakedAmount: { decrement: record.amount }
            }
        });

        // 如果是 NFT，释放 NFT
        if (record.stakeType === 'NFT' && record.nftTokenId) {
            await prisma.feederLicense.updateMany({
                where: { tokenId: record.nftTokenId },
                data: {
                    isStaked: false,
                    stakedBy: null
                }
            });
        }

        res.json({ success: true, record: updated });
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Failed to withdraw' });
    }
});

/**
 * GET /api/staking/licenses
 * 获取可用的 NFT 执照列表
 */
router.get('/licenses', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        const where: any = {};
        if (address) {
            where.ownerAddress = address.toLowerCase();
        }

        const licenses = await prisma.feederLicense.findMany({
            where,
            orderBy: { tier: 'asc' }
        });

        res.json({ success: true, licenses });
    } catch (error) {
        console.error('Get licenses error:', error);
        res.status(500).json({ error: 'Failed to get licenses' });
    }
});

/**
 * GET /api/staking/requirements
 * 获取各等级质押要求
 */
router.get('/requirements', async (req: Request, res: Response) => {
    res.json({
        success: true,
        requirements: STAKE_REQUIREMENTS,
        unlockCooldownDays: UNLOCK_COOLDOWN_DAYS
    });
});

/**
 * 获取下一等级
 */
function getNextRank(currentRank: string): string | null {
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
    const currentIndex = ranks.indexOf(currentRank);
    if (currentIndex < ranks.length - 1) {
        return ranks[currentIndex + 1];
    }
    return null;
}

export default router;
