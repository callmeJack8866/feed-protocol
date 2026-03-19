import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { FeedOrder } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;
const listeners = new Map<string, Set<(data: any) => void>>();

function emitLocal(event: string, data: any): void {
  listeners.get(event)?.forEach((callback) => {
    try {
      callback(data);
    } catch (error) {
      console.error(`WebSocket listener error for ${event}:`, error);
    }
  });
}

function forward(event: string): void {
  socket?.on(event, (data) => emitLocal(event, data));
}

export function initWebSocket(): void {
  if (socket) {
    if (!socket.connected) {
      socket.connect();
    }
    return;
  }

  socket = io(WS_URL, {
    transports: ['websocket'],
    autoConnect: true,
  });

  socket.on('connect', () => emitLocal('ws:connected', {}));
  socket.on('disconnect', () => emitLocal('ws:disconnected', {}));
  socket.io.on('reconnect', () => emitLocal('ws:reconnected', {}));

  [
    'order:new',
    'order:update',
    'order:grabbed',
    'order:committed',
    'order:revealed',
    'order:consensus',
    'order:settled',
    'order:countdown',
    'order:cancelled',
    'arbitration:new',
    'arbitration:vote',
    'arbitration:resolved',
    'arbitration:appeal',
    'appeal:resolved',
    'chain:priceCommitted',
    'chain:priceRevealed',
    'chain:consensusSubmitted',
    'chain:staked',
    'chain:penaltyApplied',
    'nst:feedRequest',
  ].forEach(forward);
}

export function closeWebSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  listeners.clear();
}

export function subscribeMarket(market: string): void {
  socket?.emit('subscribe:market', { market });
  socket?.emit('join:market', market);
}

export function unsubscribeMarket(market: string): void {
  socket?.emit('unsubscribe:market', { market });
  socket?.emit('leave:market', market);
}

export function subscribeOrder(orderId: string): void {
  socket?.emit('subscribe:order', { orderId });
}

export function unsubscribeOrder(orderId: string): void {
  socket?.emit('unsubscribe:order', { orderId });
}

export function on(event: string, callback: (data: any) => void): void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(callback);
}

export function off(event: string, callback: (data: any) => void): void {
  listeners.get(event)?.delete(callback);
}

export function useRealtimeOrders(initialOrders: FeedOrder[] = []) {
  const [orders, setOrders] = useState<FeedOrder[]>(initialOrders);

  useEffect(() => {
    initWebSocket();

    const handleNewOrder = (order: FeedOrder) => {
      setOrders((prev) => [order, ...prev.filter((item) => item.orderId !== order.orderId)]);
    };

    const handleOrderUpdate = (data: { orderId: string; [key: string]: any }) => {
      setOrders((prev) => prev.map((order) => (order.orderId === data.orderId ? { ...order, ...data } : order)));
    };

    const handleOrderRemove = (data: { orderId: string }) => {
      setOrders((prev) => prev.filter((order) => order.orderId !== data.orderId));
    };

    on('order:new', handleNewOrder);
    on('order:update', handleOrderUpdate);
    on('order:grabbed', handleOrderUpdate);
    on('order:committed', handleOrderUpdate);
    on('order:revealed', handleOrderUpdate);
    on('order:consensus', handleOrderUpdate);
    on('order:settled', handleOrderUpdate);
    on('order:cancelled', handleOrderRemove);

    return () => {
      off('order:new', handleNewOrder);
      off('order:update', handleOrderUpdate);
      off('order:grabbed', handleOrderUpdate);
      off('order:committed', handleOrderUpdate);
      off('order:revealed', handleOrderUpdate);
      off('order:consensus', handleOrderUpdate);
      off('order:settled', handleOrderUpdate);
      off('order:cancelled', handleOrderRemove);
    };
  }, []);

  return orders;
}

export function useOrderCountdown(orderId: string) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    initWebSocket();
    subscribeOrder(orderId);

    const handleCountdown = (data: { orderId: string; timeRemaining: number }) => {
      if (data.orderId === orderId) {
        setTimeRemaining(data.timeRemaining);
      }
    };

    on('order:countdown', handleCountdown);

    return () => {
      off('order:countdown', handleCountdown);
      unsubscribeOrder(orderId);
    };
  }, [orderId]);

  return timeRemaining;
}

export function useRealtimeArbitration() {
  const [newCases, setNewCases] = useState<any[]>([]);
  const [resolvedCases, setResolvedCases] = useState<any[]>([]);

  useEffect(() => {
    initWebSocket();

    const handleNew = (data: any) => setNewCases((prev) => [data, ...prev]);
    const handleResolved = (data: any) => setResolvedCases((prev) => [data, ...prev]);

    on('arbitration:new', handleNew);
    on('arbitration:resolved', handleResolved);

    return () => {
      off('arbitration:new', handleNew);
      off('arbitration:resolved', handleResolved);
    };
  }, []);

  return { newCases, resolvedCases };
}

export function useWebSocketRefresh(handler: () => void) {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    initWebSocket();
    on('ws:reconnected', stableHandler);

    return () => {
      off('ws:reconnected', stableHandler);
    };
  }, [stableHandler]);
}
