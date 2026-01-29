import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { io } from '../index';
import { uploadOrderToIPFS } from '../services/ipfs.service';

const router = Router();

// 管理员地址白名单（可从环境变量或数据库配置）
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES || '').toLowerCase().split(',').filter(Boolean);

/**
 * 管理员验证中间件
 */
function adminAuth(req: Request, res: Response, next: Function) {
    const address = req.headers['x-wallet-address'] as string;

    if (!address) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // 开发模式下允许所有请求
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    if (!ADMIN_ADDRESSES.includes(address.toLowerCase())) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

/**
 * GET /api/admin/stats
 * 获取系统统计数据
 */
router.get('/stats', adminAuth, async (req: Request, res: Response) => {
    try {
        const [
            totalFeeders,
            totalOrders,
            openOrders,
            settledOrders,
            totalArbitrations,
            pendingArbitrations
        ] = await Promise.all([
            prisma.feeder.count(),
            prisma.order.count(),
            prisma.order.count({ where: { status: 'OPEN' } }),
            prisma.order.count({ where: { status: 'SETTLED' } }),
            prisma.arbitrationCase.count(),
            prisma.arbitrationCase.count({ where: { status: { in: ['PENDING', 'VOTING'] } } })
        ]);

        // 按等级统计喂价员
        const feedersByRank = await prisma.feeder.groupBy({
            by: ['rank'],
            _count: { id: true }
        });

        // 按市场统计订单
        const ordersByMarket = await prisma.order.groupBy({
            by: ['market'],
            _count: { id: true },
            _sum: { notionalAmount: true }
        });

        // 今日统计
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayOrders = await prisma.order.count({
            where: { createdAt: { gte: today } }
        });

        const todaySettled = await prisma.order.count({
            where: { settledAt: { gte: today } }
        });

        res.json({
            success: true,
            stats: {
                feeders: {
                    total: totalFeeders,
                    byRank: feedersByRank.reduce((acc, item) => {
                        acc[item.rank] = item._count.id;
                        return acc;
                    }, {} as Record<string, number>)
                },
                orders: {
                    total: totalOrders,
                    open: openOrders,
                    settled: settledOrders,
                    todayCreated: todayOrders,
                    todaySettled: todaySettled,
                    byMarket: ordersByMarket.map(item => ({
                        market: item.market,
                        count: item._count.id,
                        totalNotional: item._sum.notionalAmount || 0
                    }))
                },
                arbitrations: {
                    total: totalArbitrations,
                    pending: pendingArbitrations
                }
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

/**
 * POST /api/admin/orders
 * 创建喂价订单（管理员/NST协议调用）
 */
router.post('/orders', adminAuth, async (req: Request, res: Response) => {
    try {
        const {
            symbol,
            market,
            country,
            exchange,
            feedType,
            notionalAmount,
            specialConditions,
            rewardAmount,
            feeAmount,
            grabTimeout,
            feedTimeout,
            sourceProtocol,
            callbackUrl
        } = req.body;

        // 验证必填字段
        if (!symbol || !market || !country || !exchange || !feedType || !notionalAmount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 根据名义本金确定所需喂价员数量和共识门槛
        const { requiredFeeders, consensusThreshold } = calculateConsensusConfig(notionalAmount);

        // 计算过期时间
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (grabTimeout || 300));

        // 创建订单
        const order = await prisma.order.create({
            data: {
                symbol,
                market,
                country,
                exchange,
                feedType: feedType || 'SETTLEMENT',
                notionalAmount: parseFloat(notionalAmount),
                requiredFeeders,
                consensusThreshold,
                specialConditions: JSON.stringify(specialConditions || []),
                rewardAmount: rewardAmount || calculateReward(notionalAmount),
                feeAmount: feeAmount || 5,
                grabTimeout: grabTimeout || 300,
                feedTimeout: feedTimeout || 600,
                expiresAt,
                sourceProtocol: sourceProtocol || null,
                callbackUrl: callbackUrl || null,
                status: 'OPEN'
            }
        });

        // 上传到 IPFS
        try {
            const ipfsHash = await uploadOrderToIPFS({
                id: order.id,
                symbol: order.symbol,
                market: order.market,
                feedType: order.feedType,
                notionalAmount: order.notionalAmount,
                specialConditions: specialConditions || [],
                createdAt: order.createdAt
            });

            await prisma.order.update({
                where: { id: order.id },
                data: { ipfsHash }
            });
        } catch (ipfsError) {
            console.warn('IPFS upload failed:', ipfsError);
        }

        // 广播新订单
        io.emit('order:new', order);
        io.to(`market:${market}`).emit('order:new', order);

        res.json({ success: true, order });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

/**
 * POST /api/admin/orders/batch
 * 批量创建订单
 */
router.post('/orders/batch', adminAuth, async (req: Request, res: Response) => {
    try {
        const { orders } = req.body;

        if (!Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ error: 'Orders array required' });
        }

        if (orders.length > 100) {
            return res.status(400).json({ error: 'Maximum 100 orders per batch' });
        }

        const createdOrders = [];

        for (const orderData of orders) {
            const { requiredFeeders, consensusThreshold } = calculateConsensusConfig(orderData.notionalAmount);

            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + (orderData.grabTimeout || 300));

            const order = await prisma.order.create({
                data: {
                    symbol: orderData.symbol,
                    market: orderData.market,
                    country: orderData.country,
                    exchange: orderData.exchange,
                    feedType: orderData.feedType || 'SETTLEMENT',
                    notionalAmount: parseFloat(orderData.notionalAmount),
                    requiredFeeders,
                    consensusThreshold,
                    specialConditions: JSON.stringify(orderData.specialConditions || []),
                    rewardAmount: orderData.rewardAmount || calculateReward(orderData.notionalAmount),
                    feeAmount: orderData.feeAmount || 5,
                    grabTimeout: orderData.grabTimeout || 300,
                    feedTimeout: orderData.feedTimeout || 600,
                    expiresAt,
                    sourceProtocol: orderData.sourceProtocol || null,
                    callbackUrl: orderData.callbackUrl || null,
                    status: 'OPEN'
                }
            });

            createdOrders.push(order);
        }

        // 广播批量订单
        io.emit('orders:batch', { count: createdOrders.length });

        res.json({ success: true, orders: createdOrders, count: createdOrders.length });
    } catch (error) {
        console.error('Batch create orders error:', error);
        res.status(500).json({ error: 'Failed to create orders' });
    }
});

/**
 * PUT /api/admin/orders/:id/cancel
 * 取消订单
 */
router.put('/orders/:id/cancel', adminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await prisma.order.findUnique({
            where: { id }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!['OPEN', 'GRABBED'].includes(order.status)) {
            return res.status(400).json({ error: 'Cannot cancel order in current status' });
        }

        const updated = await prisma.order.update({
            where: { id },
            data: { status: 'CANCELLED' }
        });

        io.emit('order:cancelled', { orderId: id, reason });

        res.json({ success: true, order: updated });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

/**
 * GET /api/admin/feeders
 * 获取喂价员列表（管理视角）
 */
router.get('/feeders', adminAuth, async (req: Request, res: Response) => {
    try {
        const { rank, isBanned, page = '1', limit = '50' } = req.query;

        const where: any = {};
        if (rank) where.rank = rank;
        if (isBanned === 'true') where.isBanned = true;
        if (isBanned === 'false') where.isBanned = false;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);

        const [feeders, total] = await Promise.all([
            prisma.feeder.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                include: {
                    _count: {
                        select: {
                            submissions: true,
                            stakeRecords: true
                        }
                    }
                }
            }),
            prisma.feeder.count({ where })
        ]);

        res.json({
            success: true,
            feeders,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Get feeders error:', error);
        res.status(500).json({ error: 'Failed to get feeders' });
    }
});

/**
 * PUT /api/admin/feeders/:id/ban
 * 封禁喂价员
 */
router.put('/feeders/:id/ban', adminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason, days } = req.body;

        const banUntil = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

        const feeder = await prisma.feeder.update({
            where: { id },
            data: {
                isBanned: true,
                banUntil
            }
        });

        res.json({ success: true, feeder, message: `Banned until ${banUntil || 'permanently'}` });
    } catch (error) {
        console.error('Ban feeder error:', error);
        res.status(500).json({ error: 'Failed to ban feeder' });
    }
});

/**
 * PUT /api/admin/feeders/:id/unban
 * 解封喂价员
 */
router.put('/feeders/:id/unban', adminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const feeder = await prisma.feeder.update({
            where: { id },
            data: {
                isBanned: false,
                banUntil: null
            }
        });

        res.json({ success: true, feeder });
    } catch (error) {
        console.error('Unban feeder error:', error);
        res.status(500).json({ error: 'Failed to unban feeder' });
    }
});

/**
 * POST /api/admin/licenses/mint
 * 铸造 NFT 执照（记录到数据库）
 */
router.post('/licenses/mint', adminAuth, async (req: Request, res: Response) => {
    try {
        const { tokenId, name, tier, maxRank, dailyLimit, feeDiscount, ownerAddress } = req.body;

        if (!tokenId || !tier || !maxRank) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const license = await prisma.feederLicense.create({
            data: {
                tokenId,
                name: name || `${tier} Feeder License #${tokenId}`,
                tier,
                maxRank,
                dailyLimit: dailyLimit || 100,
                feeDiscount: feeDiscount || 0,
                ownerAddress: ownerAddress?.toLowerCase() || null
            }
        });

        res.json({ success: true, license });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'License with this token ID already exists' });
        }
        console.error('Mint license error:', error);
        res.status(500).json({ error: 'Failed to mint license' });
    }
});

/**
 * 根据名义本金计算共识配置
 */
function calculateConsensusConfig(notionalAmount: number): { requiredFeeders: number; consensusThreshold: string } {
    if (notionalAmount >= 1000000) {
        // 100万U 以上
        return { requiredFeeders: 7, consensusThreshold: '5/7' };
    } else if (notionalAmount >= 100000) {
        // 10万U - 100万U
        return { requiredFeeders: 5, consensusThreshold: '3/5' };
    } else {
        // 10万U 以下
        return { requiredFeeders: 3, consensusThreshold: '2/3' };
    }
}

/**
 * 根据名义本金计算奖励
 */
function calculateReward(notionalAmount: number): number {
    // 基础奖励 + 按本金比例
    const baseReward = 10; // 10 FEED
    const bonusRate = 0.0001; // 0.01% 的名义本金
    return baseReward + notionalAmount * bonusRate;
}

export default router;
