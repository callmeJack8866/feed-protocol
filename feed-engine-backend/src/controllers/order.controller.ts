import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { matchOrdersForFeeder } from '../services/matching.service';
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

            if (allRevealed) {
                // 计算共识价格（中位数）
                const prices = order.submissions
                    .map(s => s.revealedPrice!)
                    .sort((a, b) => a - b);

                const mid = Math.floor(prices.length / 2);
                const consensusPrice = prices.length % 2 === 0
                    ? (prices[mid - 1] + prices[mid]) / 2
                    : prices[mid];

                // 更新订单
                await prisma.order.update({
                    where: { id },
                    data: {
                        status: 'SETTLED',
                        finalPrice: consensusPrice,
                        settledAt: new Date()
                    }
                });

                // 广播共识达成
                io.emit('order:consensus', { orderId: id, consensusPrice });
            }
        }

        res.json({ success: true, submission });
    } catch (error) {
        console.error('Reveal price error:', error);
        res.status(500).json({ error: 'Failed to reveal price' });
    }
});

export default router;
