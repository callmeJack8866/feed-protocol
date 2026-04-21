/**
 * Zustand 全局状态管理
 * 
 * 三个 Store:
 * - useAuthStore  — JWT / 钱包 / SIWE 认证
 * - useFeederStore — 喂价员资料 / 订单 / 历史
 * - useUIStore    — 视图切换 / 弹窗状态
 * 
 * @module store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FeedOrder, FeederProfile, FeedHistoryItem, ViewType, FeederRank } from './types';
import { RewardType } from './components/feedback/RewardModal';

export interface PendingReward {
  id: string;
  type: RewardType;
  title: string;
  subtitle?: string;
  value?: string;
}

// ========================================================================
// 1. Auth Store — JWT / 钱包 / SIWE 认证
// ========================================================================

interface AuthState {
    /** JWT access token */
    token: string | null;
    /** 钱包地址 */
    address: string | null;
    /** 是否已连接 */
    isConnected: boolean;
    /** 是否正在连接 */
    isConnecting: boolean;
    /** 链 ID */
    chainId: number | null;
    /** 错误消息 */
    error: string | null;

    // Actions
    /** 设置 JWT token */
    setToken: (token: string | null) => void;
    /** 设置钱包连接信息 */
    setWallet: (address: string, chainId: number) => void;
    /** 设置连接中状态 */
    setConnecting: (v: boolean) => void;
    /** 设置错误 */
    setError: (error: string | null) => void;
    /** 断开连接 */
    disconnect: () => void;
    /** 更新链 ID */
    setChainId: (chainId: number) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            address: null,
            isConnected: false,
            isConnecting: false,
            chainId: null,
            error: null,

            setToken: (token) => set({ token }),

            setWallet: (address, chainId) =>
                set({ address, chainId, isConnected: true, isConnecting: false, error: null }),

            setConnecting: (isConnecting) => set({ isConnecting }),

            setError: (error) => set({ error, isConnecting: false }),

            disconnect: () =>
                set({ token: null, address: null, isConnected: false, chainId: null, error: null }),

            setChainId: (chainId) => set({ chainId }),
        }),
        {
            name: 'feed-engine-auth',
            partialize: (state) => ({ token: state.token, address: state.address }),
        }
    )
);

// ========================================================================
// 2. Feeder Store — 喂价员资料 / 订单 / 偏好
// ========================================================================

interface Preferences {
    countries: string[];
    exchanges: string[];
    assets: string[];
}

interface FeederState {
    /** 喂价员资料 */
    profile: FeederProfile | null;
    /** 订单列表 */
    orders: FeedOrder[];
    /** 喂价历史 */
    history: FeedHistoryItem[];
    /** 偏好设置 */
    preferences: Preferences;
    /** 数据加载中 */
    loading: boolean;

    // Actions
    setProfile: (profile: FeederProfile | null) => void;
    setOrders: (orders: FeedOrder[]) => void;
    updateOrder: (orderId: string, updates: Partial<FeedOrder>) => void;
    removeOrder: (orderId: string) => void;
    setHistory: (history: FeedHistoryItem[]) => void;
    setPreferences: (prefs: Preferences) => void;
    setLoading: (loading: boolean) => void;
    /** 完成喂价后更新 profile 统计 */
    onFeedComplete: (xpEarned: number, feedEarned: number) => void;
}

