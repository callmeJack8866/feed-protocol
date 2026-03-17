/**
 * NST 协议集成控制器
 * 
 * 功能：
 * - 接收外部协议（NST 等）的喂价请求
 * - 查询订单状态和共识结果
 * - 支持批量查询协议订单
 * - 使用 API Key 认证（非 JWT）
 * 
 * 端点：
 * - POST   /api/nst/request-feed       创建喂价请求
 * - GET    /api/nst/order/:orderId/status  查询订单状态
 * - GET    /api/nst/order/:orderId/result  获取共识结果
 * - GET    /api/nst/orders              批量查询协议订单
 * 
 * @module controllers/nst.controller
 */

import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { requireApiKey } from '../middlewares/nst.middleware';
import { uploadOrderToIPFS } from '../services/ipfs.service';

const router = Router();

// ============ 辅助函数 ============

/**
 * 根据名义本金计算共识配置
 * @param notionalAmount 名义本金 (USDT)
 * @returns 所需喂价员数量 + 共识门槛
 */
function calculateConsensusConfig(notionalAmount: number): {
    requiredFeeders: number;
    consensusThreshold: string;
} {
    if (notionalAmount >= 5000000) {
        // >500万U — 方案 §6.4
        return { requiredFeeders: 10, consensusThreshold: '7/10' };
    } else if (notionalAmount >= 1000000) {
        // 100万-500万U
        return { requiredFeeders: 7, consensusThreshold: '5/7' };
    } else if (notionalAmount >= 100000) {
        // 10万-100万U
        return { requiredFeeders: 5, consensusThreshold: '3/5' };
    } else {
        // <10万U
        return { requiredFeeders: 3, consensusThreshold: '2/3' };
    }
}

/**
 * 喂价类型奖励倍数 — 方案 §6.4
 * INITIAL=1x, DYNAMIC=1x, SETTLEMENT=2x, ARBITRATION=3x
 */
const FEED_TYPE_REWARD_MULTIPLIER: Record<string, number> = {
    'INITIAL': 1,
    'DYNAMIC': 1.5,    // 方案 §6.2: 动态喂价 1.5x
    'SETTLEMENT': 2,
    'FINAL': 2,        // FINAL 与 SETTLEMENT 同义
    'ARBITRATION': 3,
};

/**
 * 方案 §6.5: 动态超时配置（按订单类型）
 * grabTimeout: 抢单超时(秒), feedTimeout: 喂价超时(秒), orderTTL: 订单有效期(秒)
 */
const FEED_TYPE_TIMEOUT: Record<string, { grabTimeout: number; feedTimeout: number; orderTTL: number }> = {
    'INITIAL':     { grabTimeout: 300,  feedTimeout: 600,  orderTTL: 3600 },  // 5分/10分/1小时
    'DYNAMIC':     { grabTimeout: 120,  feedTimeout: 300,  orderTTL: 1800 },  // 2分/5分/30分钟
    'SETTLEMENT':  { grabTimeout: 180,  feedTimeout: 480,  orderTTL: 3600 },  // 3分/8分/1小时
    'FINAL':       { grabTimeout: 180,  feedTimeout: 480,  orderTTL: 3600 },  // 同 SETTLEMENT
    'ARBITRATION': { grabTimeout: 600,  feedTimeout: 1800, orderTTL: 7200 },  // 10分/30分/2小时
};

/**
 * 方案 §11.3: 喂价费用定价（按订单类型）
 */
const FEED_TYPE_FEE: Record<string, number> = {
    'INITIAL':     5,   // 基础费用
    'DYNAMIC':     5,   // 基础费用
    'SETTLEMENT':  10,  // 责任更高
    'FINAL':       10,  // 同 SETTLEMENT
    'ARBITRATION': 20,  // 最高责任
};

/**
 * 根据名义本金和喂价类型计算奖励
 * @param notionalAmount 名义本金 (USDT)
 * @param feedType 喂价类型（可选，默认 INITIAL）
 * @returns 奖励金额 (FEED)
 */
function calculateReward(notionalAmount: number, feedType?: string): number {
    const baseReward = 10; // 10 FEED
    const bonusRate = 0.0001; // 名义本金的 0.01%
    const multiplier = FEED_TYPE_REWARD_MULTIPLIER[feedType || 'INITIAL'] || 1;
    return (baseReward + notionalAmount * bonusRate) * multiplier;
}

// ============ API 端点 ============

