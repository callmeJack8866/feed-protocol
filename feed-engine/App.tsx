
import React, { useState, useEffect, useMemo } from 'react';
import Layout from './components/Layout';
import OrderCard from './components/OrderCard';
import FeedModal from './components/FeedModal';
import OrderDetailModal from './components/OrderDetailModal';
import DashboardView from './components/DashboardView';
import LeaderboardView from './components/LeaderboardView';
import InventoryView from './components/InventoryView';
import AchievementsView from './components/AchievementsView';
import TrainingView from './components/TrainingView';
import StakingView from './components/StakingView';
import ArbitrationView from './components/ArbitrationView';
import PreferencesModal from './components/PreferencesModal';
import { FeederRank, FeedOrder, OrderStatus } from './types';
import * as api from './services/api';
import { transformFeeder, transformOrder } from './services/transform';
import { closeWebSocket, initWebSocket, off, on } from './services/websocket';
import { motion, AnimatePresence, useTransform, useMotionValue, useSpring, MotionValue } from 'framer-motion';
import { useTranslation } from './i18n';
import { useAuthStore, useFeederStore, useUIStore } from './store';

// Separate component for Orbital Rings to fix Hook violations
const OrbitalRing: React.FC<{
  index: number;
  springX: MotionValue<number>;
  springY: MotionValue<number>
}> = ({ index, springX, springY }) => {
  const x = useTransform(springX, [-500, 500], [index * -15, index * 15]);
  const y = useTransform(springY, [-500, 500], [index * -15, index * 15]);
  const rotate = index % 2 === 0 ? 360 : -360;

  return (
    <motion.div
      animate={{ rotate }}
      transition={{ duration: 40 + index * 15, repeat: Infinity, ease: "linear" }}
      className="absolute rounded-full border border-dashed border-cyan-500/10 shadow-[inset_0_0_50px_rgba(34,211,238,0.05)]"
      style={{
        x, y,
        width: 450 + index * 280,
        height: 450 + index * 280
      }}
    />
  );
};

