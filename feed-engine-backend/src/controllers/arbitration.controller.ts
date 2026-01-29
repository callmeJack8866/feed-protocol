import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { io } from '../index';

const router = Router();

/**
 * GET /api/arbitration/cases
 * 获取仲裁案件列表
 */
router.get('/cases', async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const address = req.headers['x-wallet-address'] as string;

        const where: any = {};
        if (status) where.status = status;

        const cases = await prisma.arbitrationCase.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                votes: {
                    select: { arbitratorId: true, vote: true }
                }
            }
        });

        // 添加投票统计
        const casesWithStats = cases.map(c => {
            const votes = c.votes;
            return {
                ...c,
                votesCount: votes.length,
                supportCount: votes.filter(v => v.vote === 'SUPPORT_INITIATOR').length,
                rejectCount: votes.filter(v => v.vote === 'REJECT_INITIATOR').length
            };
        });

        res.json({ success: true, cases: casesWithStats });
    } catch (error) {
        console.error('Get cases error:', error);
        res.status(500).json({ error: 'Failed to get arbitration cases' });
    }
});

/**
 * GET /api/arbitration/cases/:id
 * 获取仲裁案件详情
 */
router.get('/cases/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const arbitrationCase = await prisma.arbitrationCase.findUnique({
            where: { id },
            include: {
                votes: true,
                appeals: {
                    include: {
                        daoVotes: true
                    }
                }
            }
        });

        if (!arbitrationCase) {
            return res.status(404).json({ error: 'Case not found' });
        }

        res.json({ success: true, case: arbitrationCase });
    } catch (error) {
        console.error('Get case error:', error);
        res.status(500).json({ error: 'Failed to get case' });
    }
});

/**
 * POST /api/arbitration/cases
 * 创建仲裁案件（发起争议）
 */
router.post('/cases', async (req: Request, res: Response) => {
    try {
        const { orderId, disputeReason, description, evidenceUrls, disputedFeederId } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !orderId || !disputeReason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 查找发起人
        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 查找订单
        const order = await prisma.order.findUnique({
            where: { id: orderId }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // 判断仲裁类型（高级仲裁需要 S 级）
        const caseType = order.notionalAmount >= 1000000 ? 'ADVANCED' : 'NORMAL';

        // 设置投票截止时间（3天后）
        const votingDeadline = new Date();
        votingDeadline.setDate(votingDeadline.getDate() + 3);

        // 创建仲裁案件
        const arbitrationCase = await prisma.arbitrationCase.create({
            data: {
                orderId,
                initiatorId: feeder.id,
                initiatorType: 'FEEDER',
                disputeReason,
                description: description || '',
                evidenceUrls: JSON.stringify(evidenceUrls || []),
                disputedFeederId,
                caseType,
                depositAmount: 50,
                requiredVotes: caseType === 'ADVANCED' ? 5 : 3,
                votingDeadline
            }
        });

        // 广播新仲裁案件
        io.emit('arbitration:new', { caseId: arbitrationCase.id });

        res.json({ success: true, case: arbitrationCase });
    } catch (error) {
        console.error('Create case error:', error);
        res.status(500).json({ error: 'Failed to create arbitration case' });
    }
});

/**
 * POST /api/arbitration/cases/:id/pay-deposit
 * 支付仲裁押金
 */
router.post('/cases/:id/pay-deposit', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { txHash } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !txHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const arbitrationCase = await prisma.arbitrationCase.findUnique({
            where: { id }
        });

        if (!arbitrationCase) {
            return res.status(404).json({ error: 'Case not found' });
        }

        // 验证是发起人
        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder || feeder.id !== arbitrationCase.initiatorId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // 更新押金状态
        const updated = await prisma.arbitrationCase.update({
            where: { id },
            data: {
                depositPaid: true,
                depositTxHash: txHash,
                status: 'VOTING'
            }
        });

        // 分配仲裁员
        await assignArbitrators(id, arbitrationCase.caseType);

        res.json({ success: true, case: updated });
    } catch (error) {
        console.error('Pay deposit error:', error);
        res.status(500).json({ error: 'Failed to pay deposit' });
    }
});

/**
 * POST /api/arbitration/cases/:id/vote
 * 仲裁员投票
 */
router.post('/cases/:id/vote', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { vote, reason, evidenceUrls } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !vote) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 验证投票选项
        if (!['SUPPORT_INITIATOR', 'REJECT_INITIATOR', 'ABSTAIN'].includes(vote)) {
            return res.status(400).json({ error: 'Invalid vote option' });
        }

        // 查找仲裁员
        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 验证仲裁员资格（A 级或 S 级）
        if (!['A', 'S'].includes(feeder.rank)) {
            return res.status(403).json({ error: 'Only A/S rank feeders can vote on arbitration' });
        }

        // 查找案件
        const arbitrationCase = await prisma.arbitrationCase.findUnique({
            where: { id }
        });

        if (!arbitrationCase) {
            return res.status(404).json({ error: 'Case not found' });
        }

        if (arbitrationCase.status !== 'VOTING') {
            return res.status(400).json({ error: 'Case is not in voting phase' });
        }

        // 高级仲裁只允许 S 级
        if (arbitrationCase.caseType === 'ADVANCED' && feeder.rank !== 'S') {
            return res.status(403).json({ error: 'Only S rank feeders can vote on advanced cases' });
        }

        // 创建投票
        const arbitrationVote = await prisma.arbitrationVote.create({
            data: {
                caseId: id,
                arbitratorId: feeder.id,
                vote,
                reason: reason || null,
                evidenceUrls: JSON.stringify(evidenceUrls || [])
            }
        });

        // 检查是否达到投票门槛
        await checkAndResolveCase(id);

        // 广播投票事件
        io.emit('arbitration:vote', { caseId: id, vote: arbitrationVote });

        res.json({ success: true, vote: arbitrationVote });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Already voted on this case' });
        }
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to submit vote' });
    }
});