/**
 * POST /api/nst/request-feed
 * 创建喂价请求（NST/外部协议调用）
 * 
 * @body symbol - 标的代码（必填）
 * @body market - 市场代码（必填）
 * @body country - 国家代码（必填）
 * @body exchange - 交易所代码（必填）
 * @body feedType - 喂价类型（必填）: SETTLEMENT|EXERCISE|MARGIN_CALL|DYNAMIC
 * @body notionalAmount - 名义本金（必填）
 * @body specialConditions - 附加条件（可选）
 * @body callbackUrl - 共识完成回调地址（可选）
 * @body externalOrderId - 外部协议订单 ID（可选，用于关联）
 * @body rewardAmount - 自定义奖励金额（可选）
 * @body grabTimeout - 抢单超时秒数（可选，默认 300）
 * @body feedTimeout - 喂价超时秒数（可选，默认 600）
 */
router.post('/request-feed', requireApiKey, async (req: Request, res: Response) => {
    try {
        const {
            symbol,
            market,
            country,
            exchange,
            feedType,
            notionalAmount,
            specialConditions,
            callbackUrl,
            externalOrderId,
            rewardAmount,
            grabTimeout,
            feedTimeout
        } = req.body;

        // 验证必填字段
        if (!symbol || !market || !country || !exchange || !feedType || !notionalAmount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['symbol', 'market', 'country', 'exchange', 'feedType', 'notionalAmount']
            });
        }

        // 验证 feedType（与 NST 合约 FeedType enum 保持一致）
        const validFeedTypes = ['INITIAL', 'DYNAMIC', 'SETTLEMENT', 'FINAL', 'ARBITRATION'];
        if (!validFeedTypes.includes(feedType)) {
            return res.status(400).json({
                success: false,
                error: `Invalid feedType. Must be one of: ${validFeedTypes.join(', ')}`
            });
        }

        // 验证 notionalAmount
        const amount = parseFloat(notionalAmount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'notionalAmount must be a positive number'
            });
        }

        // 验证 callbackUrl 格式
        if (callbackUrl) {
            try {
                new URL(callbackUrl);
            } catch {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid callbackUrl format'
                });
            }
        }

        // 计算共识配置
        const { requiredFeeders, consensusThreshold } = calculateConsensusConfig(amount);

        // 计算动态超时（方案 §6.5: 按订单类型区分）
        const typeKey = feedType || 'SETTLEMENT';
        const defaultTimeout = FEED_TYPE_TIMEOUT[typeKey] || FEED_TYPE_TIMEOUT['INITIAL'];
        const finalGrabTimeout = grabTimeout || defaultTimeout.grabTimeout;
        const finalFeedTimeout = feedTimeout || defaultTimeout.feedTimeout;
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + defaultTimeout.orderTTL);

        // 创建订单
        const order = await prisma.order.create({
            data: {
                symbol,
                market,
                country,
                exchange,
                feedType: feedType || 'SETTLEMENT',
                notionalAmount: amount,
                requiredFeeders,
                consensusThreshold,
                specialConditions: specialConditions || [],
                rewardAmount: rewardAmount || calculateReward(amount, feedType),
                feeAmount: FEED_TYPE_FEE[feedType || 'SETTLEMENT'] || 5,
                grabTimeout: finalGrabTimeout,
                feedTimeout: finalFeedTimeout,
                expiresAt,
                sourceProtocol: req.protocolName || 'NST',
                callbackUrl: callbackUrl || null,
                status: 'OPEN'
            }
        });

        // 异步：IPFS 上传
        uploadOrderToIPFS({
            id: order.id,
            symbol: order.symbol,
            market: order.market,
            feedType: order.feedType,
            notionalAmount: order.notionalAmount,
            specialConditions: specialConditions || [],
            createdAt: order.createdAt
        }).then(async (ipfsHash) => {
            await prisma.order.update({
                where: { id: order.id },
                data: { ipfsHash }
            });
        }).catch(err => {
            console.warn(`⚠️ IPFS upload failed for NST order ${order.id}:`, err);
        });

        // WebSocket 广播（如果 io 可用）
        try {
            const { getIO } = require('../websocket');
            const io = getIO();
            if (io) {
                io.emit('order:new', order);
                io.to(`market:${market}`).emit('order:new', order);
            }
        } catch {
            // WebSocket 不可用时静默降级
        }

        console.log(`📥 NST feed request: ${symbol}@${market} (${req.protocolName}, $${amount})`);

        res.status(201).json({
            success: true,
            order: {
                id: order.id,
                symbol: order.symbol,
                market: order.market,
                feedType: order.feedType,
                notionalAmount: order.notionalAmount,
                requiredFeeders,
                consensusThreshold,
                status: order.status,
                expiresAt: order.expiresAt,
                createdAt: order.createdAt
            }
        });
    } catch (error) {
        console.error('NST request-feed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create feed request'
        });
    }
});

