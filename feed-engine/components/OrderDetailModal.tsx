import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FeedOrder, OrderStatus, MarketType } from '../types';
import { MARKET_ICONS, STATUS_CONFIG, getReferenceData } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';

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

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 400;
  const height = 60;
  const points = data.map((point, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - ((point - min) / range) * height,
  }));
  const pathData = `M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id="detail-chart-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="3"
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

  const referenceWindow = useMemo(() => {
    const reference = getReferenceData(order.symbol);
    const isMasterZone = order.notionalAmount >= 1000000;
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
  }, [order.symbol, order.market, order.notionalAmount]);

  useEffect(() => {
    const isCrypto = order.market === MarketType.CRYPTO;
    setLogLines([
      '[AUTH] Protocol Handshake: Node Soph-71C Authenticated',
      `[LINK] Synchronizing with ${order.exchange} Cross-Chain Relay...`,
      `[ADDR] Monitoring subscription: ${order.symbol}/USDT`,
    ]);

    const updateLogs = (message: string) => {
      setLogLines((previous) => [...previous.slice(-8), message]);
    };

    if (isCrypto) {
      const cleanSymbol = order.symbol.replace('/', '').toLowerCase();
      const wsUrl = `wss://stream.binance.com:9443/ws/${cleanSymbol}@trade`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        updateLogs('[NET] WebSocket Tunnel Active: Binance Real-time Stream');
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
        updateLogs(`[DATA] Tick Received: ${nextPrice.toFixed(2)} | Qty: ${parseFloat(data.q).toFixed(4)}`);
        setSignalStrength((previous) => Math.max(85, Math.min(99, previous + (Math.random() - 0.5) * 4)));
      };

      wsRef.current.onerror = () => {
        updateLogs('[ERR] Signal Interference Detected. Activating Failover...');
      };
    } else {
      const tickerInterval = window.setInterval(() => {
        const basePrice = lastPriceRef.current || referenceWindow.reference;
        const volatility = order.notionalAmount > 1000000 ? 0.0001 : 0.0005;
        const nextPrice = basePrice + basePrice * volatility * (Math.random() - 0.5);

        setPriceDirection(nextPrice > basePrice ? 'up' : 'down');
        setLivePrice(nextPrice);
        setPriceHistory((previous) => [...previous.slice(-29), nextPrice]);
        lastPriceRef.current = nextPrice;

        const type = Math.random() > 0.8 ? 'PUSH' : 'SCAN';
        updateLogs(`[${type}] Local Node Proxy: ${nextPrice.toFixed(4)}`);
        setSignalStrength((previous) => Math.max(80, Math.min(98, previous + (Math.random() - 0.5) * 5)));
      }, 1000 + Math.random() * 500);

      return () => window.clearInterval(tickerInterval);
    }

    return () => {
      wsRef.current?.close();
    };
  }, [order.symbol, order.market, order.exchange, order.notionalAmount, referenceWindow.reference]);

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
    <div data-testid="order-detail-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 backdrop-blur-3xl p-4 lg:p-8">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-7xl glass-panel rounded-[4rem] overflow-hidden shadow-[0_0_250px_rgba(0,0,0,1)] border border-white/5 flex flex-col lg:flex-row min-h-[850px] max-h-[95vh]"
      >
        <button
          onClick={onClose}
          className="absolute top-10 right-10 z-50 w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all border border-white/10"
          aria-label="Close detail modal"
        >
          <span className="text-white">X</span>
        </button>

        <div className="flex-1 p-8 lg:p-14 space-y-12 border-r border-white/5 bg-[#08090B] overflow-y-auto custom-scrollbar">
          <div className="space-y-8">
            <div className="flex items-start gap-10">
              <motion.div whileHover={{ rotate: 10, scale: 1.1 }} className="w-32 h-32 rounded-[3rem] bg-white flex items-center justify-center text-4xl font-black font-orbitron shadow-2xl shrink-0">
                {MARKET_ICONS[order.market]}
              </motion.div>
              <div className="space-y-4 flex-1">
                <div className="flex flex-wrap items-center gap-6">
                  <h2 className="text-6xl font-black font-orbitron tracking-tighter text-white italic uppercase leading-none">{order.symbol}</h2>
                  <div className={`px-5 py-2 rounded-2xl border flex items-center gap-3 ${currentStatus.color} shadow-lg backdrop-blur-md`}>
                    <span className="text-[11px] font-black font-orbitron">{currentStatus.icon}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{currentStatus.label}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-10">
                  <p className="text-slate-500 uppercase tracking-[0.6em] text-[10px] font-black">{order.exchange} PROTOCOL // {order.country}</p>

                  <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/5">
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                    />
                    <span className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">{signalStrength.toFixed(0)}% {t.orderDetail.sigStrength}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="p-10 rounded-[3.5rem] bg-white/[0.02] border border-white/5 relative group overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 blur-[60px]" />
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-6">{t.orderDetail.liveMarketFlux}</p>
              <div className="space-y-2 h-20">
                <Sparkline data={priceHistory} color={priceDirection === 'up' ? '#10b981' : priceDirection === 'down' ? '#f43f5e' : '#22d3ee'} />
              </div>
              <div className="mt-8 flex items-baseline gap-4">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={livePrice}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-5xl font-black font-orbitron tracking-tighter tabular-nums ${priceDirection === 'up' ? 'text-emerald-400' : priceDirection === 'down' ? 'text-rose-400' : 'text-white'}`}
                  >
                    {livePrice !== null ? livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '--'}
                  </motion.span>
                </AnimatePresence>
                <span className="text-xs text-slate-600 font-bold uppercase tracking-widest">{order.exchange === 'SSE' ? 'CNY' : 'USDT'}</span>
              </div>
            </div>

            <div className="p-10 rounded-[3.5rem] bg-white/[0.02] border border-white/5 flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-4">{t.orderDetail.riskExposure}</p>
                <p className="text-4xl font-black font-orbitron text-white tracking-tighter italic">
                  ${order.notionalAmount.toLocaleString()} <span className="text-lg opacity-20">USDT</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{t.orderDetail.masterTierCoverage}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.6em]">{t.orderDetail.consensusTelemetry}</h3>
              <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest">
                Reference Window: +/-{referenceWindow.tolerancePercent}%
              </span>
            </div>
            <div className="p-10 rounded-[3rem] bg-black/60 border border-white/5 font-mono text-[11px] text-slate-500 space-y-2.5 relative shadow-inner overflow-hidden h-60 flex flex-col justify-end">
              <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-transparent z-10 pointer-events-none" />
              {logLines.map((line, index) => (
                <div key={`${line}-${index}`} className="flex gap-6 animate-in slide-in-from-left duration-300">
                  <span className="text-slate-800 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                  <span className={line.includes('ERR') ? 'text-rose-500' : line.includes('NET') ? 'text-cyan-400' : line.includes('DATA') ? 'text-emerald-400' : 'text-slate-400'}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[480px] p-8 lg:p-14 flex flex-col justify-between bg-[#0B0D0F] relative">
          <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-cyan-500/[0.05] to-transparent pointer-events-none" />

          <div className="space-y-16 relative z-10">
            <div className="space-y-10">
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.orderDetail.consensusThreshold}</h3>
                  <p className="text-3xl font-black font-orbitron text-white italic tracking-tighter">{order.consensusThreshold} SIGS</p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-black font-orbitron text-cyan-400 tracking-tighter">{committedCount}/{order.requiredFeeders}</p>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{t.orderDetail.nodesCommitted}</p>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-4">
                {participants.map((participant, index) => (
                  <div key={participant.id} className="relative group" title={`${participant.id} // ${participant.latency} // ${participant.reliability.toFixed(1)}%`}>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className={`aspect-square rounded-2xl border flex items-center justify-center text-[10px] font-black transition-all duration-500 ${
                        participant.status === 'COMMITTED'
                          ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_25px_rgba(34,211,238,0.4)]'
                          : participant.status === 'VERIFYING'
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 animate-pulse'
                            : 'bg-white/5 border-white/5 text-slate-800'
                      }`}
                    >
                      {participant.status === 'COMMITTED' ? 'OK' : index + 1}
                    </motion.div>
                  </div>
                ))}
              </div>

              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(committedCount / order.requiredFeeders) * 100}%` }}
                  className="h-full bg-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.6)]"
                />
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.orderDetail.pendingBounties}</h3>
              <div className="space-y-4">
                <div className="p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <span className="text-2xl font-black font-orbitron text-cyan-300">FEED</span>
                    <div>
                      <p className="text-2xl font-black font-orbitron text-cyan-400">{order.rewardAmount}</p>
                      <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{t.orderDetail.feedTokens}</p>
                    </div>
                  </div>
                </div>
                <div className="p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <span className="text-2xl font-black font-orbitron text-amber-300">XP</span>
                    <div>
                      <p className="text-2xl font-black font-orbitron text-amber-400">+25</p>
                      <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{t.orderDetail.rankExperience}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 space-y-10 relative z-10">
            <div className="flex justify-between items-center bg-black/40 p-6 rounded-[2rem] border border-white/5">
              <div className="space-y-1">
                <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{t.orderDetail.signalLifespan}</p>
                <p className="text-2xl font-black font-orbitron text-rose-500 italic tracking-tighter tabular-nums">
                  {Math.floor(order.timeRemaining / 60)}:{(order.timeRemaining % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{t.orderDetail.missionTier}</p>
                <p className="text-[11px] font-black font-orbitron text-slate-400 uppercase italic">{t.orderDetail.classAAccess}</p>
              </div>
            </div>

            <div className="space-y-4">
              <motion.button
                disabled={order.status !== OrderStatus.OPEN}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onGrab(order.orderId)}
                data-testid="order-detail-engage"
                className={`w-full py-8 rounded-[2.5rem] font-black font-orbitron text-2xl transition-all uppercase italic shadow-2xl ${
                  order.status === OrderStatus.OPEN
                    ? 'bg-cyan-500 text-black shadow-cyan-500/30'
                    : 'bg-slate-900 text-slate-700 cursor-not-allowed border border-white/5'
                }`}
              >
                {order.status === OrderStatus.OPEN ? t.orderDetail.engageDirective : t.orderDetail.protocolBusy}
              </motion.button>
              <button onClick={onClose} className="w-full text-slate-700 font-black hover:text-slate-400 transition-colors text-[10px] uppercase tracking-[0.6em] italic">
                {t.orderDetail.abortBriefing}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OrderDetailModal;
