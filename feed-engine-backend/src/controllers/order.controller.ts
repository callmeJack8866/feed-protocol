import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { matchOrdersForFeeder } from '../services/matching.service';
import { processOrderConsensus } from '../services/consensus.service';
import { io } from '../index';

const router = Router();

/**
 * GET /api/orders
 * 获取订单列表（支持筛选）
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { status, market, country, exchange, zone } = req.query;
        const address = req.headers['x-wallet-address'] as string;

        // 构建查询条件
        const where: any = {};

        if (status) where.status = status;
        if (market) where.market = market;
        if (country) where.country = country;
        if (exchange) where.exchange = exchange;

        // 按区域筛选（名义本金）
        if (zone === 'beginner') {
            where.notionalAmount = { lt: 100000 };
        } else if (zone === 'competitive') {
            where.notionalAmount = { gte: 100000, lt: 1000000 };
        } else if (zone === 'master') {
            where.notionalAmount = { gte: 1000000 };
        }

        // 如果有用户登录，使用智能匹配
        if (address) {
            const feeder = await prisma.feeder.findUnique({
                where: { address: address.toLowerCase() }
            });

            if (feeder) {
                // 解析 JSON 字符串
                const parseJson = (str: string): string[] => {
                    try { return JSON.parse(str) || []; }
                    catch { return []; }
                };

                const countries = parseJson(feeder.countries);
                const exchanges = parseJson(feeder.exchanges);
                const assetTypes = parseJson(feeder.assetTypes);

                if (countries.length > 0) {
                    where.country = { in: countries };
                }
                if (exchanges.length > 0) {
                    where.exchange = { in: exchanges };
                }
                if (assetTypes.length > 0) {
                    where.market = { in: assetTypes };
                }
            }
        }

        const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                submissions: {
                    select: {
                        feederId: true,
                        committedAt: true
                    }
                }
            }
        });

        // 计算剩余时间
        const now = new Date();
        const ordersWithTime = orders.map(order => ({
            ...order,
            timeRemaining: Math.max(0, Math.floor((order.expiresAt.getTime() - now.getTime()) / 1000))
        }));

        res.json({ success: true, orders: ordersWithTime });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

/**
 * GET /api/orders/:id
 * 获取订单详情
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                submissions: {
                    include: {
                        feeder: {
                            select: { address: true, nickname: true, rank: true }
                        }
                    }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ success: true, order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to get order' });
    }
});

/**
 * POST /api/orders/:id/grab
 * 抢单
 */
router.post('/:id/grab', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // 查找喂价员
        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 查找订单
        const order = await prisma.order.findUnique({
            where: { id },
            include: { submissions: true }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'OPEN' && order.status !== 'GRABBED') {
            return res.status(400).json({ error: 'Order not available for grabbing' });
        }

        // 检查是否已达到所需喂价员数量
        if (order.submissions.length >= order.requiredFeeders) {
            return res.status(400).json({ error: 'Order already fully grabbed' });
        }

        // 检查是否已经抢过
        const existingSubmission = order.submissions.find(s => s.feederId === feeder.id);
        if (existingSubmission) {
            return res.status(400).json({ error: 'Already grabbed this order' });
        }

        // 创建提交记录
        const submission = await prisma.priceSubmission.create({
            data: {
                orderId: id,
                feederId: feeder.id
            }
        });

        // 更新订单状态
        const newStatus = order.submissions.length + 1 >= order.requiredFeeders ? 'FEEDING' : 'GRABBED';
        await prisma.order.update({
            where: { id },
            data: { status: newStatus }
        });

        // 广播订单更新
        io.emit('order:grabbed', { orderId: id, feederId: feeder.id, newStatus });

        res.json({ success: true, submission, newStatus });
    } catch (error) {
        console.error('Grab order error:', error);
        res.status(500).json({ error: 'Failed to grab order' });
    }
});