/**
 * GET /api/nst/order/:orderId/status
 * 查询订单状态
 */
router.get('/order/:orderId/status', requireApiKey, async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                symbol: true,
                market: true,
                feedType: true,
                status: true,
                sourceProtocol: true,
                requiredFeeders: true,
                finalPrice: true,
                settledAt: true,
                expiresAt: true,
                createdAt: true,
                ipfsHash: true
            }
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // 确保只能查询自己协议的订单
        if (order.sourceProtocol && order.sourceProtocol !== req.protocolName) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: order belongs to a different protocol'
            });
        }

        // 统计已提交喂价数
        const submissionCount = await prisma.priceSubmission.count({
            where: { orderId }
        });

        res.json({
            success: true,
            order: {
                ...order,
                submissionCount,
                isExpired: order.expiresAt ? new Date() > order.expiresAt : false
            }
        });
    } catch (error) {
        console.error('NST order status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get order status'
        });
    }
});

/**
 * GET /api/nst/order/:orderId/result
 * 获取共识结果（含喂价详情）
 */
router.get('/order/:orderId/result', requireApiKey, async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                symbol: true,
                market: true,
                feedType: true,
                status: true,
                sourceProtocol: true,
                finalPrice: true,
                settledAt: true,
                ipfsHash: true
            }
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // 确保只能查询自己协议的订单
        if (order.sourceProtocol && order.sourceProtocol !== req.protocolName) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: order belongs to a different protocol'
            });
        }

        // 如果还没结算
        if (order.status !== 'SETTLED') {
            return res.json({
                success: true,
                settled: false,
                order: {
                    id: order.id,
                    status: order.status,
                    message: 'Order has not been settled yet'
                }
            });
        }

        // 获取喂价提交数据
        const submissions = await prisma.priceSubmission.findMany({
            where: { orderId },
            select: {
                feederId: true,
                revealedPrice: true,
                deviation: true,
                createdAt: true,
                isValid: true
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json({
            success: true,
            settled: true,
            result: {
                orderId: order.id,
                consensusPrice: order.finalPrice,
                settledAt: order.settledAt,
                feederCount: submissions.length,
                submissions: submissions.map(s => ({
                    feederId: s.feederId,
                    price: s.revealedPrice,
                    deviation: s.deviation,
                    submittedAt: s.createdAt,
                    isValid: s.isValid
                })),
                ipfsHash: order.ipfsHash
            }
        });
    } catch (error) {
        console.error('NST order result error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get order result'
        });
    }
});

/**
 * GET /api/nst/orders
 * 批量查询协议订单
 * 
 * @query status - 按状态过滤（可选）: OPEN|GRABBED|IN_PROGRESS|SETTLED|EXPIRED
 * @query limit - 返回数量（默认 50，最大 200）
 * @query offset - 偏移量（默认 0）
 * @query since - 起始时间 ISO 字符串（可选）
 */
router.get('/orders', requireApiKey, async (req: Request, res: Response) => {
    try {
        const { status, limit = '50', offset = '0', since } = req.query;

        const take = Math.min(parseInt(limit as string) || 50, 200);
        const skip = parseInt(offset as string) || 0;

        // 构建查询条件
        const where: any = {
            sourceProtocol: req.protocolName
        };

        if (status) {
            where.status = status as string;
        }

        if (since) {
            where.createdAt = {
                gte: new Date(since as string)
            };
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                select: {
                    id: true,
                    symbol: true,
                    market: true,
                    feedType: true,
                    notionalAmount: true,
                    status: true,
                    finalPrice: true,
                    settledAt: true,
                    expiresAt: true,
                    createdAt: true,
                    ipfsHash: true
                },
                orderBy: { createdAt: 'desc' },
                take,
                skip
            }),
            prisma.order.count({ where })
        ]);

        res.json({
            success: true,
            orders,
            pagination: {
                total,
                limit: take,
                offset: skip,
                hasMore: skip + take < total
            }
        });
    } catch (error) {
        console.error('NST orders list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list orders'
        });
    }
});

export default router;
