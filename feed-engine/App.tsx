
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


import { Zap, ShieldCheck, Sword, Crown, Activity, Globe, Rocket, Terminal, Target } from 'lucide-react';
import SystemLoader from './components/feedback/SystemLoader';
import SystemEmpty from './components/feedback/SystemEmpty';
import SystemError from './components/feedback/SystemError';
import RewardModal from './components/feedback/RewardModal';

const THEMES = {
  beginner: {
    color: 'cyan',
    bgColor: 'bg-cyan-500',
    textColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/20',
    ring1: 'rgba(34,211,238,0.6)',
    ring2: 'rgba(34,211,238,0.3)',
    glow: 'shadow-[0_0_80px_rgba(34,211,238,0.4),inset_0_0_40px_rgba(34,211,238,0.3)]',
    gradient: 'from-cyan-400/40 via-cyan-500/60 to-cyan-600/40',
    textGradient: 'from-transparent to-cyan-500'
  },
  competitive: {
    color: 'orange',
    bgColor: 'bg-orange-500',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-500/20',
    ring1: 'rgba(249,115,22,0.6)',
    ring2: 'rgba(249,115,22,0.3)',
    glow: 'shadow-[0_0_80px_rgba(249,115,22,0.4),inset_0_0_40px_rgba(249,115,22,0.3)]',
    gradient: 'from-orange-400/40 via-orange-500/60 to-orange-600/40',
    textGradient: 'from-transparent to-orange-500'
  },
  master: {
    color: 'rose',
    bgColor: 'bg-rose-500',
    textColor: 'text-rose-400',
    borderColor: 'border-rose-500/20',
    ring1: 'rgba(225,29,72,0.6)',
    ring2: 'rgba(225,29,72,0.3)',
    glow: 'shadow-[0_0_80px_rgba(225,29,72,0.4),inset_0_0_40px_rgba(225,29,72,0.3)]',
    gradient: 'from-rose-400/40 via-rose-500/60 to-rose-600/40',
    textGradient: 'from-transparent to-rose-500'
  }
};

const OrbitalRing: React.FC<{ index: number; springX: MotionValue<number>; springY: MotionValue<number>; themeColor: string }> = ({ index, springX, springY, themeColor }) => {
  const x = useTransform(springX, [-500, 500], [index * -15, index * 15]);
  const y = useTransform(springY, [-500, 500], [index * -15, index * 15]);
  const rotate = index % 2 === 0 ? 360 : -360;

  return (
    <motion.div
      animate={{ rotate }}
      transition={{ duration: 40 + index * 15, repeat: Infinity, ease: "linear" }}
      className={`absolute rounded-full border border-dashed shadow-inner`}
      style={{
        x, y,
        borderColor: themeColor === 'orange' ? 'rgba(249,115,22,0.1)' : themeColor === 'rose' ? 'rgba(225,29,72,0.1)' : 'rgba(34,211,238,0.1)',
        width: 450 + index * 250,
        height: 450 + index * 250
      }}
    />
  );
};

const DataNodeHUD: React.FC<{ label: string; value: string; icon: React.ReactNode; posClass: string; theme: any; delay?: number }> = ({ label, value, icon, posClass, theme, delay = 0 }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.8 }}
      className={`absolute ${posClass} glass-panel border ${theme.borderColor} p-4 rounded-3xl w-48 shadow-2xl backdrop-blur-md hidden md:flex flex-col gap-2 z-30 group`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-6 h-6 rounded-lg ${theme.bgColor}/10 flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <p className={`text-xl font-orbitron font-black italic shadow-black drop-shadow-md ${theme.textColor} group-hover:scale-105 transition-all origin-left`}>
        {value}
      </p>
    </motion.div>
  );
};