const DigitCounter: React.FC<{ label: string; value: string; colorClass: string; icon?: string }> = ({ label, value, colorClass, icon }) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayValue(prev =>
        prev.split("")
          .map((char, index) => {
            if (index < iteration) return value[index];
            if (char === " ") return " ";
            return "0123456789X#$%"[Math.floor(Math.random() * 14)];
          })
          .join("")
      );
      if (iteration >= value.length) clearInterval(interval);
      iteration += 1 / 2;
    }, 40);
    return () => clearInterval(interval);
  }, [value]);

  return (
    <div className="space-y-3 group perspective-1000">
      <div className="flex items-center gap-3 px-2">
        <div className={`w-1 h-1 rounded-full ${colorClass.replace('text-', 'bg-')} animate-pulse`} />
        <p className={`text-[10px] font-black uppercase tracking-[0.8em] transition-colors duration-500 ${colorClass} opacity-50 group-hover:opacity-100`}>
          {label}
        </p>
      </div>
      <div className="flex items-center gap-6 justify-center">
        {icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-black text-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all duration-500 bg-current ${colorClass.replace('text-', 'bg-')} group-hover:scale-110`}>
            {icon}
          </div>
        )}
        <h3 className={`text-5xl md:text-6xl font-black font-orbitron italic text-white glow-text transition-all duration-500 group-hover:scale-105 tracking-tighter`}>
          {displayValue}
        </h3>
      </div>
    </div>
  );
};

const CosmicHero: React.FC<{ springX: MotionValue<number>; springY: MotionValue<number> }> = ({ springX, springY }) => {
  const craftRotateX = useTransform(springY, [-500, 500], [10, -10]);
  const craftRotateY = useTransform(springX, [-500, 500], [-10, 10]);
  const coreX = useTransform(springX, [-500, 500], [-30, 30]);
  const coreY = useTransform(springY, [-500, 500], [-30, 30]);

  return (
    <section className="relative h-[580px] flex flex-col items-center justify-center text-center overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <OrbitalRing key={i} index={i} springX={springX} springY={springY} />
        ))}

        <motion.div
          style={{ x: coreX, y: coreY, rotateX: craftRotateX, rotateY: craftRotateY }}
          className="relative w-[500px] h-[500px] flex items-center justify-center"
        >
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 5, repeat: Infinity }}
            className="absolute w-full h-full bg-cyan-500/10 blur-[150px] rounded-full"
          />
          <motion.div
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10 w-[320px] h-[320px]"
          >
            {/* Outer rotating ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-20px] rounded-full border-2 border-cyan-500/20"
              style={{ borderTopColor: 'rgba(34,211,238,0.6)', borderRightColor: 'rgba(34,211,238,0.3)' }}
            />
            {/* Middle counter-rotating ring */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[10px] rounded-full border border-cyan-400/15"
              style={{ borderBottomColor: 'rgba(6,182,212,0.5)', borderLeftColor: 'rgba(6,182,212,0.2)' }}
            />
            {/* Inner pulsing ring */}
            <motion.div
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute inset-[30px] rounded-full border border-cyan-300/30"
            />
            {/* Core glow */}
            <div className="absolute inset-[50px] rounded-full bg-gradient-to-br from-cyan-500/20 via-cyan-400/10 to-transparent blur-[30px]" />
            {/* Central energy core */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="absolute inset-[70px] rounded-full bg-gradient-to-br from-cyan-400/40 via-cyan-500/60 to-cyan-600/40 shadow-[0_0_80px_rgba(34,211,238,0.4),inset_0_0_40px_rgba(34,211,238,0.3)]"
            />
            {/* Inner bright core */}
            <motion.div
              animate={{ scale: [1.1, 0.9, 1.1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-[100px] rounded-full bg-gradient-to-br from-white/30 via-cyan-300/50 to-cyan-500/30 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
            />
            {/* Owl emblem in center */}
            <div className="absolute inset-[110px] rounded-full flex items-center justify-center">
              <span className="text-4xl select-none" role="img" aria-label="owl">OWL</span>
            </div>
            {/* Decorative dots on ring */}
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <motion.div
                key={deg}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, delay: deg / 360 }}
                className="absolute w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                style={{
                  top: `${50 - 45 * Math.cos((deg * Math.PI) / 180)}%`,
                  left: `${50 + 45 * Math.sin((deg * Math.PI) / 180)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="relative z-20 space-y-20">
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <h2 className="text-[100px] md:text-[120px] font-black font-orbitron tracking-tighter italic uppercase text-white leading-none drop-shadow-[0_30px_60px_rgba(0,0,0,1)] selection:bg-cyan-500">
              FEED<span className="text-cyan-400 glow-cyan">VERSE</span>
            </h2>
            <div className="flex items-center gap-10 w-full max-w-4xl opacity-40">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-cyan-500" />
              <p className="text-[10px] font-black tracking-[1.5em] text-cyan-400">COMMAND_CENTER_V4</p>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-cyan-500" />
            </div>
          </motion.div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-16 md:gap-32">
          <DigitCounter label="Global Hash Power" value="2122520" colorClass="text-cyan-400" />
          <DigitCounter label="Total XTTA Secured" value="2565336" colorClass="text-amber-500" icon="T" />
        </div>
      </div>
    </section>
  );
};

const QuestHallView: React.FC<{
  filteredOrders: FeedOrder[];
  activeTab: string;
  setActiveTab: (tab: any) => void;
  setShowPrefs: (val: boolean) => void;
  setViewingOrder: (order: FeedOrder) => void;
  springX: MotionValue<number>;
  springY: MotionValue<number>;
  onMouseMove: (e: React.MouseEvent) => void;
}> = ({ filteredOrders, activeTab, setActiveTab, setShowPrefs, setViewingOrder, springX, springY, onMouseMove }) => {
  const { t } = useTranslation();

  return (
    <div onMouseMove={onMouseMove} className="space-y-12 max-w-7xl mx-auto pb-40 relative">
      <CosmicHero springX={springX} springY={springY} />

      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 px-14">
        <div className="flex bg-black/80 p-3 rounded-[3.5rem] border border-white/5 backdrop-blur-3xl shadow-[0_30px_80px_rgba(0,0,0,0.8)] relative group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {[
            { id: 'beginner', label: 'Primary Sync', icon: 'B1', desc: 'For F-D rank feeders · Notional below 100K', activeColor: 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black shadow-[0_0_50px_rgba(34,211,238,0.4)]' },
            { id: 'competitive', label: 'Combat Feed', icon: 'C2', desc: 'For C-B rank feeders · Notional 100K to 1M', activeColor: 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-[0_0_50px_rgba(249,115,22,0.4)]' },
            { id: 'master', label: 'Zenith Oracle', icon: 'M3', desc: 'For A-S rank feeders · Notional above 1M', activeColor: 'bg-gradient-to-r from-amber-400 to-yellow-300 text-black shadow-[0_0_50px_rgba(251,191,36,0.4)]' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-8 py-4 rounded-[2.8rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center gap-3 group relative z-10 ${activeTab === tab.id
                ? `${tab.activeColor} scale-105`
                : 'text-slate-500 hover:text-cyan-400'
                }`}
            >
              <span className="text-lg group-hover:scale-125 transition-transform">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-8">
          <button onClick={() => setShowPrefs(true)} className="w-16 h-16 rounded-[2.5rem] bg-black/60 border border-white/10 flex items-center justify-center text-xl hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all group relative overflow-hidden">
            <span className="group-hover:rotate-180 transition-transform duration-700 relative z-10">CFG</span>
          </button>
          <button className="px-10 py-4 rounded-[2.5rem] bg-cyan-500 text-black font-black font-orbitron text-[11px] uppercase tracking-[0.3em] italic shadow-[0_30px_60px_rgba(34,211,238,0.4)] hover:bg-cyan-400 hover:scale-105 active:scale-95 transition-all relative overflow-hidden group">
            Initiate Neural Scan
          </button>
        </div>
      </section>

      {/* 分区描述横幅 */}

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-14"
      >
        <div className={`flex items-center justify-between px-10 py-5 rounded-[2rem] border backdrop-blur-sm ${activeTab === 'beginner' ? 'bg-cyan-500/5 border-cyan-500/10' :
          activeTab === 'competitive' ? 'bg-orange-500/5 border-orange-500/10' :
            'bg-amber-500/5 border-amber-500/10'
          }`}>
          <div className="flex items-center gap-6">
            <span className="text-3xl">{activeTab === 'beginner' ? 'B1' : activeTab === 'competitive' ? 'C2' : 'M3'}</span>
            <div>
              <p className={`text-sm font-black uppercase tracking-widest ${activeTab === 'beginner' ? 'text-cyan-400' : activeTab === 'competitive' ? 'text-orange-400' : 'text-amber-400'
                }`}>
                {activeTab === 'beginner' ? t.zone.beginner : activeTab === 'competitive' ? t.zone.competitive : t.zone.master}
              </p>
              <p className="text-[10px] text-slate-500 font-bold tracking-wider mt-1">
                {activeTab === 'beginner' ? t.zone.beginnerDesc :
                  activeTab === 'competitive' ? t.zone.competitiveDesc :
                    t.zone.masterDesc}
              </p>
            </div>
          </div>
          <div className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'beginner' ? 'bg-cyan-500/10 text-cyan-400' :
            activeTab === 'competitive' ? 'bg-orange-500/10 text-orange-400' :
              'bg-amber-500/10 text-amber-400'
            }`}>
            {filteredOrders.length} {t.zone.quests}
          </div>
        </div>
      </motion.div>

      <div className="px-14">
        <AnimatePresence mode="popLayout">
          {filteredOrders.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {filteredOrders.map(order => (
                <motion.div
                  key={order.orderId}
                  initial={{ opacity: 0, scale: 0.8, y: 100 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", damping: 25, stiffness: 120 }}
                >
                  <OrderCard order={order} onGrab={() => setViewingOrder(order)} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="py-80 flex flex-col items-center text-center space-y-12 opacity-30">
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="text-[180px] filter drop-shadow-[0_0_80px_rgba(34,211,238,0.2)]"
              >
                VOID              </motion.div>
              <p className="font-orbitron font-black text-4xl uppercase tracking-[0.8em] text-cyan-400 glow-cyan">VOID_DETECTED</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const profile = useFeederStore((s) => s.profile);
  const orders = useFeederStore((s) => s.orders);
  const prefs = useFeederStore((s) => s.preferences);
  const setPrefs = useFeederStore((s) => s.setPreferences);
  const feederOnComplete = useFeederStore((s) => s.onFeedComplete);
  const removeOrder = useFeederStore((s) => s.removeOrder);
  const authAddress = useAuthStore((s) => s.address);
  const authToken = useAuthStore((s) => s.token);

  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const viewingOrder = useUIStore((s) => s.viewingOrder);
  const setViewingOrder = useUIStore((s) => s.setViewingOrder);
  const activeOrder = useUIStore((s) => s.activeOrder);
  const setActiveOrder = useUIStore((s) => s.setActiveOrder);
  const showPrefs = useUIStore((s) => s.showPreferences);
  const setShowPrefs = useUIStore((s) => s.setShowPreferences);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const grabAndFeed = useUIStore((s) => s.grabAndFeed);

  const [dataLoading, setDataLoading] = React.useState(true);
  const [profileError, setProfileError] = React.useState<string | null>(null);



  const loadProfile = React.useCallback(async () => {
    api.setAuthToken(authToken ?? null);
    api.setWalletAddress(authAddress ?? null);

    if (!authAddress) {
      useFeederStore.getState().setProfile(null);
      return;
    }

    try {
      const [profileRes, pendingRewardsRes, stakingRes] = await Promise.all([
        api.getFeederProfile(),
        api.getPendingRewards(),
        api.getStakingInfo(),
      ]);

      if (!profileRes.success || !profileRes.feeder) {
        throw new Error('Failed to load feeder profile');
      }

      const pendingRewards = pendingRewardsRes.success ? pendingRewardsRes.data ?? {} : {};
      const staking = stakingRes.success ? stakingRes.staking ?? {} : {};
      const backendHistory = profileRes.feeder.history ?? profileRes.history ?? [];

      const nextProfile = transformFeeder(
        {
          ...profileRes.feeder,
          balanceFEED: pendingRewards.feedBalance ?? profileRes.feeder.balanceFEED ?? 0,
          balanceUSDT: pendingRewards.usdtBalance ?? useFeederStore.getState().profile?.balanceUSDT ?? 0,
          balanceNative: pendingRewards.nativeBalance ?? profileRes.feeder.balanceNative ?? 0,
          stakedAmount: staking.currentStake ?? profileRes.feeder.stakedAmount,
          stakeType: staking.stakeType ?? profileRes.feeder.stakeType,
        },
        backendHistory,
      );

      setProfileError(null);
      useFeederStore.getState().setProfile(nextProfile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load profile';
      console.warn('Failed to load profile:', msg);

      // If JWT expired or unauthorized, clear auth state → show "Connect Wallet"
      if (msg.includes('expired') || msg.includes('Unauthorized') || msg.includes('401') || msg.includes('Invalid')) {
        console.warn('Auth expired, clearing session...');
        useAuthStore.getState().disconnect();
        setProfileError(null);
      } else {
        setProfileError(msg);
      }
      useFeederStore.getState().setProfile(null);
    }
  }, [authAddress, authToken]);

  const loadOrders = React.useCallback(async () => {
    try {
      const res = await api.getOrders();
      if (res.success) {
        const transformed = (res.orders ?? []).map(transformOrder);
        // DEBUG: 打印 NST 订单的 sourceProtocol 值
        const nstOrders = transformed.filter((o: any) => o.sourceProtocol === 'NST' || o.externalOrderId);
        console.log('[DEBUG] Total orders:', transformed.length, 'NST orders:', nstOrders.length);
        nstOrders.forEach((o: any) => console.log('[DEBUG NST]', o.symbol, 'sourceProtocol=', JSON.stringify(o.sourceProtocol), 'externalOrderId=', o.externalOrderId));
        useFeederStore.getState().setOrders(transformed);
      }
    } catch (error) {
      console.warn('Failed to load orders:', error);
    }
  }, []);

  React.useEffect(() => {
    api.setAuthToken(authToken ?? null);
    api.setWalletAddress(authAddress ?? null);
  }, [authAddress, authToken]);

  React.useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadProfile(), loadOrders()]);
      } finally {
        setDataLoading(false);
      }
    })();
  }, [loadOrders, loadProfile]);

  React.useEffect(() => {
    if (!authAddress) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      // Don't auto-retry when there's a persistent error (user must click Retry)
      if (!profileError) {
        void loadProfile();
      }
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authAddress, loadProfile, profileError]);

  // 订单列表定时轮询（30s），作为 WebSocket 推送的兜底
  React.useEffect(() => {
    if (!authAddress) return undefined;
    const ordersIntervalId = window.setInterval(() => {
      void loadOrders();
    }, 30000);
    return () => window.clearInterval(ordersIntervalId);
  }, [authAddress, loadOrders]);

  React.useEffect(() => {
    const mapStatus = (status?: string): OrderStatus | undefined => {
      switch (status) {
        case 'OPEN':
          return OrderStatus.OPEN;
        case 'GRABBED':
          return OrderStatus.GRABBED;
        case 'COMMITTED':
        case 'REVEALING':
        case 'FEEDING':
          return OrderStatus.FEEDING;
        case 'CONSENSUS':
          return OrderStatus.CONSENSUS;
        case 'SETTLED':
          return OrderStatus.SETTLED;
        case 'DISPUTED':
          return OrderStatus.DISPUTED;
        default:
          return undefined;
      }
    };

    const toOrderUpdate = (payload: any): Partial<FeedOrder> => {
      const updates: Partial<FeedOrder> = {};

      const mappedStatus = mapStatus(payload?.status ?? payload?.newStatus);
      if (mappedStatus) {
        updates.status = mappedStatus;
      }

      if (typeof payload?.timeRemaining === 'number') {
        updates.timeRemaining = payload.timeRemaining;
      }

      if (typeof payload?.rewardAmount === 'number') {
        updates.rewardAmount = payload.rewardAmount;
      }

      if (typeof payload?.consensusPrice === 'number') {
        updates.timeRemaining = 0;
      }

      return updates;
    };

    const handleNewOrder = (payload: any) => {
      if (!payload?.id || !payload?.symbol || !payload?.market) {
        loadOrders();
        return;
      }

      const nextOrder = transformOrder(payload);
      const state = useFeederStore.getState();
      const exists = state.orders.some((order) => order.orderId === nextOrder.orderId);

      if (exists) {
        state.updateOrder(nextOrder.orderId, nextOrder);
      } else {
        state.setOrders([nextOrder, ...state.orders]);
      }
    };

    const handleOrderMutation = (payload: any) => {
      if (!payload?.orderId) {
        return;
      }

      const state = useFeederStore.getState();
      const existing = state.orders.find((order) => order.orderId === payload.orderId);
      if (!existing) {
        loadOrders();
        return;
      }

      state.updateOrder(payload.orderId, toOrderUpdate(payload));
    };

    const handleOrderRemoval = (payload: any) => {
      if (payload?.orderId) {
        useFeederStore.getState().removeOrder(payload.orderId);
      }
    };

    const handleReconnect = () => {
      loadOrders();
    };

    const handleProfileRefresh = () => {
      if (authAddress) {
        void loadProfile();
      }
    };

    initWebSocket();

    on('order:new', handleNewOrder);
    on('order:update', handleOrderMutation);
    on('order:grabbed', handleOrderMutation);
    on('order:committed', handleOrderMutation);
    on('order:revealed', handleOrderMutation);
    on('order:consensus', handleOrderMutation);
    on('order:settled', handleOrderMutation);
    on('order:consensus', handleProfileRefresh);
    on('order:settled', handleProfileRefresh);
    on('order:cancelled', handleOrderRemoval);
    on('ws:reconnected', handleReconnect);

    return () => {
      off('order:new', handleNewOrder);
      off('order:update', handleOrderMutation);
      off('order:grabbed', handleOrderMutation);
      off('order:committed', handleOrderMutation);
      off('order:revealed', handleOrderMutation);
      off('order:consensus', handleOrderMutation);
      off('order:settled', handleOrderMutation);
      off('order:consensus', handleProfileRefresh);
      off('order:settled', handleProfileRefresh);
      off('order:cancelled', handleOrderRemoval);
      off('ws:reconnected', handleReconnect);
      closeWebSocket();
    };
  }, [authAddress, loadOrders, loadProfile]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { damping: 50, stiffness: 200 });
  const springY = useSpring(mouseY, { damping: 50, stiffness: 200 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set(clientX - innerWidth / 2);
    mouseY.set(clientY - innerHeight / 2);
  };

  const handleGrab = async (orderId: string) => {
    const order = orders.find((o) => o.orderId === orderId);
    if (!order) {
      return;
    }

    try {
      const result = await api.grabOrder(orderId);
      const nextStatus =
        result.newStatus === 'FEEDING'
          ? OrderStatus.FEEDING
          : result.newStatus === 'GRABBED'
            ? OrderStatus.GRABBED
            : order.status;

      useFeederStore.getState().updateOrder(orderId, { status: nextStatus });
      setViewingOrder(null);
      grabAndFeed({ ...order, status: nextStatus });
    } catch (error) {
      console.warn('Failed to grab order:', error);
    }
  };

  const handleComplete = (xp: number, feed: number) => {
    feederOnComplete(xp, feed);
    if (activeOrder) {
      // NST 订单喂价完后更新状态而非删除（让用户能看到已完成的订单）
      const isNST = activeOrder.sourceProtocol === 'NST' || !!(activeOrder as any).externalOrderId;
      if (isNST) {
        useFeederStore.getState().updateOrder(activeOrder.orderId, { status: 'SETTLED' as any });
      } else {
        removeOrder(activeOrder.orderId);
      }
    }
    setActiveOrder(null);
    // 刷新订单列表获取最新状态
    loadOrders();
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // NST 协议订单 — 不受 tab 分区限制，始终显示
      const isNST = order.sourceProtocol === 'NST' || !!(order as any).externalOrderId;
      if (isNST) return true;

      const matchesTab =
        (activeTab === 'beginner' && order.notionalAmount < 100000) ||
        (activeTab === 'competitive' && order.notionalAmount >= 100000 && order.notionalAmount < 1000000) ||
        (activeTab === 'master' && order.notionalAmount >= 1000000);

      if (!matchesTab) return false;

      return (
        prefs.countries.includes(order.country) &&
        prefs.exchanges.includes(order.exchange) &&
        prefs.assets.includes(order.market)
      );
    });
  }, [orders, activeTab, prefs]);

  const renderContent = () => {
    // No profile: show connect wallet / error prompt inside Layout
    if (!profile) {
      return (
        <div className="flex items-center justify-center py-32 min-h-[50vh]">
          <div className="text-center space-y-6 max-w-md px-8">
            <div className="text-6xl mb-4">{!authAddress ? '🔗' : '⚠️'}</div>
            <h2 className="text-2xl font-bold font-orbitron text-cyan-400">
              {!authAddress ? 'Connect Your Wallet' : 'Profile Load Failed'}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              {!authAddress
                ? 'Connect your wallet to access the Feed Engine dashboard, manage orders, and earn rewards.'
                : profileError || 'Unable to load your feeder profile. The server may be temporarily unavailable.'}
            </p>
            {authAddress && (
              <button
                onClick={() => { setProfileError(null); void loadProfile(); }}
                className="px-6 py-3 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all font-semibold"
              >
                ↻ Retry
              </button>
            )}
          </div>
        </div>
      );
    }

    switch (activeView) {
      case 'Quest Hall':
        return (
          <QuestHallView
            filteredOrders={filteredOrders}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setShowPrefs={setShowPrefs}
            setViewingOrder={setViewingOrder}
            springX={springX}
            springY={springY}
            onMouseMove={handleMouseMove}
          />
        );
      case 'Dashboard':
        return <DashboardView profile={profile} />;
      case 'Leaderboard':
        return <LeaderboardView />;
      case 'Inventory':
        return <InventoryView />;
      case 'Achievements':
        return <AchievementsView />;
      case 'Training Center':
        return <TrainingView />;
      case 'Staking':
        return <StakingView profile={profile} />;
      case 'Arbitration':
        return <ArbitrationView />;
      default:
        return null;
    }
  };
  // 首次渲染时 profile 尚未初始化（useEffect 还未执行），显示加载画面

  if (dataLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#030406] text-cyan-400">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full"
        />
      </div>
    );
  }



  return (
    <Layout profile={profile} activeView={activeView} onNavigate={setActiveView}>
      {renderContent()}
      <AnimatePresence>
        {viewingOrder && <OrderDetailModal order={viewingOrder} onClose={() => setViewingOrder(null)} onGrab={handleGrab} />}
      </AnimatePresence>
      <AnimatePresence>
        {activeOrder && <FeedModal order={activeOrder} onClose={() => setActiveOrder(null)} onComplete={handleComplete} />}
      </AnimatePresence>
      <AnimatePresence>
        {showPrefs && <PreferencesModal prefs={prefs} onClose={() => setShowPrefs(false)} onUpdate={setPrefs} />}
      </AnimatePresence>
    </Layout>
  );
};

export default App;





