/**
 * 自定义 React Hooks - 数据获取和状态管理
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import { transformOrder, transformFeeder, transformHistoryItem, transformLeaderboardItem } from '../services/transform';
import { FeedOrder, FeederProfile, FeedHistoryItem } from '../types';
import { useRealtimeOrders } from '../services/websocket';

/**
 * 获取订单列表 Hook
 */
export function useOrders(params?: { status?: string; market?: string }) {
    const [orders, setOrders] = useState<FeedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getOrders(params);
            if (res.success) {
                setOrders(res.orders.map(transformOrder));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [params?.status, params?.market]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // 使用实时更新
    const realtimeOrders = useRealtimeOrders(orders);

    return { orders: realtimeOrders, loading, error, refetch: fetchOrders };
}

/**
 * 获取当前喂价员资料 Hook
 */
export function useFeederProfile() {
    const [feeder, setFeeder] = useState<FeederProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getFeederProfile();
            if (res.success && res.feeder) {
                setFeeder(transformFeeder(res.feeder, res.history || []));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    return { feeder, loading, error, refetch: fetchProfile };
}

/**
 * 获取喂价历史 Hook
 */
export function useHistory() {
    const [history, setHistory] = useState<FeedHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getHistory();
            if (res.success && res.history) {
                setHistory(res.history.map(transformHistoryItem));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return { history, loading, error, refetch: fetchHistory };
}

/**
 * 获取排行榜 Hook
 */
export function useLeaderboard(limit = 50) {
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getLeaderboard(limit);
            if (res.success && res.leaderboard) {
                setLeaderboard(res.leaderboard.map(transformLeaderboardItem));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    return { leaderboard, loading, error, refetch: fetchLeaderboard };
}

/**
 * 质押信息 Hook
 */
export function useStaking() {
    const [staking, setStaking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStaking = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getStakingInfo();
            if (res.success) {
                setStaking(res.staking);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStaking();
    }, [fetchStaking]);

    return { staking, loading, error, refetch: fetchStaking };
}

/**
 * 仲裁案件 Hook
 */
export function useArbitrationCases(status?: string) {
    const [cases, setCases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCases = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getArbitrationCases(status);
            if (res.success && res.cases) {
                setCases(res.cases);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchCases();
    }, [fetchCases]);

    return { cases, loading, error, refetch: fetchCases };
}

/**
 * 抢单操作 Hook
 */
export function useGrabOrder() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const grab = useCallback(async (orderId: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.grabOrder(orderId);
            return res.success;
        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    return { grab, loading, error };
}

/**
 * 提交价格 Hook
 */
export function useSubmitPrice() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = useCallback(async (orderId: string, price: number, evidenceUrl?: string) => {
        setLoading(true);
        setError(null);
        try {
            const salt = api.generateSalt();
            const priceHash = api.generatePriceHash(price, salt);

            // 1. 提交哈希
            await api.submitPriceHash(orderId, priceHash);

            // 2. 揭示价格（可以在后续步骤中进行）
            await api.revealPrice(orderId, price, salt, evidenceUrl);

            return true;
        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    return { submit, loading, error };
}
