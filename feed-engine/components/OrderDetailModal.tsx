import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FeedOrder, OrderStatus, MarketType, ConditionType } from '../types';
import { MARKET_ICONS, STATUS_CONFIG, getReferenceData } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';
import { 
  Terminal, ShieldCheck, Sword, Crown, Activity, Globe, Rocket, 
  Target, Zap, AlertTriangle, ShieldAlert, Coins, ScanLine, Clock, Signal
} from 'lucide-react';

interface OrderDetailModalProps {
  order: FeedOrder;
  onClose: () => void;
  onGrab: (orderId: string) => void;
}

type ParticipantStatus = 'COMMITTED' | 'VERIFYING' | 'PENDING';

interface Participant {
  id: string;
  status: ParticipantStatus;
  latency: string;
  reliability: number;
}

const systemThemes = {
  cyan: {
    border: 'border-cyan-500/20',
    ambient: 'bg-cyan-500/10',
    header: 'bg-cyan-500/10 shadow-[inset_0_0_20px_rgba(34,211,238,0.2)]',
    dot: 'bg-cyan-400',
    text: 'text-cyan-400',
    fill: 'bg-cyan-500/80',
  },
  amber: {
    border: 'border-amber-500/20',
    ambient: 'bg-amber-500/10',
    header: 'bg-amber-500/10 shadow-[inset_0_0_20px_rgba(245,158,11,0.2)]',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    fill: 'bg-amber-500/80',
  },
  emerald: {
    border: 'border-emerald-500/20',
    ambient: 'bg-emerald-500/10',
    header: 'bg-emerald-500/10 shadow-[inset_0_0_20px_rgba(16,185,129,0.2)]',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    fill: 'bg-emerald-500/80',
  },
  slate: {
    border: 'border-slate-500/20',
    ambient: 'bg-slate-500/10',
    header: 'bg-slate-500/10 shadow-[inset_0_0_20px_rgba(100,116,139,0.2)]',
    dot: 'bg-slate-400',
    text: 'text-slate-400',
    fill: 'bg-slate-500/80',
  },
};

