import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FeedOrder } from '../types';
import { getReferenceData } from '../constants';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useTranslation } from '../i18n';
import { useWallet } from '../hooks';
import { getAuthToken, getWalletAddress } from '../services/api';
import { useAuthStore } from '../store';
import { 
  Terminal, Lock, Key, Target, Activity, CheckCircle2, CornerDownRight, 
  Hexagon, Flame, ArrowRight, ShieldAlert, Cpu
} from 'lucide-react';

interface FeedModalProps {
  order: FeedOrder;
  onClose: () => void;
  onComplete: (xp: number, feed: number) => void;
}

type Step = 'input' | 'commit' | 'reveal' | 'consensus' | 'success' | 'report' | 'evidence';

/* Tactical Sparks instead of Party Confetti */
const SuccessParticle: React.FC<{ index: number }> = ({ index }) => {
  const type = index % 5;
  const angle = (index * (360 / 50)) + (Math.random() * 10);
  const distance = 150 + Math.random() * 500;
  const x = Math.cos(angle * (Math.PI / 180)) * distance;
  const y = Math.sin(angle * (Math.PI / 180)) * distance;
  const color = index % 3 === 0 ? '#22d3ee' : index % 3 === 1 ? '#fbbf24' : '#10b981';

  return (
    <motion.div
      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
      animate={{
        x, y,
        scale: [0, 2.5, 0],
        opacity: [1, 1, 0],
        rotate: 360 + Math.random() * 360
      }}
      transition={{
        duration: 1.5 + Math.random() * 2,
        ease: [0.23, 1, 0.32, 1],
        delay: index * 0.015
      }}
      className={`absolute z-30 pointer-events-none ${type === 0 ? 'w-3 h-3 rounded-sm' : type === 1 ? 'w-2 h-2 rounded-full' : 'w-1 h-6'}`}
      style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}` }}
    />
  );
};

const RewardCard: React.FC<{
  title: string; value: number | string; unit: string; icon: React.ReactNode; colorTitle: string; colorVal: string; delay: number;
}> = ({ title, value, unit, icon, colorTitle, colorVal, delay }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 20 }}
      className="relative flex-1 group"
    >
      <div className="absolute -inset-0.5 bg-gradient-to-br from-white/10 to-transparent rounded-[2.5rem] blur opacity-50 group-hover:opacity-100 transition duration-500"></div>
      <div className="relative h-full bg-black border border-white/10 rounded-[1.5rem] lg:rounded-[2.5rem] p-5 lg:p-10 flex flex-col items-center justify-center overflow-hidden shadow-2xl">
        <div className={`text-4xl mb-4 ${colorTitle} opacity-50`}>{icon}</div>
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mb-2 z-10">{title}</p>
        <div className="text-center z-10">
          <h4 className={`text-3xl lg:text-5xl font-black font-orbitron tracking-tighter italic ${colorVal}`}>
            {value}
          </h4>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">{unit}</p>
        </div>
      </div>
    </motion.div>
  );
};

const FeedModal: React.FC<FeedModalProps> = ({ order, onClose, onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('input');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  
  const [salt, setSalt] = useState('');
  const [priceHash, setPriceHash] = useState('');
  const [reportReason, setReportReason] = useState('');
  
  const wallet = useWallet();
  const authAddress = useAuthStore((s) => s.address);
  const authToken = useAuthStore((s) => s.token);

  // Success stats animation
  const [displayedXP, setDisplayedXP] = useState(0);
  const [displayedFEED, setDisplayedFEED] = useState(0);

  const range = useMemo(() => {
    const ref = getReferenceData(order.symbol);
    const tolerance = order.notionalAmount >= 1000000 ? 0.05 : 0.20;
    return {
      ref, min: ref * (1 - tolerance), max: ref * (1 + tolerance),
      tolerancePercent: (tolerance * 100).toFixed(0)
    };
  }, [order.symbol, order.notionalAmount]);

  const phaseItems = [
    { key: 'input', label: 'Input' },
    { key: 'commit', label: 'Commit' },
    { key: 'reveal', label: 'Reveal' },
    { key: 'consensus', label: 'Consensus' },
    { key: 'success', label: 'Reward' }
  ];
  const phaseIndex = phaseItems.findIndex((item) => item.key === step);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const walletAddr = wallet.address || authAddress || getWalletAddress();
    if (!walletAddr) {
      setError('System restricted. Wallet not connected.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    const val = parseFloat(price);
    if (isNaN(val) || val < range.min || val > range.max) {
      setError(`Critical Deviation: Must stay within +/-${range.tolerancePercent}% of ${range.ref.toFixed(2)} (${range.min.toFixed(2)} - ${range.max.toFixed(2)})`);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    const newSalt = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    setSalt(newSalt);
    const hash = wallet.computePriceHash ? wallet.computePriceHash(val, newSalt) : `0x${Math.random().toString(16).slice(2)}`;
    setPriceHash(hash);

    setStep('commit');

    try {
      const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-wallet-address': walletAddr };
      const jwtToken = authToken || getAuthToken();
      if (jwtToken) headers['Authorization'] = `Bearer ${jwtToken}`;

      // Simulate Hash Network Latency
      await new Promise(r => setTimeout(r, 1500));
      const commitRes = await fetch(`${API_BASE}/orders/${order.id}/submit`, {
        method: 'POST', headers, body: JSON.stringify({ priceHash: hash }),
      });
      if (!commitRes.ok) throw new Error('Network rejected hash commitment');

      setStep('reveal');
      await new Promise(r => setTimeout(r, 1500));

      const revealRes = await fetch(`${API_BASE}/orders/${order.id}/reveal`, {
        method: 'POST', headers, body: JSON.stringify({ price: val.toString(), salt: newSalt }),
      });
      if (!revealRes.ok) throw new Error('Reveal verification failed');

      setStep('consensus');
      // Simulate Consensus Verification
      await new Promise(r => setTimeout(r, 2500));
      
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Data stream corrupted');
      setStep('input');
    }
  };

  const handleReturnToHQ = () => {
    onComplete(25, order.rewardAmount);
  };

  useEffect(() => {
    if (step === 'success') {
      const targetXP = 25;
      const targetFEED = order.rewardAmount;
      const startTime = performance.now();
      const duration = 2500;

      const animateTicker = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setDisplayedXP(Math.floor(targetXP * easeOutExpo(progress)));
        setDisplayedFEED(Math.floor(targetFEED * easeOutExpo(progress)));
        if (progress < 1) requestAnimationFrame(animateTicker);
      };
      requestAnimationFrame(animateTicker);
    }
  }, [step, order.rewardAmount]);

  // Determine core animation properties based on execution state
  let coreColor = 'border-cyan-500/10';
  let coreGlow = 'text-cyan-500';
  let coreText = 'AWAITING';
  let coreIcon = <Cpu size={40} className="animate-pulse" />;
  if (step === 'commit') {
    coreColor = 'border-amber-500/50 border-t-transparent';
    coreGlow = 'text-amber-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.8)]';
    coreText = 'HASH COMPILED';
    coreIcon = <Lock size={40} />;
  } else if (step === 'reveal') {
    coreColor = 'border-emerald-500/50 border-t-transparent';
    coreGlow = 'text-emerald-500 drop-shadow-[0_0_20px_rgba(16,185,129,0.8)]';
    coreText = 'SALT VERIFIED';
    coreIcon = <Key size={40} />;
  } else if (step === 'consensus') {
    coreColor = 'border-cyan-500/80 border-b-transparent border-t-transparent';
    coreGlow = 'text-cyan-400 drop-shadow-[0_0_30px_rgba(34,211,238,1)]';
    coreText = 'SYNCING';
    coreIcon = <Activity size={40} className="animate-bounce" />;
  }

  return (
    <div data-testid="feed-modal" className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-4 bg-black/95 backdrop-blur-3xl">
      <AnimatePresence>
        {step === 'success' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {[...Array(50)].map((_, i) => <SuccessParticle key={i} index={i} />)}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : { scale: 1, opacity: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`relative w-full h-[100dvh] lg:h-auto lg:max-h-[94vh] lg:max-w-5xl glass-panel text-white overflow-hidden shadow-[0_0_150px_rgba(0,0,0,0.8)] border-0 lg:border ${step === 'success' ? 'border-emerald-500/30 bg-black/80' : 'border-white/5 bg-[#07090C]'} flex flex-col min-h-0 lg:min-h-[500px] 2xl:min-h-[600px] rounded-none lg:rounded-[2rem] 2xl:rounded-[3rem] z-10`}
      >
        {/* Top Intelligence Strip */}
        <div className="sticky top-0 z-30 flex flex-col gap-3 py-3 lg:py-4 px-4 lg:px-8 border-b border-white/5 bg-black/80 backdrop-blur-xl">
          <div className="flex justify-between items-center">
           <div className="flex items-center gap-3 min-w-0">
              <Terminal size={14} className="text-cyan-500"/>
              <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.18em] lg:tracking-[0.4em] text-slate-500 truncate">
                Data Uplink: {order.symbol} // {order.exchange}
              </span>
           </div>
           {step !== 'success' && (
             <button onClick={onClose} className="min-h-[44px] px-3 text-slate-500 hover:text-rose-400 uppercase tracking-widest text-[9px] font-black transition-colors">
               ABORT UPLINK
             </button>
           )}
          </div>
          <div className="grid grid-cols-5 gap-1.5 lg:hidden">
            {phaseItems.map((item, index) => {
              const isActive = index === phaseIndex;
              const isDone = phaseIndex > index;
              return (
                <div key={item.key} className={`rounded-lg border px-1 py-1.5 text-center ${isActive ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300' : isDone ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/[0.03] text-slate-600'}`}>
                  <p className="text-[7px] font-black uppercase tracking-tight">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          
          {/* ============================================================== */}
          {/* PHASE 1: TARGET INPUT                                          */}
          {/* ============================================================== */}
          {step === 'input' && (
            <motion.div key="input" className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-4 safe-modal-padding lg:p-8 2xl:p-12">
              <div className="text-center space-y-2 mb-6 2xl:mb-12">
                <h2 className="text-3xl lg:text-5xl 2xl:text-6xl font-black font-orbitron text-white uppercase italic tracking-tighter drop-shadow-md">
                  TRANSMIT PAYLOAD
                </h2>
                <p className="text-slate-500 font-mono text-[10px] lg:text-xs tracking-widest leading-relaxed">
                  Target Identity: {order.symbol} <span className="mx-2">|</span> Valid Reference Axis: <span className="text-cyan-400">${range.ref}</span>
                </p>
              </div>

              <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-center">
                <form onSubmit={handleSubmit} className="space-y-6 2xl:space-y-10">
                  <div className="relative group">
                    {/* Targeting Brackets */}
                    <div className="absolute -top-4 -left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-500/50 transition-all group-focus-within:border-cyan-400 group-focus-within:-top-6 group-focus-within:-left-6" />
                    <div className="absolute -top-4 -right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-500/50 transition-all group-focus-within:border-cyan-400 group-focus-within:-top-6 group-focus-within:-right-6" />
                    <div className="absolute -bottom-4 -left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-500/50 transition-all group-focus-within:border-cyan-400 group-focus-within:-bottom-6 group-focus-within:-left-6" />
                    <div className="absolute -bottom-4 -right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-500/50 transition-all group-focus-within:border-cyan-400 group-focus-within:-bottom-6 group-focus-within:-right-6" />
                    
                    <div className="flex items-center gap-3 lg:gap-4 bg-black/60 border border-white/5 px-4 lg:px-6 py-4 2xl:px-8 2xl:py-6 rounded-2xl lg:rounded-none">
                      <CornerDownRight className="text-cyan-500/50 hidden sm:block" size={32} />
                      <input
                        type="number" step="0.0001" inputMode="decimal" autoFocus value={price}
                        onChange={(e) => {
                           setPrice(e.target.value);
                           if (error) setError(null);
                        }}
                        placeholder="INPUT.VALUE"
                        className="w-full bg-transparent text-4xl lg:text-5xl 2xl:text-7xl font-orbitron text-cyan-400 placeholder:text-cyan-900/30 focus:outline-none tabular-nums tracking-tighter"
                        required
                      />
                      <span className="text-slate-700 font-black text-xl 2xl:text-2xl tracking-widest">USDT</span>
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 text-rose-500 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg overflow-hidden">
                        <ShieldAlert size={18}/>
                        <span className="text-[10px] font-black uppercase tracking-widest">{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="fixed lg:static inset-x-0 bottom-0 z-40 flex gap-3 lg:gap-4 2xl:gap-6 mt-8 2xl:mt-12 bg-black/90 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-0 border-t border-white/10 lg:border-0 px-4 pt-4 safe-bottom-bar lg:p-0">
                    <button type="button" onClick={() => setStep('report')} className="min-h-[52px] px-4 lg:px-6 2xl:px-10 py-3 lg:py-4 2xl:py-6 border border-white/10 text-slate-500 hover:text-white hover:bg-white/5 font-black text-[9px] lg:text-[10px] uppercase tracking-[0.18em] lg:tracking-[0.3em] transition-all flex items-center justify-center gap-2 relative group overflow-hidden rounded-2xl lg:rounded-none">
                      <Target size={14} className="group-hover:text-rose-400 transition-colors"/>
                      FLAG ANOMALY
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />
                    </button>
                    
                    <button type="submit" className="min-h-[52px] flex-1 py-3 lg:py-4 2xl:py-6 bg-cyan-500 hover:bg-cyan-400 text-black font-black font-orbitron text-base lg:text-xl 2xl:text-2xl uppercase transition-all shadow-[0_0_30px_rgba(34,211,238,0.2)] hover:shadow-[0_0_50px_rgba(34,211,238,0.4)] flex items-center justify-center gap-3 italic rounded-2xl lg:rounded-none">
                      COMPUTE HASH <ArrowRight size={24} />
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* PHASE 2: EXECUTION PIPELINE                                    */}
          {/* ============================================================== */}
          {(step === 'commit' || step === 'reveal' || step === 'consensus') && (
            <motion.div key="execution" className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 text-center relative overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/40 via-black to-black">
              {/* Holographic Core */}
              <div className="relative mb-10 lg:mb-16 z-20">
                <div className="w-36 h-36 lg:w-48 lg:h-48 border-[6px] border-white/5 rounded-full flex items-center justify-center relative">
                  <motion.div
                    animate={{ rotate: step === 'reveal' ? -360 : 360 }} 
                    transition={{ duration: step === 'consensus' ? 0.5 : 1.5, repeat: Infinity, ease: "linear" }}
                    className={`absolute inset-[-6px] rounded-full border-[6px] ${coreColor}`}
                  />
                  <div className={`relative z-10 ${coreGlow}`}>{coreIcon}</div>
                </div>
              </div>

              <div className="space-y-6 z-20 max-w-xl">
                <h3 className={`text-3xl lg:text-5xl font-black font-orbitron italic tracking-tighter uppercase ${coreGlow}`}>
                  {coreText}
                </h3>
                
                <div className="p-6 bg-black/60 border border-white/5 rounded-xl font-mono text-xs w-full min-h-24">
                  <AnimatePresence mode="wait">
                    {step === 'commit' && (
                      <motion.div key="msg-commit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                        <span className="text-slate-500 tracking-widest uppercase text-[10px]">Encrypting payload into core registry...</span>
                        <span className="text-amber-500/70 break-all">{priceHash || 'GENERATING_0x...'}</span>
                      </motion.div>
                    )}
                    {step === 'reveal' && (
                      <motion.div key="msg-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                        <span className="text-slate-500 tracking-widest uppercase text-[10px]">Broadcasting plaintext parameters...</span>
                        <span className="text-emerald-500/70">Payload: {price} USDT | Cryptosalt Validated</span>
                      </motion.div>
                    )}
                    {step === 'consensus' && (
                      <motion.div key="msg-consensus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                         <span className="text-slate-500 tracking-widest uppercase text-[10px]">Awaiting distributed signature threshold...</span>
                         <span className="text-cyan-500 animate-pulse tracking-widest">ESTABLISHING QUORUM</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Grid Background */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none" />
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* PHASE 3: SUCCESS AFTER ACTION REPORT                           */}
          {/* ============================================================== */}
          {step === 'success' && (
            <motion.div key="success" className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-4 safe-modal-padding lg:p-8 2xl:p-12 bg-[#050A08] relative">
               <div className="absolute top-0 right-0 w-[400px] h-[400px] 2xl:w-[600px] 2xl:h-[600px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
               
               <div className="text-center mt-2 2xl:mt-4 mb-8 2xl:mb-16 relative z-10">
                 <motion.div
                   initial={{ scale: 0, rotate: -180 }}
                   animate={{ scale: 1, rotate: 0 }}
                   transition={{ type: "spring", damping: 15 }}
                   className="w-20 h-20 lg:w-24 lg:h-24 bg-emerald-500 rounded-2xl flex items-center justify-center text-4xl text-black mx-auto mb-6 lg:mb-8 shadow-[0_0_60px_rgba(16,185,129,0.4)]"
                 >
                   <CheckCircle2 size={48} strokeWidth={3} />
                 </motion.div>
                 <motion.h3 
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                    className="text-4xl md:text-6xl 2xl:text-7xl font-black font-orbitron text-white italic uppercase tracking-tighter drop-shadow-md mb-2"
                 >
                   DATA <span className="text-emerald-400">SECURED</span>
                 </motion.h3>
                 <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="text-emerald-500/50 uppercase tracking-[0.24em] lg:tracking-[0.5em] text-[10px] font-black"
                 >
                    Consensus Verified // Network Synchronized
                 </motion.p>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 2xl:gap-6 mb-8 2xl:mb-16 relative z-10">
                  <RewardCard title="ACCURACY" value="0.02%" unit="DEVIATION RATE" icon={<Target />} colorTitle="text-slate-500" colorVal="text-white" delay={0.6} />
                  <RewardCard title="INTEL YIELD" value={`+${displayedFEED}`} unit="FEED SECURED" icon={<Hexagon />} colorTitle="text-cyan-500" colorVal="text-cyan-400" delay={0.8} />
                  <RewardCard title="EXP GAINED" value={`+${displayedXP}`} unit="RANK POINTS" icon={<Flame />} colorTitle="text-amber-500" colorVal="text-amber-400" delay={1.0} />
               </div>

               <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }} className="fixed lg:static inset-x-0 bottom-0 z-40 mt-auto flex justify-center bg-black/90 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-0 border-t border-white/10 lg:border-0 px-4 pt-4 safe-bottom-bar lg:p-0">
                  <button 
                     onClick={handleReturnToHQ}
                     className="min-h-[56px] w-full md:w-auto px-8 lg:px-12 2xl:px-16 py-4 lg:py-6 2xl:py-8 rounded-[1.5rem] lg:rounded-[3rem] bg-white text-black font-black font-orbitron text-base lg:text-xl 2xl:text-2xl uppercase italic tracking-widest hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] transition-all flex items-center justify-center gap-4"
                  >
                     RETURN TO HQ <ArrowRight size={24}/>
                  </button>
               </motion.div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* REPORT ANOMALY & EVIDENCE LOGIC                                */}
          {/* ============================================================== */}
          {step === 'report' && (
            <motion.div key="report" className="flex-1 p-4 safe-modal-padding lg:p-8 2xl:p-12 overflow-y-auto custom-scrollbar">
              <div className="mb-4 2xl:mb-8">
                <h2 className="text-3xl 2xl:text-4xl font-black font-orbitron uppercase italic text-rose-400 tracking-tighter">FLAG ANOMALY</h2>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-2">Classify the integrity failure</p>
              </div>
              <div className="space-y-4">
                {[
                  { key: 'SUSPENSION', label: 'MARKET HALT', desc: 'The exchange has suspended asset trading.' },
                  { key: 'NO_DATA', label: 'SOURCE DOWN', desc: 'Local APIs cannot resolve the underlying price.' },
                  { key: 'INVALID_CODE', label: 'BAD SYMBOL', desc: 'Invalid contractual asset code given.' }
                ].map((reason) => (
                   <button 
                      key={reason.key} 
                      onClick={() => { setReportReason(reason.key); setStep('evidence'); }}
                      className="min-h-[72px] w-full text-left p-4 lg:p-6 border border-white/5 bg-white/5 hover:bg-rose-500/10 hover:border-rose-500/40 rounded-2xl transition-all cursor-pointer group"
                   >
                      <h4 className="font-black text-rose-400 text-lg group-hover:tracking-wider transition-all">{reason.label}</h4>
                      <p className="text-xs text-slate-400 mt-2">{reason.desc}</p>
                   </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'evidence' && (
            <motion.div key="evidence" className="flex-1 p-4 safe-modal-padding lg:p-8 2xl:p-12 overflow-y-auto custom-scrollbar flex flex-col justify-between">
              <div>
                <h2 className="text-3xl 2xl:text-4xl font-black font-orbitron uppercase italic text-rose-400 tracking-tighter mb-4 2xl:mb-8">ATTACH EVIDENCE</h2>
                <textarea
                  id="report-description"
                  rows={4}
                  placeholder="Insert tactical notes..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-white placeholder:text-slate-600 outline-none focus:border-rose-500 resize-none font-mono text-sm"
                />
              </div>
              <div className="fixed lg:static inset-x-0 bottom-0 z-40 flex gap-3 lg:gap-4 mt-6 2xl:mt-8 bg-black/90 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-0 border-t border-white/10 lg:border-0 px-4 pt-4 safe-bottom-bar lg:p-0">
                <button onClick={() => setStep('report')} className="min-h-[52px] px-5 lg:px-6 2xl:px-8 py-4 2xl:py-6 text-[10px] font-black tracking-widest uppercase border border-white/10 text-slate-400 hover:text-white rounded-[1.5rem] lg:rounded-[2rem]">CANCEL</button>
                <button onClick={() => onComplete(0,0)} className="min-h-[52px] flex-1 py-4 2xl:py-6 bg-rose-500 text-black font-black text-base lg:text-lg 2xl:text-xl italic rounded-[1.5rem] lg:rounded-[2rem] hover:bg-rose-400">SUBMIT FLAG</button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default FeedModal;
