import { io, Socket } from 'socket.io-client';
import { FeedOrder } from '../types';

/**
 * WebSocket 服务 - 实时推送
 */

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;
let listeners: Map<string, Set<Function>> = new Map();

/**
 * 初始化 WebSocket 连接
 */
export function initWebSocket(): void {
    if (socket?.connected) return;

    socket = io(WS_URL, {
        transports: ['websocket'],
        autoConnect: true,
    });

    socket.on('connect', () => {
        console.log('🔌 WebSocket connected');
        // 重连后触发数据刷新
        emit('ws:reconnected', {});
    });

    socket.on('disconnect', () => {
        console.log('🔌 WebSocket disconnected');
    });

    socket.on('reconnect', () => {
        console.log('🔌 WebSocket reconnected — 触发数据刷新');
        emit('ws:reconnected', {});
    });

    // 设置事件转发
    setupEventForwarding();
}

/**
 * 关闭 WebSocket 连接
 */
export function closeWebSocket(): void {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    listeners.clear();
}

/**
 * 订阅市场频道
 */
export function subscribeMarket(market: string): void {
    socket?.emit('subscribe:market', { market });
}

/**
 * 取消订阅市场频道
 */
export function unsubscribeMarket(market: string): void {
    socket?.emit('unsubscribe:market', { market });
}

/**
 * 订阅订单频道
 */
export function subscribeOrder(orderId: string): void {
    socket?.emit('subscribe:order', { orderId });
}

/**
 * 设置事件转发
 */
function setupEventForwarding(): void {
    if (!socket) return;

    // 订单相关事件
    socket.on('order:new', (data) => emit('order:new', data));
    socket.on('order:grabbed', (data) => emit('order:grabbed', data));
    socket.on('order:committed', (data) => emit('order:committed', data));
    socket.on('order:revealed', (data) => emit('order:revealed', data));
    socket.on('order:consensus', (data) => emit('order:consensus', data));
    socket.on('order:settled', (data) => emit('order:settled', data));
    socket.on('order:countdown', (data) => emit('order:countdown', data));
    socket.on('order:cancelled', (data) => emit('order:cancelled', data));

    // 仲裁相关事件
    socket.on('arbitration:new', (data) => emit('arbitration:new', data));
    socket.on('arbitration:vote', (data) => emit('arbitration:vote', data));
    socket.on('arbitration:resolved', (data) => emit('arbitration:resolved', data));
    socket.on('arbitration:appeal', (data) => emit('arbitration:appeal', data));

    // 链上事件
    socket.on('chain:priceSubmitted', (data) => emit('chain:priceSubmitted', data));
    socket.on('chain:priceRevealed', (data) => emit('chain:priceRevealed', data));
    socket.on('chain:consensusReached', (data) => emit('chain:consensusReached', data));
    socket.on('chain:staked', (data) => emit('chain:staked', data));
    socket.on('chain:slashed', (data) => emit('chain:slashed', data));

    // NST 外部协议事件
    socket.on('nst:feedRequest', (data) => {
        // 将 NST 订单事件转换为标准 order:new 事件格式
        const order: Partial<FeedOrder> = {
            orderId: data.feedEngineOrderId,
            symbol: data.symbol,
            market: data.market,
            country: data.country,
            feedType: data.feedType,
            notionalAmount: data.notionalAmount,
            status: 'OPEN' as any,
            sourceProtocol: 'NST',
        };
        emit('order:new', order);
    });
}

/**
 * 添加事件监听器
 */
export function on(event: string, callback: Function): void {
    if (!listeners.has(event)) {
        listeners.set(event, new Set());
    }
    listeners.get(event)!.add(callback);
}

/**
 * 移除事件监听器
 */
export function off(event: string, callback: Function): void {
    listeners.get(event)?.delete(callback);
}

/**
 * 触发事件
 */
function emit(event: string, data: any): void {
    listeners.get(event)?.forEach(callback => {
        try {
            callback(data);
        } catch (error) {
            console.error(`Error in ${event} listener:`, error);
        }
    });
}

// ============ React Hooks ============

import { useEffect, useState, useCallback } from 'react';

/**
 * 订单实时更新 Hook
 */
export function useRealtimeOrders(initialOrders: FeedOrder[] = []) {
    const [orders, setOrders] = useState<FeedOrder[]>(initialOrders);

    useEffect(() => {
        initWebSocket();

        const handleNewOrder = (order: FeedOrder) => {
            setOrders(prev => [order, ...prev]);
        };

        const handleOrderUpdate = (data: { orderId: string;[key: string]: any }) => {
            setOrders(prev => prev.map(order =>
                order.orderId === data.orderId ? { ...order, ...data } : order
            ));
        };

        const handleOrderRemove = (data: { orderId: string }) => {
            setOrders(prev => prev.filter(order => order.orderId !== data.orderId));
        };

        on('order:new', handleNewOrder);
        on('order:grabbed', handleOrderUpdate);
        on('order:settled', handleOrderUpdate);
        on('order:cancelled', handleOrderRemove);

        return () => {
            off('order:new', handleNewOrder);
            off('order:grabbed', handleOrderUpdate);
            off('order:settled', handleOrderUpdate);
            off('order:cancelled', handleOrderRemove);
        };
    }, []);

    return orders;
}

/**
 * 订单倒计时 Hook
 */
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
        };
    }, [orderId]);

    return timeRemaining;
}

/**
 * 仲裁实时更新 Hook
 */
export function useRealtimeArbitration() {
    const [newCases, setNewCases] = useState<any[]>([]);
    const [resolvedCases, setResolvedCases] = useState<any[]>([]);

    useEffect(() => {
        initWebSocket();

        const handleNew = (data: any) => {
            setNewCases(prev => [data, ...prev]);
        };

        const handleResolved = (data: any) => {
            setResolvedCases(prev => [data, ...prev]);
        };

        on('arbitration:new', handleNew);
        on('arbitration:resolved', handleResolved);

        return () => {
            off('arbitration:new', handleNew);
            off('arbitration:resolved', handleResolved);
        };
    }, []);

    return { newCases, resolvedCases };
}