const classBadges = {
  master: 'border-rose-500/30 text-rose-300 bg-rose-500/10',
  combat: 'border-orange-500/30 text-orange-300 bg-orange-500/10',
  sync: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
};

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 400;
  const height = 100;
  const points = data.map((point, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - ((point - min) / range) * height,
  }));
  const pathData = `M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id="detail-chart-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={`${pathData} L ${width},${height} L 0,${height} Z`} fill="url(#detail-chart-gradient)" className="pointer-events-none" />
    </svg>
  );
};

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ order, onClose, onGrab }) => {
  const [logLines, setLogLines] = useState<string[]>([]);
  const [signalStrength, setSignalStrength] = useState(85);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'stable'>('stable');
  const lastPriceRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { t } = useTranslation();

  const currentStatus = STATUS_CONFIG[order.status] || STATUS_CONFIG[OrderStatus.OPEN];
  
  // Dynamic colorization based on open / taken status
  const systemColor = order.status === OrderStatus.OPEN ? 'cyan' 
                    : order.status === OrderStatus.EXPIRED ? 'slate'
                    : order.status === OrderStatus.SETTLED ? 'emerald'
                    : 'amber';
  const systemTheme = systemThemes[systemColor];

  const isMasterZone = order.notionalAmount >= 1000000;
  const isCombatZone = order.notionalAmount >= 100000 && !isMasterZone;

  const referenceWindow = useMemo(() => {
    const reference = getReferenceData(order.symbol);
    let tolerance = 0.2;
    if (order.market === MarketType.CRYPTO) tolerance = 0.4;
    if (order.market === MarketType.FOREX) tolerance = 0.05;
    if (isMasterZone) tolerance *= 0.25;

    return {
      reference,
      min: reference * (1 - tolerance),
      max: reference * (1 + tolerance),
      tolerancePercent: (tolerance * 100).toFixed(1),
    };
  }, [order.symbol, order.market, order.notionalAmount, isMasterZone]);

  useEffect(() => {
    const isCrypto = order.market === MarketType.CRYPTO;
    setLogLines([
      '[SYS] Secure Terminal Link Established',
      `[INTEL] Querying ${order.exchange} Reference Matrices...`,
      `[TARG] Intercepting feed: ${order.symbol}/USDT`,
    ]);

    const updateLogs = (message: string) => {
      setLogLines((previous) => [...previous.slice(-7), message]);
    };

    if (isCrypto) {
      const cleanSymbol = order.symbol.replace('/', '').toLowerCase();
      const wsUrl = `wss://stream.binance.com:9443/ws/${cleanSymbol}@trade`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        updateLogs('[NET] Uplink Active: Binance Raw Stream');
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const nextPrice = parseFloat(data.p);

        if (lastPriceRef.current !== null) {
          setPriceDirection(nextPrice > lastPriceRef.current ? 'up' : nextPrice < lastPriceRef.current ? 'down' : 'stable');
        }

        setLivePrice(nextPrice);
        setPriceHistory((previous) => [...previous.slice(-29), nextPrice]);
        lastPriceRef.current = nextPrice;
        updateLogs(`[TICK] ${nextPrice.toFixed(2)} » Vol: ${parseFloat(data.q).toFixed(4)}`);
        setSignalStrength((previous) => Math.max(85, Math.min(99, previous + (Math.random() - 0.5) * 4)));
      };

      wsRef.current.onerror = () => {
        updateLogs('[ERR] Uplink Interference. Bypass Routing...');
      };
    } else {
      const tickerInterval = window.setInterval(() => {
        const basePrice = lastPriceRef.current || referenceWindow.reference;
        const volatility = isMasterZone ? 0.0001 : 0.0005;
        const nextPrice = basePrice + basePrice * volatility * (Math.random() - 0.5);

        setPriceDirection(nextPrice > basePrice ? 'up' : 'down');
        setLivePrice(nextPrice);
        setPriceHistory((previous) => [...previous.slice(-29), nextPrice]);
        lastPriceRef.current = nextPrice;

        const type = Math.random() > 0.8 ? 'PUSH' : 'SCAN';
        updateLogs(`[${type}] Proxied Reference: ${nextPrice.toFixed(4)}`);
        setSignalStrength((previous) => Math.max(80, Math.min(98, previous + (Math.random() - 0.5) * 5)));
      }, 1000 + Math.random() * 500);

      return () => window.clearInterval(tickerInterval);
    }

    return () => {
      wsRef.current?.close();
    };
  }, [order.symbol, order.market, order.exchange, isMasterZone, referenceWindow.reference]);

  const participants = useMemo(() => {
    const nextParticipants: Participant[] = [];
    const committedCount = Math.floor(order.requiredFeeders * 0.4);

    for (let index = 0; index < order.requiredFeeders; index += 1) {
      const id = `NODE-${1000 + index}`;
      const latency = `${(Math.random() * 45 + 5).toFixed(1)}ms`;
      const reliability = 95 + Math.random() * 5;

      if (index < committedCount) {
        nextParticipants.push({ id, status: 'COMMITTED', latency, reliability });
      } else if (index === committedCount) {
        nextParticipants.push({ id, status: 'VERIFYING', latency, reliability });
      } else {
        nextParticipants.push({ id, status: 'PENDING', latency, reliability });
      }
    }
    return nextParticipants;
  }, [order.requiredFeeders]);

  const committedCount = participants.filter((participant) => participant.status === 'COMMITTED').length;

  return (
    <div data-testid="order-detail-modal" className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/95 backdrop-blur-3xl p-0 lg:p-8 perspective-1000">
      <motion.div
        initial={{ scale: 1.1, opacity: 0, rotateX: 10 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        exit={{ scale: 0.9, opacity: 0, filter: 'blur(10px)' }}
        transition={{ type: "spring", damping: 20, stiffness: 100 }}
        className={`relative w-full h-[100dvh] lg:h-auto lg:max-h-[95vh] lg:max-w-7xl glass-panel rounded-none lg:rounded-[2rem] overflow-hidden flex flex-col shadow-[0_0_150px_rgba(0,0,0,1)] border-0 lg:border ${systemTheme.border}`}
      >
        {/* Ambient Modal Glow */}
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] ${systemTheme.ambient} blur-[100px] rounded-full pointer-events-none`} />

        {/* Global Status Header */}
        <div className="sticky top-0 z-20 flex border-b border-white/5 bg-black/80 backdrop-blur-xl">
           <div className={`px-4 lg:px-8 py-4 lg:py-5 flex items-center gap-3 lg:gap-4 border-r border-white/5 ${systemTheme.header}`}>
              <div className={`w-3 h-3 rounded-full ${systemTheme.dot} animate-pulse shadow-[0_0_10px_currentColor]`} />
              <h1 className={`text-sm sm:text-lg lg:text-xl font-black font-orbitron uppercase tracking-[0.2em] sm:tracking-[0.35em] lg:tracking-[0.5em] ${systemTheme.text}`}>
                 MISSION {order.status}
              </h1>
           </div>
           
           <div className="flex-1 flex justify-between items-center px-4 lg:px-8 gap-3">
              <p className="hidden sm:flex text-[10px] font-black uppercase text-slate-500 tracking-[0.4em] items-center gap-3">
                 <Terminal size={14}/> Node Intel Division // Briefing Terminal
              </p>
              <div className="sm:hidden min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white truncate">{order.symbol}</p>
                <p className="text-[8px] font-mono text-slate-500 truncate">{order.exchange} / {order.market}</p>
              </div>
              
              <button
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center text-xl transition-all border border-white/10"
              >
                X
              </button>
           </div>
        </div>

        {/* 3-Panel War Room View */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto custom-scrollbar relative z-10 safe-modal-padding lg:pb-0">
          
          {/* PANEL A: TARGET INTELLIGENCE */}
          <div className="w-full lg:w-1/3 border-r border-white/5 p-4 lg:p-8 flex flex-col justify-between">
             <div>
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.28em] lg:tracking-[0.5em] mb-8 flex items-center gap-2">
                   <Target size={12}/> Target Profile
                </h3>
                
                <div className="flex flex-wrap items-center gap-4 lg:gap-6 mb-8 group">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-[1.25rem] lg:rounded-[1.5rem] bg-white flex items-center justify-center text-3xl lg:text-4xl text-black shadow-[0_0_40px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform">
                     {MARKET_ICONS[order.market]}
                  </div>
                  <div>
                     <h2 className="text-3xl md:text-5xl font-black font-orbitron tracking-tighter text-white uppercase italic drop-shadow-lg leading-none mb-2">
                        {order.symbol}
                     </h2>
                     <p className="text-xs font-black uppercase text-slate-500 tracking-[0.3em] font-mono">
                        {order.exchange} / {order.country}
                     </p>
                  </div>
                </div>

                <div className="space-y-4 mb-10">
                   <div className="flex items-center gap-3">
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 w-24">Link Quality</span>
                     <div className="flex-1 h-3 bg-white/5 rounded overflow-hidden">
                        <motion.div className={`h-full ${systemTheme.fill}`} 
                                    initial={{ width: 0 }} 
                                    animate={{ width: `${signalStrength}%` }} />
                     </div>
                     <span className={`text-[10px] font-mono font-bold ${systemTheme.text}`}>{signalStrength.toFixed(0)}%</span>
                   </div>
                   
                   <div className="flex items-center gap-3">
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 w-24">Class ID</span>
                     <div className={`px-3 py-1 rounded border text-[9px] font-black tracking-widest uppercase ${isMasterZone ? classBadges.master : isCombatZone ? classBadges.combat : classBadges.sync}`}>
                        {isMasterZone ? 'S-CLASS ZENITH' : isCombatZone ? 'A-CLASS COMBAT' : 'STANDARD SYNC'}
                     </div>
                   </div>
                </div>
             </div>

             <div className="p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2.5rem] bg-black/40 border border-white/5 relative overflow-hidden group">
               <div className="flex justify-between items-end mb-8 relative z-10">
                 <div>
                   <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.4em] mb-2 flex items-center gap-2">
                      <PulseIcon /> Live Market Flux
                   </p>
                   <AnimatePresence mode="wait">
                     <motion.p
                        key={livePrice}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`text-4xl font-black font-orbitron tracking-tighter tabular-nums ${priceDirection === 'up' ? 'text-emerald-400' : priceDirection === 'down' ? 'text-rose-400' : 'text-white'}`}
                     >
                        {livePrice !== null ? livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '--'}
                     </motion.p>
                   </AnimatePresence>
                 </div>
                 <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    {order.exchange === 'SSE' ? 'CNY' : 'USDT'}
                 </span>
               </div>
               
               <div className="h-24 w-full relative z-10">
                 <Sparkline data={priceHistory} color={priceDirection === 'up' ? '#10b981' : priceDirection === 'down' ? '#f43f5e' : '#22d3ee'} />
               </div>
               
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay pointer-events-none" />
             </div>
          </div>

          {/* PANEL B: EXECUTION PARAMETERS */}
          <div className="w-full lg:w-1/3 border-r border-white/5 p-4 lg:p-8 flex flex-col justify-between bg-black/20">
             <div>
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.28em] lg:tracking-[0.5em] mb-8 flex items-center gap-2">
                   <ShieldCheck size={12}/> Execution Parameters
                </h3>
                
                <div className="mb-10">
                   <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.4em] mb-2">Risk Exposure (Notional)</p>
                   <p className={`text-4xl font-black font-orbitron italic tracking-tighter drop-shadow-[0_0_10px_currentColor] ${isMasterZone ? 'text-rose-400' : isCombatZone ? 'text-orange-400' : 'text-white'}`}>
                      ${order.notionalAmount.toLocaleString()} <span className="text-sm opacity-30 text-white font-sans">USDT</span>
                   </p>
                </div>

                <div className="mb-10">
                  <div className="flex justify-between items-end mb-4">
                     <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.4em]">Consensus Network</p>
                     <p className="text-[14px] font-black font-orbitron text-cyan-400">{committedCount} / {order.requiredFeeders} <span className="text-[8px] text-slate-600 ml-1">NODES VERIFIED</span></p>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                     {participants.map((participant, index) => (
                        <div key={participant.id} className="relative group">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className={`aspect-square rounded-xl border flex items-center justify-center text-[9px] font-black transition-all ${
                              participant.status === 'COMMITTED'
                                ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                                : participant.status === 'VERIFYING'
                                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 animate-pulse'
                                  : 'bg-white/5 border-white/10 text-slate-600'
                            }`}
                          >
                            {participant.status === 'COMMITTED' ? 'OK' : index + 1}
                          </motion.div>
                        </div>
                     ))}
                  </div>
                </div>
             </div>

             <div>
                <div className="flex justify-between items-baseline mb-3">
                   <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.4em]">Sockets / Telemetry</p>
                   <p className="text-[8px] text-cyan-500/50 uppercase font-mono tracking-widest">REF TOLERANCE +/- {referenceWindow.tolerancePercent}%</p>
                </div>
                <div className="p-6 rounded-3xl bg-black/60 border border-white/5 font-mono text-[9px] text-slate-500 space-y-3 relative shadow-inner overflow-hidden h-48 flex flex-col justify-end">
                  <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-transparent z-10 pointer-events-none" />
                  {logLines.map((line, index) => (
                    <div key={`${line}-${index}`} className="flex gap-4 animate-in slide-in-from-left duration-300 items-start">
                      <span className="text-slate-700 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                      <span className={`${line.includes('ERR') ? 'text-rose-500' : line.includes('INTEL') ? 'text-purple-400' : line.includes('TICK') || line.includes('SCAN') ? 'text-emerald-400' : 'text-cyan-400'}`}>
                        {line}
                      </span>
                    </div>
                  ))}
                </div>
             </div>
          </div>

          {/* PANEL C: ACTION & PAYOUT */}
          <div className="w-full lg:w-1/3 p-4 lg:p-8 flex flex-col justify-between bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-900/10 via-black to-black">
             <div>
               <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.28em] lg:tracking-[0.5em] mb-10 flex items-center gap-2">
                  <Coins size={12}/> Reward Specification
               </h3>
               
               <div className="space-y-4 mb-10">
                 <div className="p-8 rounded-[2rem] bg-cyan-500/5 border border-cyan-500/20 flex flex-col shadow-inner backdrop-blur-sm">
                   <span className="text-[9px] font-black uppercase tracking-[0.4em] text-cyan-500 mb-2">Guaranteed Yield</span>
                   <div className="flex items-baseline gap-3">
                     <p className="text-5xl font-black font-orbitron text-cyan-400 tracking-tighter italic glow-cyan">
                        {order.rewardAmount}
                     </p>
                     <p className="text-[10px] font-black text-slate-500 tracking-widest">FEED</p>
                   </div>
                 </div>
                 
                 <div className="p-6 rounded-[2rem] bg-amber-500/5 border border-amber-500/20 flex items-center justify-between shadow-inner">
                   <span className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-500">Exp. Points</span>
                   <div className="flex items-baseline gap-2">
                     <p className="text-2xl font-black font-orbitron text-amber-400 italic glow-amber">+25</p>
                     <p className="text-[8px] font-black text-slate-500">XP</p>
                   </div>
                 </div>
               </div>

               <div>
                 <p className="text-[10px] text-slate-600 uppercase font-black tracking-[0.4em] mb-4 flex items-center gap-2">
                   <Clock size={12}/> Signal Lifespan
                 </p>
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center pointer-events-none">
                       <ScanLine className={`w-5 h-5 ${order.timeRemaining < 30 ? 'text-rose-500 animate-ping' : 'text-slate-400'}`} />
                    </div>
                    <p className={`text-4xl font-black font-orbitron italic tabular-nums tracking-tighter ${order.timeRemaining < 30 ? 'text-rose-500' : 'text-white'}`}>
                      {Math.floor((order.timeRemaining || 0) / 60)}:{(order.timeRemaining ? order.timeRemaining % 60 : 0).toString().padStart(2, '0')}
                    </p>
                 </div>
               </div>
             </div>

             <div className="fixed lg:static inset-x-0 bottom-0 z-30 mt-12 space-y-3 lg:space-y-4 bg-black/90 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-0 border-t border-white/10 lg:border-0 px-4 pt-3 safe-bottom-bar lg:px-0 lg:py-0">
               <motion.button
                 disabled={order.status === OrderStatus.EXPIRED || order.status === OrderStatus.SETTLED}
                 whileHover={order.status === OrderStatus.OPEN ? { scale: 1.02, y: -2 } : {}}
                 whileTap={order.status === OrderStatus.OPEN ? { scale: 0.98 } : {}}
                 onClick={() => onGrab(order.orderId)}
                 data-testid="order-detail-engage"
                 className={`w-full min-h-[56px] py-4 lg:py-8 text-lg lg:text-2xl font-black font-orbitron uppercase italic rounded-[1.25rem] lg:rounded-[2rem] transition-all shadow-2xl relative overflow-hidden group ${
                   order.status === OrderStatus.OPEN
                     ? 'bg-cyan-500 text-black shadow-[0_0_40px_rgba(34,211,238,0.4)]'
                     : 'bg-black border border-white/10 text-slate-600 cursor-not-allowed'
                 }`}
               >
                 {order.status === OrderStatus.OPEN && (
                    <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out skew-x-12" />
                 )}
                 <span className="relative z-10 flex items-center justify-center gap-3">
                   {order.status === OrderStatus.OPEN ? <Rocket size={24}/> : <ShieldAlert size={24}/>}
                   {order.status === OrderStatus.OPEN ? 'ENGAGE DIRECTIVE' : `MISSION ${order.status}`}
                 </span>
               </motion.button>
               
               <button onClick={onClose} className="w-full text-center py-2 lg:py-4 text-slate-500 font-black hover:text-white transition-colors text-[9px] uppercase tracking-[0.28em] lg:tracking-[0.5em]">
                 Abort Briefing
               </button>
             </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
};

const PulseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

export default OrderDetailModal;
