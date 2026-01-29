import { Server as SocketIOServer, Socket } from 'socket.io';
import prisma from '../config/database';

/**
 * WebSocket 服务设置
 */
export function setupWebSocket(io: SocketIOServer): void {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // 加入房间（按市场类型）
        socket.on('join:market', (market: string) => {
            socket.join(`market:${market}`);
            console.log(`Client ${socket.id} joined market:${market}`);
        });

        // 离开房间
        socket.on('leave:market', (market: string) => {
            socket.leave(`market:${market}`);
        });

        // 订阅特定订单
        socket.on('subscribe:order', (orderId: string) => {
            socket.join(`order:${orderId}`);
        });

        // 取消订阅订单
        socket.on('unsubscribe:order', (orderId: string) => {
            socket.leave(`order:${orderId}`);
        });

        // 喂价员上线
        socket.on('feeder:online', async (address: string) => {
            socket.data.address = address;
            socket.join(`feeder:${address}`);

            // 通知其他用户
            io.emit('feeder:status', { address, status: 'online' });
        });

        // 断开连接
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);

            if (socket.data.address) {
                io.emit('feeder:status', {
                    address: socket.data.address,
                    status: 'offline'
                });
            }
        });
    });

    // 定时广播订单更新
    setInterval(async () => {
        try {
            const orders = await prisma.order.findMany({
                where: {
                    status: { in: ['OPEN', 'GRABBED', 'FEEDING'] },
                    expiresAt: { gt: new Date() }
                },
                select: {
                    id: true,
                    expiresAt: true,
                    status: true
                }
            });

            const now = Date.now();
            orders.forEach(order => {
                const timeRemaining = Math.max(0, Math.floor((order.expiresAt.getTime() - now) / 1000));
                io.to(`order:${order.id}`).emit('order:countdown', {
                    orderId: order.id,
                    timeRemaining,
                    status: order.status
                });
            });
        } catch (error) {
            console.error('Countdown broadcast error:', error);
        }
    }, 1000); // 每秒更新

    console.log('📡 WebSocket server initialized');
}

/**
 * 广播新订单
 */
export function broadcastNewOrder(io: SocketIOServer, order: any): void {
    io.emit('order:new', order);
    io.to(`market:${order.market}`).emit('order:new', order);
}

/**
 * 广播订单状态更新
 */
export function broadcastOrderUpdate(io: SocketIOServer, orderId: string, update: any): void {
    io.to(`order:${orderId}`).emit('order:update', { orderId, ...update });
}

/**
 * 广播共识达成
 */
export function broadcastConsensus(io: SocketIOServer, orderId: string, consensusPrice: number): void {
    io.emit('order:consensus', { orderId, consensusPrice });
    io.to(`order:${orderId}`).emit('order:consensus', { orderId, consensusPrice });
}