/**
 * POST /api/arbitration/cases/:id/appeal
 * 发起 DAO 申诉
 */
router.post('/cases/:id/appeal', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason, evidenceUrls } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const arbitrationCase = await prisma.arbitrationCase.findUnique({
            where: { id }
        });

        if (!arbitrationCase) {
            return res.status(404).json({ error: 'Case not found' });
        }

        if (arbitrationCase.status !== 'RESOLVED') {
            return res.status(400).json({ error: 'Can only appeal resolved cases' });
        }

        // 设置投票截止时间（7天后）
        const votingDeadline = new Date();
        votingDeadline.setDate(votingDeadline.getDate() + 7);

        const appeal = await prisma.appeal.create({
            data: {
                caseId: id,
                appellantId: feeder.id,
                reason,
                evidenceUrls: JSON.stringify(evidenceUrls || []),
                depositAmount: 100,
                votingDeadline
            }
        });

        // 广播申诉事件
        io.emit('arbitration:appeal', { caseId: id, appealId: appeal.id });

        res.json({ success: true, appeal });
    } catch (error) {
        console.error('Appeal error:', error);
        res.status(500).json({ error: 'Failed to create appeal' });
    }
});

/**
 * POST /api/arbitration/appeals/:id/vote
 * DAO 投票
 */
router.post('/appeals/:id/vote', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { vote, feedAmount } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !vote || feedAmount === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['SUPPORT', 'REJECT'].includes(vote)) {
            return res.status(400).json({ error: 'Invalid vote option' });
        }

        const appeal = await prisma.appeal.findUnique({
            where: { id }
        });

        if (!appeal) {
            return res.status(404).json({ error: 'Appeal not found' });
        }

        if (appeal.status !== 'VOTING') {
            return res.status(400).json({ error: 'Appeal is not in voting phase' });
        }

        // 创建 DAO 投票
        const daoVote = await prisma.dAOVote.create({
            data: {
                appealId: id,
                voterId: address.toLowerCase(),
                vote,
                feedAmount: parseFloat(feedAmount)
            }
        });

        // 更新投票统计
        const voteWeight = parseFloat(feedAmount);
        await prisma.appeal.update({
            where: { id },
            data: {
                supportVotes: vote === 'SUPPORT'
                    ? { increment: voteWeight }
                    : undefined,
                rejectVotes: vote === 'REJECT'
                    ? { increment: voteWeight }
                    : undefined,
                totalVoters: { increment: 1 }
            }
        });

        res.json({ success: true, vote: daoVote });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Already voted on this appeal' });
        }
        console.error('DAO vote error:', error);
        res.status(500).json({ error: 'Failed to submit DAO vote' });
    }
});

/**
 * 分配仲裁员
 */
async function assignArbitrators(caseId: string, caseType: string): Promise<void> {
    // 获取合格的仲裁员
    const minRank = caseType === 'ADVANCED' ? 'S' : 'A';
    const ranks = caseType === 'ADVANCED' ? ['S'] : ['A', 'S'];

    const eligibleFeeders = await prisma.feeder.findMany({
        where: {
            rank: { in: ranks },
            isBanned: false
        },
        orderBy: { accuracyRate: 'desc' },
        take: 10
    });

    const arbitratorIds = eligibleFeeders.map(f => f.id);

    await prisma.arbitrationCase.update({
        where: { id: caseId },
        data: {
            arbitrators: JSON.stringify(arbitratorIds)
        }
    });
}

/**
 * 检查并结算仲裁案件
 */
async function checkAndResolveCase(caseId: string): Promise<void> {
    const arbitrationCase = await prisma.arbitrationCase.findUnique({
        where: { id: caseId },
        include: { votes: true }
    });

    if (!arbitrationCase || arbitrationCase.status !== 'VOTING') {
        return;
    }

    const votes = arbitrationCase.votes;
    if (votes.length < arbitrationCase.requiredVotes) {
        return;
    }

    // 统计投票
    const supportCount = votes.filter(v => v.vote === 'SUPPORT_INITIATOR').length;
    const rejectCount = votes.filter(v => v.vote === 'REJECT_INITIATOR').length;

    let verdict: string;
    let verdictReason: string;

    if (supportCount > rejectCount) {
        verdict = 'INITIATOR_WIN';
        verdictReason = `支持票 ${supportCount} > 反对票 ${rejectCount}`;
    } else if (rejectCount > supportCount) {
        verdict = 'INITIATOR_LOSE';
        verdictReason = `反对票 ${rejectCount} > 支持票 ${supportCount}`;
    } else {
        verdict = 'INCONCLUSIVE';
        verdictReason = '票数相等，无定论';
    }

    await prisma.arbitrationCase.update({
        where: { id: caseId },
        data: {
            status: 'RESOLVED',
            verdict,
            verdictReason,
            depositReturned: verdict === 'INITIATOR_WIN',
            resolvedAt: new Date()
        }
    });

    // 广播结果
    io.emit('arbitration:resolved', { caseId, verdict });
}

export default router;