const CosmicHero: React.FC<{ springX: MotionValue<number>; springY: MotionValue<number>; activeTab: string }> = ({ springX, springY, activeTab }) => {
  const craftRotateX = useTransform(springY, [-500, 500], [10, -10]);
  const craftRotateY = useTransform(springX, [-500, 500], [-10, 10]);
  const coreX = useTransform(springX, [-500, 500], [-30, 30]);
  const coreY = useTransform(springY, [-500, 500], [-30, 30]);
  
  const theme = THEMES[activeTab as keyof typeof THEMES] || THEMES.beginner;
  const statChips = [
    { label: 'HASH POWER', value: '2.12M TH/s', icon: <Globe className={`w-3 h-3 ${theme.textColor}`}/> },
    { label: 'LATENCY', value: '12ms', icon: <Activity className={`w-3 h-3 ${theme.textColor}`}/> },
    { label: 'REWARD POOL', value: '2.5M XTTA', icon: <Crown className={`w-3 h-3 ${theme.textColor}`}/> },
    { label: 'OPERATORS', value: '8,402', icon: <ShieldCheck className={`w-3 h-3 ${theme.textColor}`}/> }
  ];

  return (
    <section className="relative h-[250px] sm:h-[280px] lg:h-[320px] 2xl:h-[480px] flex flex-col items-center justify-center text-center overflow-visible">
      {/* HUD Nodes */}
      <DataNodeHUD label="GLOBAL HASH POWER" value="2,122,520 TH/s" icon={<Globe className={`w-3 h-3 ${theme.textColor}`}/>} posClass="left-10 top-20" theme={theme} delay={0.1}/>
      <DataNodeHUD label="NETWORK LATENCY" value="12ms" icon={<Activity className={`w-3 h-3 ${theme.textColor}`}/>} posClass="left-10 bottom-20" theme={theme} delay={0.3}/>
      <DataNodeHUD label="TOTAL REWARD POOL" value="2.5M XTTA" icon={<Crown className={`w-3 h-3 ${theme.textColor}`}/>} posClass="right-10 top-20" theme={theme} delay={0.2}/>
      <DataNodeHUD label="ACTIVE OPERATORS" value="8,402" icon={<ShieldCheck className={`w-3 h-3 ${theme.textColor}`}/>} posClass="right-10 bottom-20" theme={theme} delay={0.4}/>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {[1, 2, 3].map(i => (
          <OrbitalRing key={i} index={i} springX={springX} springY={springY} themeColor={theme.color} />
        ))}

        <motion.div
          style={{ x: coreX, y: coreY, rotateX: craftRotateX, rotateY: craftRotateY }}
          className="relative w-[190px] h-[190px] sm:w-[230px] sm:h-[230px] lg:w-[260px] lg:h-[260px] 2xl:w-[400px] 2xl:h-[400px] flex items-center justify-center transition-colors duration-1000"
        >
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 5, repeat: Infinity }}
            className={`absolute w-full h-full ${theme.bgColor}/10 blur-[120px] rounded-full`}
          />
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10 w-[132px] h-[132px] sm:w-[150px] sm:h-[150px] lg:w-[160px] lg:h-[160px] 2xl:w-[240px] 2xl:h-[240px]"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className={`absolute inset-[-20px] rounded-full border-2 ${theme.borderColor}`}
              style={{ borderTopColor: theme.ring1, borderRightColor: theme.ring2 }}
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className={`absolute inset-[10px] rounded-full border ${theme.borderColor}`}
              style={{ borderBottomColor: theme.ring2, borderLeftColor: theme.ring1 }}
            />
            <motion.div
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className={`absolute inset-[30px] rounded-full border ${theme.borderColor}`}
            />
            <div className={`absolute inset-[50px] rounded-full bg-gradient-to-br ${theme.gradient} blur-[20px]`} />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className={`absolute inset-[70px] rounded-full bg-gradient-to-br ${theme.gradient} ${theme.glow}`}
            />
            <motion.div
              animate={{ scale: [1.1, 0.9, 1.1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-[85px] rounded-full bg-gradient-to-br from-white/30 ${theme.gradient} ${theme.glow}`}
            />
            <div className="absolute inset-[90px] rounded-full flex items-center justify-center">
              <Zap className="w-10 h-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,1)]" />
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="relative z-20 mt-4 lg:mt-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <h2 className="text-[42px] sm:text-[52px] md:text-[80px] 2xl:text-[100px] font-black font-orbitron tracking-tighter italic uppercase text-white leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,1)]">
              FEED<span className={theme.textColor}>VERSE</span>
            </h2>
            <div className={`flex items-center gap-6 w-full max-w-2xl opacity-60 mt-2`}>
              <div className={`h-px flex-1 bg-gradient-to-r ${theme.textGradient}`} />
              <p className={`text-[8px] sm:text-[10px] font-black tracking-[0.45em] sm:tracking-[1em] ${theme.textColor}`}>COMMAND_CENTER_V4</p>
              <div className={`h-px flex-1 bg-gradient-to-l ${theme.textGradient}`} />
            </div>
          </motion.div>
      </div>
      <div className="absolute -bottom-8 left-0 right-0 z-30 flex gap-3 overflow-x-auto px-3 pb-1 md:hidden no-scrollbar">
        {statChips.map((stat) => (
          <div key={stat.label} className={`min-w-[138px] rounded-2xl border ${theme.borderColor} bg-black/70 px-3 py-2 text-left backdrop-blur-xl`}>
            <div className="flex items-center gap-2 text-slate-500">
              {stat.icon}
              <span className="text-[7px] font-black uppercase tracking-[0.25em]">{stat.label}</span>
            </div>
            <p className={`mt-1 font-orbitron text-sm font-black italic ${theme.textColor}`}>{stat.value}</p>
          </div>
        ))}
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
  const theme = THEMES[activeTab as keyof typeof THEMES] || THEMES.beginner;

  return (
    <div onMouseMove={onMouseMove} className="space-y-8 lg:space-y-12 max-w-7xl mx-auto pb-32 lg:pb-40 relative">
      <CosmicHero springX={springX} springY={springY} activeTab={activeTab} />

      {/* Difficulty Selectors */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-12 px-0 lg:px-10 pt-8 md:pt-0">
        <div className="flex glass-panel p-1.5 lg:p-2 rounded-[1.5rem] lg:rounded-[3.5rem] border border-white/5 relative group overflow-x-auto w-full lg:w-auto shadow-2xl no-scrollbar">
          {[
            { id: 'beginner', label: 'Primary Sync', icon: <ShieldCheck size={18}/>, colorClass: 'text-cyan-400', activeClass: 'bg-cyan-500 text-black shadow-[0_0_30px_rgba(34,211,238,0.4)]' },
            { id: 'competitive', label: 'Combat Feed', icon: <Sword size={18}/>, colorClass: 'text-orange-400', activeClass: 'bg-orange-500 text-black shadow-[0_0_30px_rgba(249,115,22,0.4)]' },
            { id: 'master', label: 'Zenith Oracle', icon: <Crown size={18}/>, colorClass: 'text-rose-400', activeClass: 'bg-rose-500 text-black shadow-[0_0_30px_rgba(225,29,72,0.4)]' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[48px] px-4 sm:px-6 lg:px-8 py-3 lg:py-4 rounded-[1.2rem] lg:rounded-[3rem] text-[9px] lg:text-[10px] font-black uppercase tracking-[0.16em] lg:tracking-[0.3em] transition-all flex items-center gap-2 lg:gap-3 relative z-10 flex-1 lg:flex-none justify-center whitespace-nowrap ${
                activeTab === tab.id
                ? `${tab.activeClass} scale-105`
                : `${tab.colorClass} hover:bg-white/5`
              }`}
            >
              <span className="group-hover:scale-110 transition-transform">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3 lg:gap-6 shrink-0">
          <button onClick={() => setShowPrefs(true)} className="min-h-[48px] w-12 lg:w-14 lg:h-14 rounded-2xl glass-panel flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all shadow-inner">
            <Terminal size={20} />
          </button>
          <button className={`btn-cyber !min-h-[48px] !text-[10px] lg:!text-[11px] tracking-[0.18em] lg:tracking-[0.3em] flex flex-1 lg:flex-none items-center justify-center gap-2 !px-5 lg:!px-8`}>
            <Rocket size={16} className="fill-black" />
            INITIATE SCAN
          </button>
        </div>
      </section>

      {/* Directive Banner */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="px-0 lg:px-10"
      >
        <div className={`flex flex-col md:flex-row items-start md:items-center justify-between px-4 sm:px-5 lg:px-10 py-4 lg:py-6 rounded-[1.5rem] lg:rounded-[2.5rem] glass-panel border shadow-lg ${theme.borderColor}`}>
          <div className="flex items-center gap-4 lg:gap-6">
            <div className={`w-11 h-11 lg:w-14 lg:h-14 rounded-2xl ${theme.bgColor}/10 flex items-center justify-center shrink-0`}>
               {activeTab === 'beginner' ? <ShieldCheck className={`w-7 h-7 ${theme.textColor}`}/> : activeTab === 'competitive' ? <Sword className={`w-7 h-7 ${theme.textColor}`}/> : <Crown className={`w-7 h-7 ${theme.textColor}`}/>}
            </div>
            <div>
              <p className={`text-sm lg:text-lg font-black font-orbitron uppercase tracking-widest italic mb-1 ${theme.textColor}`}>
                » {activeTab === 'beginner' ? 'STANDARD ORACLE PROTOCOL' : activeTab === 'competitive' ? 'HOSTILE MARKET SECURED' : 'RESTRICTED A/S LEVEL'}
              </p>
              <p className="text-[9px] lg:text-[10px] text-slate-400 font-bold tracking-wider leading-relaxed">
                {activeTab === 'beginner' ? 'RECOMMENDED FOR F-D OPERATORS. SAFE YIELD SECURED.' :
                 activeTab === 'competitive' ? 'ENHANCED COLLATERAL REQUIRED. EXTREME VOLATILITY.' :
                 'LETHAL PENALTIES ACTIVE. ELITE CONSENSUS ONLY.'}
              </p>
            </div>
          </div>
          <div className="mt-4 md:mt-0 flex gap-4">
             <div className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest ${theme.bgColor}/10 ${theme.textColor} border ${theme.borderColor} shadow-inner`}>
               {filteredOrders.length} MISSIONS IDENTIFIED
             </div>
          </div>
        </div>
      </motion.div>

      {/* Orders Grid */}
      <div className="px-0 lg:px-10">
        <AnimatePresence mode="popLayout">
          {filteredOrders.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-8">
              {filteredOrders.map(order => (
                <motion.div
                  key={order.orderId}
                  initial={{ opacity: 0, scale: 0.9, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", damping: 25, stiffness: 150 }}
                >
                  <OrderCard order={order} onGrab={() => setViewingOrder(order)} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="py-10 lg:py-40">
              <SystemEmpty 
                title="VOID_DETECTED" 
                subtitle="No missions available in this sector matching your credentials." 
                icon="target" 
              />
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
  const rewardQueue = useUIStore((s) => s.rewardQueue);
  const dequeueReward = useUIStore((s) => s.dequeueReward);

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
      if (profileError || !authAddress) {
        return (
          <div className="flex flex-col items-center justify-center py-32 min-h-[60vh] max-w-2xl mx-auto">
            <SystemError 
              message={!authAddress ? "NODE CONNECTIVITY REQUIRED" : profileError || "CRITICAL_FAILURE: UNABLE TO MOUNT PROFILE"}
              resolution={!authAddress ? "Initialize your node link to access the matrix." : "Server linkage failure. Awaiting command override."}
              onRetry={authAddress ? () => { setProfileError(null); void loadProfile(); } : undefined}
            />
          </div>
        );
      }
      return <SystemLoader fullScreen message="SYS_SYNC: MOUNTING PROFILE RECORD..." />;
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
    return <SystemLoader fullScreen message="SYS_SYNC: INITIALIZING GLOBAL MATRIX..." subMessage="CONNECTING DECENTRALIZED DATA FEEDS" />;
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

      {/* Global Reward Modal wired to the multi-event queue */}
      <RewardModal 
        isOpen={rewardQueue.length > 0} 
        onClose={() => dequeueReward()} 
        type={rewardQueue[0]?.type || 'MISSION_SUCCESS'}
        title={rewardQueue[0]?.title || ''}
        subtitle={rewardQueue[0]?.subtitle}
        value={rewardQueue[0]?.value}
      />
    </Layout>
  );
};

export default App;