export const useFeederStore = create<FeederState>()((set) => ({
    profile: null,
    orders: [],
    history: [],
    preferences: {
        countries: ['CN', 'US', 'GLOBAL'],
        exchanges: ['SSE', 'NASDAQ', 'BINANCE'],
        assets: ['CRYPTO', 'US_STOCK', 'CN_STOCK'],
    },
    loading: false,

    setProfile: (profile) => set({ profile }),

    setOrders: (orders) => set({ orders }),

    updateOrder: (orderId, updates) =>
        set((state) => ({
            orders: state.orders.map((o) =>
                o.orderId === orderId ? { ...o, ...updates } : o
            ),
        })),

    removeOrder: (orderId) =>
        set((state) => ({
            orders: state.orders.filter((o) => o.orderId !== orderId),
        })),

    setHistory: (history) => set({ history }),

    setPreferences: (prefs) => set({ preferences: prefs }),

    setLoading: (loading) => set({ loading }),

    onFeedComplete: (xpEarned, feedEarned) =>
        set((state) => {
            if (!state.profile) return {};
            const oldXp = state.profile.xp;
            const newXp = oldXp + xpEarned;
            
            const oldLevel = Math.max(1, Math.floor(oldXp / 1000) + 1);
            const newLevel = Math.max(1, Math.floor(newXp / 1000) + 1);

            // Trigger global sequence
            const uiQueue = useUIStore.getState();
            uiQueue.enqueueReward({
                id: `feed_${Date.now()}`,
                type: 'MISSION_SUCCESS',
                title: 'FEED VERIFIED',
                subtitle: 'BLOCKCHAIN CONSENSUS REACHED',
                value: `+${xpEarned} XP / +${feedEarned} FEED`
            });

            if (newLevel > oldLevel) {
                uiQueue.enqueueReward({
                    id: `level_${Date.now()}`,
                    type: 'RANK_UP',
                    title: 'CLEARANCE ELEVATED',
                    subtitle: 'YOU HAVE ADVANCED A STRUCTURAL TIER',
                    value: `LEVEL ${newLevel}`
                });
            }

            if (state.profile.totalFeeds === 0) {
                uiQueue.enqueueReward({
                    id: `ach_${Date.now()}`,
                    type: 'ACHIEVEMENT_UNLOCK',
                    title: 'FIRST BLOOD',
                    subtitle: 'YOU COMMITTED YOUR FIRST DATAPOINT TO THE MATRIX',
                    value: 'BADGE UNLOCKED'
                });
            }

            return {
                profile: {
                    ...state.profile,
                    xp: newXp,
                    balanceFEED: state.profile.balanceFEED + feedEarned,
                    totalFeeds: state.profile.totalFeeds + 1,
                },
            };
        }),
}));

// ========================================================================
// 3. UI Store — 视图 / 弹窗 / 分区Tab
// ========================================================================

interface UIState {
    /** 当前视图 */
    activeView: ViewType;
    /** 正在查看的订单详情 */
    viewingOrder: FeedOrder | null;
    /** 正在进行喂价的订单 */
    activeOrder: FeedOrder | null;
    /** 是否显示偏好弹窗 */
    showPreferences: boolean;
    /** 当前分区 Tab */
    activeTab: 'beginner' | 'competitive' | 'master';
    /** 全局奖励反馈队列 */
    rewardQueue: PendingReward[];

    // Actions
    setActiveView: (view: ViewType) => void;
    setViewingOrder: (order: FeedOrder | null) => void;
    setActiveOrder: (order: FeedOrder | null) => void;
    setShowPreferences: (show: boolean) => void;
    setActiveTab: (tab: 'beginner' | 'competitive' | 'master') => void;
    /** 抢单后进入喂价 */
    grabAndFeed: (order: FeedOrder) => void;
    /** 加入提示队列 */
    enqueueReward: (reward: PendingReward) => void;
    /** 移除当前提示 */
    dequeueReward: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
    activeView: 'Quest Hall',
    viewingOrder: null,
    activeOrder: null,
    showPreferences: false,
    activeTab: 'beginner',
    rewardQueue: [],

    setActiveView: (activeView) => set({ activeView }),

    setViewingOrder: (viewingOrder) => set({ viewingOrder }),

    setActiveOrder: (activeOrder) => set({ activeOrder }),

    setShowPreferences: (showPreferences) => set({ showPreferences }),

    setActiveTab: (activeTab) => set({ activeTab }),

    grabAndFeed: (order) => set({ viewingOrder: null, activeOrder: order }),

    enqueueReward: (reward) => set((state) => ({ rewardQueue: [...state.rewardQueue, reward] })),

    dequeueReward: () => set((state) => ({ rewardQueue: state.rewardQueue.slice(1) })),
}));
