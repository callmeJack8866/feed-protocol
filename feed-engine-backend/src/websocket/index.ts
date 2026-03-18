import { Server as SocketIOServer, Socket } from 'socket.io';
import prisma from '../config/database';

function parseChannelPayload(payload: unknown, key: 'market' | 'orderId'): string | null {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object' && key in (payload as Record<string, unknown>)) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function setupWebSocket(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    console.log(`WebSocket client connected: ${socket.id}`);

    const joinMarket = (payload: unknown) => {
      const market = parseChannelPayload(payload, 'market');
      if (!market) return;
      socket.join(`market:${market}`);
    };

    const leaveMarket = (payload: unknown) => {
      const market = parseChannelPayload(payload, 'market');
      if (!market) return;
      socket.leave(`market:${market}`);
    };

    const subscribeOrder = (payload: unknown) => {
      const orderId = parseChannelPayload(payload, 'orderId');
      if (!orderId) return;
      socket.join(`order:${orderId}`);
    };

    const unsubscribeOrder = (payload: unknown) => {
      const orderId = parseChannelPayload(payload, 'orderId');
      if (!orderId) return;
      socket.leave(`order:${orderId}`);
    };

    socket.on('join:market', joinMarket);
    socket.on('subscribe:market', joinMarket);
    socket.on('leave:market', leaveMarket);
    socket.on('unsubscribe:market', leaveMarket);
    socket.on('subscribe:order', subscribeOrder);
    socket.on('unsubscribe:order', unsubscribeOrder);

    socket.on('feeder:online', async (address: string) => {
      socket.data.address = address;
      socket.join(`feeder:${address}`);
      io.emit('feeder:status', { address, status: 'online' });
    });

    socket.on('disconnect', () => {
      console.log(`WebSocket client disconnected: ${socket.id}`);

      if (socket.data.address) {
        io.emit('feeder:status', {
          address: socket.data.address,
          status: 'offline',
        });
      }
    });
  });

  setInterval(async () => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          status: { in: ['OPEN', 'GRABBED', 'FEEDING'] },
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          expiresAt: true,
          status: true,
        },
      });

      const now = Date.now();
      orders.forEach((order) => {
        const timeRemaining = Math.max(0, Math.floor((order.expiresAt.getTime() - now) / 1000));
        io.to(`order:${order.id}`).emit('order:countdown', {
          orderId: order.id,
          timeRemaining,
          status: order.status,
        });
      });
    } catch (error) {
      console.error('Countdown broadcast error:', error);
    }
  }, 1000);

  console.log('WebSocket server initialized');
}

export function broadcastNewOrder(io: SocketIOServer, order: any): void {
  io.emit('order:new', order);
  io.to(`market:${order.market}`).emit('order:new', order);
}

export function broadcastOrderUpdate(io: SocketIOServer, orderId: string, update: any): void {
  const payload = { orderId, ...update };
  io.emit('order:update', payload);
  io.to(`order:${orderId}`).emit('order:update', payload);
}

export function broadcastConsensus(io: SocketIOServer, orderId: string, consensusPrice: number): void {
  const payload = { orderId, consensusPrice, status: 'CONSENSUS' };
  io.emit('order:consensus', payload);
  io.to(`order:${orderId}`).emit('order:consensus', payload);
}
