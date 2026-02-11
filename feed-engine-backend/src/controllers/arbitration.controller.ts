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
                evidenceUrls: evidenceUrls || [],
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
                evidenceUrls: evidenceUrls || []
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
                evidenceUrls: evidenceUrls || [],
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
        const updatedAppeal = await prisma.appeal.update({
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

        // 检查是否达到解决条件
        await checkAndResolveAppeal(id);

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

    // 计算押金分配
    const depositAmount = arbitrationCase.depositAmount;
    const depositReturned = verdict === 'INITIATOR_WIN';

    // 更新案件状态
    await prisma.arbitrationCase.update({
        where: { id: caseId },
        data: {
            status: 'RESOLVED',
            verdict,
            verdictReason,
            depositReturned,
            resolvedAt: new Date()
        }
    });

    // 分配仲裁费用给投票正确的仲裁员
    await distributeArbitrationFees(caseId, votes, verdict, depositAmount, depositReturned);

    // 广播结果
    io.emit('arbitration:resolved', { caseId, verdict });
}

/**
 * 分配仲裁费用
 * 按照实施方案：
 * - 发起方胜诉：返还押金，被告方罚款的一部分分配给仲裁员
 * - 发起方败诉：押金的一部分分配给仲裁员
 */
async function distributeArbitrationFees(
    caseId: string,
    votes: any[],
    verdict: string,
    depositAmount: number,
    depositReturned: boolean
): Promise<void> {
    // 确定正确的投票方向
    const correctVote = verdict === 'INITIATOR_WIN' ? 'SUPPORT_INITIATOR' : 'REJECT_INITIATOR';

    // 获取投票正确的仲裁员
    const correctVoters = votes.filter(v => v.vote === correctVote);

    if (correctVoters.length === 0) {
        console.log('No correct voters to distribute fees');
        return;
    }

    // 计算分配金额
    // 如果发起方败诉，70% 押金分配给仲裁员
    // 如果发起方胜诉，假设有被告方罚款（这里简化处理）
    const feePool = depositReturned ? 0 : depositAmount * 0.7;
    const feePerArbitrator = feePool / correctVoters.length;

    console.log(`📊 仲裁费用分配: 案件 ${caseId}`);
    console.log(`   - 正确投票数: ${correctVoters.length}`);
    console.log(`   - 费用池: ${feePool} FEED`);
    console.log(`   - 每人分配: ${feePerArbitrator} FEED`);

    // 记录费用分配（这里简化为日志，实际需要更新链上或数据库）
    for (const voter of correctVoters) {
        try {
            // 更新仲裁员的奖励记录
            await prisma.feeder.update({
                where: { id: voter.arbitratorId },
                data: {
                    // 假设有一个 arbitrationRewards 字段
                    // 这里使用 XP 奖励作为替代
                    xp: { increment: Math.floor(feePerArbitrator) }
                }
            });

            console.log(`   ✅ 仲裁员 ${voter.arbitratorId} 获得 ${feePerArbitrator} 奖励`);
        } catch (error) {
            console.error(`   ❌ 分配失败: ${voter.arbitratorId}`, error);
        }
    }

    // 惩罚投票错误的仲裁员
    const incorrectVoters = votes.filter(v => v.vote !== correctVote && v.vote !== 'ABSTAIN');
    for (const voter of incorrectVoters) {
        try {
            await prisma.feeder.update({
                where: { id: voter.arbitratorId },
                data: {
                    xp: { decrement: 10 } // 轻微 XP 惩罚
                }
            });
            console.log(`   ⚠️ 仲裁员 ${voter.arbitratorId} 投票错误，扣除 10 XP`);
        } catch (error) {
            console.error(`   ❌ 惩罚失败: ${voter.arbitratorId}`, error);
        }
    }
}

/**
 * 检查并解决 DAO 申诉
 * 条件：支持票权重 > 反对票权重 * 2（超过2/3支持）
 */
async function checkAndResolveAppeal(appealId: string): Promise<void> {
    const appeal = await prisma.appeal.findUnique({
        where: { id: appealId },
        include: { case: true }
    });

    if (!appeal || appeal.status !== 'VOTING') {
        return;
    }

    const totalVotes = appeal.supportVotes + appeal.rejectVotes;

    // 需要至少1000 FEED投票参与
    const minVoteThreshold = 1000;
    if (totalVotes < minVoteThreshold) {
        console.log(`申诉 ${appealId} 投票权重不足: ${totalVotes}/${minVoteThreshold}`);
        return;
    }

    // 检查是否达到2/3多数
    const supportRatio = appeal.supportVotes / totalVotes;
    const rejectRatio = appeal.rejectVotes / totalVotes;

    let verdict: string;
    let verdictReason: string;

    if (supportRatio >= 0.67) {
        verdict = 'APPEAL_UPHELD'; // 申诉成功
        verdictReason = `支持票 ${appeal.supportVotes.toFixed(2)} (${(supportRatio * 100).toFixed(1)}%) 达到2/3多数`;
    } else if (rejectRatio >= 0.67) {
        verdict = 'APPEAL_REJECTED'; // 申诉失败
        verdictReason = `反对票 ${appeal.rejectVotes.toFixed(2)} (${(rejectRatio * 100).toFixed(1)}%) 达到2/3多数`;
    } else {
        // 未达到2/3多数，继续投票
        console.log(`申诉 ${appealId} 未达到多数: 支持 ${(supportRatio * 100).toFixed(1)}% 反对 ${(rejectRatio * 100).toFixed(1)}%`);
        return;
    }

    // 更新申诉状态
    await prisma.appeal.update({
        where: { id: appealId },
        data: {
            status: 'RESOLVED',
            resolvedAt: new Date()
        } as any // 扩展字段通过 as any 处理
    });

    // 如果申诉成功，需要推翻原仲裁结果
    if (verdict === 'APPEAL_UPHELD' && appeal.case) {
        const originalVerdict = appeal.case.verdict;
        const newVerdict = originalVerdict === 'INITIATOR_WIN' ? 'INITIATOR_LOSE' : 'INITIATOR_WIN';

        await prisma.arbitrationCase.update({
            where: { id: appeal.caseId },
            data: {
                verdict: newVerdict,
                verdictReason: `DAO 申诉推翻原判决: ${verdictReason}`,
                depositReturned: newVerdict === 'INITIATOR_WIN'
            }
        });

        console.log(`🔄 申诉 ${appealId} 成功: 原判决 ${originalVerdict} → ${newVerdict}`);
    }

    // 广播申诉结果
    io.emit('appeal:resolved', { appealId, verdict });

    console.log(`⚖️ 申诉 ${appealId} 已解决: ${verdict}`);
}

export default router;