/**
 * POST /api/orders/:id/submit
 * 提交价格哈希 (Commit 阶段)
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { priceHash, screenshot } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !priceHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 更新提交记录
        const submission = await prisma.priceSubmission.update({
            where: {
                orderId_feederId: { orderId: id, feederId: feeder.id }
            },
            data: {
                priceHash,
                screenshot,
                committedAt: new Date()
            }
        });

        // 广播提交事件
        io.emit('order:committed', { orderId: id, feederId: feeder.id });

        res.json({ success: true, submission });
    } catch (error) {
        console.error('Submit price error:', error);
        res.status(500).json({ error: 'Failed to submit price' });
    }
});

/**
 * POST /api/orders/:id/reveal
 * 揭示价格 (Reveal 阶段)
 */
router.post('/:id/reveal', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { price, salt } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !price || !salt) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 验证哈希 (简化版，实际需要 keccak256)
        // TODO: 实现完整的哈希验证

        // 更新提交记录
        const submission = await prisma.priceSubmission.update({
            where: {
                orderId_feederId: { orderId: id, feederId: feeder.id }
            },
            data: {
                revealedPrice: parseFloat(price),
                salt,
                revealedAt: new Date()
            }
        });

        // 检查是否所有人都已揭示
        const order = await prisma.order.findUnique({
            where: { id },
            include: { submissions: true }
        });

        if (order) {
            const allRevealed = order.submissions.every(s => s.revealedPrice !== null);

            if (allRevealed && order.submissions.length >= order.requiredFeeders) {
                // 使用共识服务处理（包含正确算法和成就检测）
                const result = await processOrderConsensus(id);

                if (result) {
                    // 广播共识达成
                    io.emit('order:consensus', { orderId: id, consensusPrice: result.consensusPrice });
                }
            }
        }

        res.json({ success: true, submission });
    } catch (error) {
        console.error('Reveal price error:', error);
        res.status(500).json({ error: 'Failed to reveal price' });
    }
});

/**
 * "无法喂价" 原因类型
 */
const UNABLE_TO_FEED_REASONS = [
    'SUSPENSION',      // 标的停牌
    'NO_DATA',         // 数据源无数据
    'INVALID_CODE',    // 代码错误/不存在
    'MARKET_CLOSED',   // 市场休市
    'OTHER'            // 其他
];

/**
 * POST /api/orders/:id/unable-to-feed
 * 喂价员报告无法喂价
 */
router.post('/:id/unable-to-feed', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason, description, evidence } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!reason || !UNABLE_TO_FEED_REASONS.includes(reason)) {
            return res.status(400).json({
                error: 'Invalid reason',
                validReasons: UNABLE_TO_FEED_REASONS
            });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 查找该喂价员的提交记录
        const submission = await prisma.priceSubmission.findUnique({
            where: {
                orderId_feederId: { orderId: id, feederId: feeder.id }
            }
        });

        if (!submission) {
            return res.status(404).json({ error: 'No submission found for this order' });
        }

        // 更新提交记录，标记为无法喂价
        await prisma.priceSubmission.update({
            where: { id: submission.id },
            data: {
                // 使用特殊值标记无法喂价
                priceHash: `UNABLE:${reason}`,
                screenshot: evidence || null,
                committedAt: new Date()
            }
        });

        // 记录无法喂价报告（如果有 UnableFeedReport 模型）
        // 这里假设使用 FeedHistory 记录特殊情况
        await prisma.feedHistory.create({
            data: {
                feederId: feeder.id,
                orderId: id,
                symbol: 'N/A',
                market: 'N/A',
                price: 0,
                deviation: 0,
                reward: 0,
                xpEarned: 0
            }
        }).catch(() => {
            // 忽略创建失败
        });

        // 通知系统需要重新分配喂价员
        io.emit('order:unable-to-feed', {
            orderId: id,
            feederId: feeder.id,
            reason,
            description
        });

        res.json({
            success: true,
            message: 'Unable to feed reported successfully',
            reason,
            status: 'PENDING_REVIEW'
        });
    } catch (error) {
        console.error('Unable to feed report error:', error);
        res.status(500).json({ error: 'Failed to report unable to feed' });
    }
});

export default router;
