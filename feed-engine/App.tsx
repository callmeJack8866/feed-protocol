
import React, { useState, useMemo, useEffect } from 'react';
import Layout from './components/Layout';
import OrderCard from './components/OrderCard';
import FeedModal from './components/FeedModal';
import OrderDetailModal from './components/OrderDetailModal';
import DashboardView from './components/DashboardView';
import LeaderboardView from './components/LeaderboardView';
import InventoryView from './components/InventoryView';
import TrainingView from './components/TrainingView';
import StakingView from './components/StakingView';
import ArbitrationView from './components/ArbitrationView';
import PreferencesModal from './components/PreferencesModal';
import { FeederProfile, FeederRank, FeedOrder, ViewType } from './types';
import { MOCK_ORDERS, MOCK_HISTORY } from './constants';
import { motion, AnimatePresence, useTransform, useMotionValue, useSpring, MotionValue } from 'framer-motion';

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
      iteration += 1/2;
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
          <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-black text-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all duration-500 bg-current ${colorClass.replace('text-', 'bg-')} group-hover:scale-110`}>
            {icon}
          </div>
        )}
        <h3 className={`text-8xl font-black font-orbitron italic text-white glow-text transition-all duration-500 group-hover:scale-105 tracking-tighter`}>
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
    <section className="relative h-[750px] flex flex-col items-center justify-center text-center">
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
            className="relative z-10"
          >
            <img 
               src="https://pngimg.com/uploads/spaceship/spaceship_PNG46.png" 
               className="w-[550px] drop-shadow-[0_60px_100px_rgba(34,211,238,0.3)] filter contrast-125" 
               alt="hero craft"
            />
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
               <h2 className="text-[160px] font-black font-orbitron tracking-tighter italic uppercase text-white leading-none drop-shadow-[0_30px_60px_rgba(0,0,0,1)] selection:bg-cyan-500">
                  OWL<span className="text-cyan-400 glow-cyan">VERSE</span>
               </h2>
               <div className="flex items-center gap-10 w-full max-w-4xl opacity-40">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-cyan-500" />
                  <p className="text-[10px] font-black tracking-[1.5em] text-cyan-400">COMMAND_CENTER_V4</p>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-cyan-500" />
               </div>
            </motion.div>
         </div>

         <div className="flex flex-col md:flex-row items-center justify-center gap-32">
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
  return (
    <div onMouseMove={onMouseMove} className="space-y-24 max-w-7xl mx-auto pb-40 relative">
      <CosmicHero springX={springX} springY={springY} />

      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 px-14">
        <div className="flex bg-black/80 p-3 rounded-[3.5rem] border border-white/5 backdrop-blur-3xl shadow-[0_30px_80px_rgba(0,0,0,0.8)] relative group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {[
            { id: 'beginner', label: 'Primary Sync', icon: '🌀' },
            { id: 'competitive', label: 'Combat Feed', icon: '🔥' },
            { id: 'master', label: 'Zenith Oracle', icon: '💎' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-14 py-6 rounded-[2.8rem] text-[11px] font-black uppercase tracking-[0.4em] transition-all flex items-center gap-5 group relative z-10 ${
                activeTab === tab.id 
                ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.4)] scale-105' 
                : 'text-slate-500 hover:text-cyan-400'
              }`}
            >
              <span className="text-2xl group-hover:scale-125 transition-transform">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-8">
           <button onClick={() => setShowPrefs(true)} className="w-24 h-24 rounded-[3.5rem] bg-black/60 border border-white/10 flex items-center justify-center text-3xl hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all group relative overflow-hidden">
              <span className="group-hover:rotate-180 transition-transform duration-700 relative z-10">⚙️</span>
           </button>
           <button className="px-16 py-6 rounded-[3.5rem] bg-cyan-500 text-black font-black font-orbitron text-[13px] uppercase tracking-[0.4em] italic shadow-[0_30px_60px_rgba(34,211,238,0.4)] hover:bg-cyan-400 hover:scale-105 active:scale-95 transition-all relative overflow-hidden group">
              Initiate Neural Scan
           </button>
        </div>
      </section>

      <div className="px-14">
        <AnimatePresence mode="popLayout">
          {filteredOrders.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
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
                  🛰️
               </motion.div>
               <p className="font-orbitron font-black text-4xl uppercase tracking-[0.8em] text-cyan-400 glow-cyan">VOID_DETECTED</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [profile, setProfile] = useState<FeederProfile>({
    address: '0x71C...3a21',
    nickname: 'Sophia Lane',
    rank: FeederRank.B,
    xp: 12450,
    totalFeeds: 342,
    accuracyRate: 98.4,
    balanceFEED: 1540,
    balanceUSDT: 5000,
    history: MOCK_HISTORY,
    stakedAmount: 5000,
    stakeType: 'USDT'
  });

  const [activeView, setActiveView] = useState<ViewType>('Quest Hall');
  const [orders, setOrders] = useState<FeedOrder[]>(MOCK_ORDERS);
  const [viewingOrder, setViewingOrder] = useState<FeedOrder | null>(null);
  const [activeOrder, setActiveOrder] = useState<FeedOrder | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [activeTab, setActiveTab] = useState<'beginner' | 'competitive' | 'master'>('beginner');
  
  // Parallax Values - Correctly placed at top level
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { damping: 50, stiffness: 200 });
  const springY = useSpring(mouseY, { damping: 50, stiffness: 200 });

  const [prefs, setPrefs] = useState({
    countries: ['CN', 'US', 'GLOBAL'],
    exchanges: ['SSE', 'NASDAQ', 'BINANCE'],
    assets: ['CRYPTO', 'US_STOCK', 'CN_STOCK']
  });

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set(clientX - innerWidth / 2);
    mouseY.set(clientY - innerHeight / 2);
  };

  const handleGrab = (orderId: string) => {
    const order = orders.find(o => o.orderId === orderId);
    if (order) {
      setViewingOrder(null);
      setActiveOrder(order);
    }
  };

  const handleComplete = (xp: number, feed: number) => {
    setProfile(prev => ({
      ...prev,
      xp: prev.xp + xp,
      balanceFEED: prev.balanceFEED + feed,
      totalFeeds: prev.totalFeeds + 1,
    }));
    setOrders(prev => prev.filter(o => o.orderId !== activeOrder?.orderId));
    setActiveOrder(null);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesTab = 
        (activeTab === 'beginner' && order.notionalAmount < 100000) ||
        (activeTab === 'competitive' && order.notionalAmount >= 100000 && order.notionalAmount < 1000000) ||
        (activeTab === 'master' && order.notionalAmount >= 1000000);
      
      if (!matchesTab) return false;
      return prefs.countries.includes(order.country) && prefs.exchanges.includes(order.exchange) && prefs.assets.includes(order.market);
    });
  }, [orders, activeTab, prefs]);

  const renderContent = () => {
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
      case 'Dashboard': return <DashboardView profile={profile} />;
      case 'Leaderboard': return <LeaderboardView />;
      case 'Inventory': return <InventoryView />;
      case 'Training Center': return <TrainingView />;
      case 'Staking': return <StakingView profile={profile} />;
      case 'Arbitration': return <ArbitrationView />;
      default: return null;
    }
  };

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
