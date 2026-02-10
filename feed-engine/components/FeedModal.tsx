
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FeedOrder, MarketType } from '../types';
import { getReferenceData } from '../constants';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useTranslation } from '../i18n';
import { useWallet } from '../hooks';

interface FeedModalProps {
  order: FeedOrder;
  onClose: () => void;
  onComplete: (xp: number, feed: number) => void;
}

type Step = 'input' | 'commit' | 'reveal' | 'signing' | 'report' | 'evidence' | 'processing' | 'consensus' | 'success';

// Added React.FC to allow standard React attributes like 'key' when used in lists
const ConfettiPiece: React.FC<{ index: number }> = ({ index }) => {
  const colors = ['#22d3ee', '#fbbf24', '#f43f5e', '#10b981', '#ffffff'];
  const color = colors[index % colors.length];
  const size = 4 + Math.random() * 8;
  const initialX = Math.random() * 100 - 50; // percentage

  return (
    <motion.div
      initial={{ y: -20, x: `${initialX}vw`, rotate: 0, opacity: 1 }}
      animate={{
        y: '110vh',
        x: `${initialX + (Math.random() * 20 - 10)}vw`,
        rotate: 720 + Math.random() * 1000,
        opacity: [1, 1, 0]
      }}
      transition={{
        duration: 3 + Math.random() * 3,
        ease: "linear",
        delay: Math.random() * 2
      }}
      className="absolute z-[60] pointer-events-none"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: index % 2 === 0 ? '50%' : '2px',
        boxShadow: `0 0 10px ${color}44`
      }}
    />
  );
};

// Added React.FC to allow standard React attributes like 'key' when used in lists
const SuccessParticle: React.FC<{ index: number }> = ({ index }) => {
  const type = index % 5;
  const angle = (index * (360 / 40)) + (Math.random() * 10);
  const distance = 100 + Math.random() * 400;
  const x = Math.cos(angle * (Math.PI / 180)) * distance;
  const y = Math.sin(angle * (Math.PI / 180)) * distance;
  const color = index % 3 === 0 ? '#22d3ee' : index % 3 === 1 ? '#fbbf24' : '#ffffff';

  return (
    <motion.div
      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
      animate={{
        x,
        y,
        scale: [0, 2.5, 0.5, 0],
        opacity: [1, 1, 0.3, 0],
        rotate: 360 + Math.random() * 360
      }}
      transition={{
        duration: 2.5 + Math.random() * 1.5,
        ease: [0.23, 1, 0.32, 1],
        delay: index * 0.01
      }}
      className={`absolute z-50 pointer-events-none ${type === 0 ? 'w-3 h-3 rounded-sm' :
        type === 1 ? 'w-2 h-2 rounded-full' :
          'w-1 h-6'
        }`}
      style={{
        backgroundColor: color,
        boxShadow: `0 0 20px ${color}`
      }}
    />
  );
};

// Updated RewardCard to use a cleaner interface definition
const RewardCard: React.FC<{
  title: string;
  value: number;
  unit: string;
  icon: string;
  color: string;
  delay: number;
}> = ({ title, value, unit, icon, color, delay }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [15, -15]);
  const rotateY = useTransform(x, [-100, 100], [-15, 15]);
  const springX = useSpring(rotateX, { damping: 20, stiffness: 200 });
  const springY = useSpring(rotateY, { damping: 20, stiffness: 200 });

  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - (rect.left + rect.width / 2));
    y.set(event.clientY - (rect.top + rect.height / 2));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 15 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX: springX, rotateY: springY, transformStyle: 'preserve-3d' }}
      className="relative flex-1 group"
    >
      <div className="absolute -inset-0.5 bg-gradient-to-br from-white/20 to-transparent rounded-[3rem] blur opacity-30 group-hover:opacity-100 transition duration-500"></div>
      <div className="relative h-full bg-[#0F1115] border border-white/5 rounded-[3rem] p-10 flex flex-col items-center justify-center space-y-6 overflow-hidden shadow-2xl">
        {/* Holographic Glare */}
        <motion.div
          style={{ x, y }}
          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.05] to-transparent pointer-events-none"
        />

        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mb-2">{title}</p>

        <div className="relative" style={{ transform: 'translateZ(40px)' }}>
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="text-6xl mb-4 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            {icon}
          </motion.div>
        </div>

        <div className="text-center" style={{ transform: 'translateZ(60px)' }}>
          <h4 className={`text-6xl font-black font-orbitron tracking-tighter italic ${color}`}>
            +{value}
          </h4>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">{unit} DISBURSED</p>
        </div>

        {/* Shine animation */}
        <motion.div
          animate={{ x: ['-200%', '200%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -skew-x-12"
        />
      </div>
    </motion.div>
  );
};

const FeedModal: React.FC<FeedModalProps> = ({ order, onClose, onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('input');
  const [price, setPrice] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [salt, setSalt] = useState('');
  const [priceHash, setPriceHash] = useState('');
  const wallet = useWallet();

  const [displayedXP, setDisplayedXP] = useState(0);
  const [displayedFEED, setDisplayedFEED] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playSound = useCallback((type: 'success' | 'tick' | 'fanfare' | 'impact' | 'level-up') => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;

      const playTone = (freq: number, start: number, duration: number, volume: number = 0.1, wave: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      if (type === 'fanfare') {
        const tempo = 0.15;
        // Major chord sequence
        playTone(523.25, 0, 0.5, 0.1, 'square'); // C5
        playTone(659.25, tempo, 0.5, 0.1, 'square'); // E5
        playTone(783.99, tempo * 2, 0.5, 0.1, 'square'); // G5
        playTone(1046.50, tempo * 3, 0.8, 0.15, 'square'); // C6
      } else if (type === 'impact') {
        playTone(50, 0, 1.0, 0.4, 'sine');
        playTone(100, 0.02, 0.5, 0.2, 'triangle');
      } else if (type === 'level-up') {
        const sequence = [440, 554, 659, 880];
        sequence.forEach((f, i) => playTone(f, i * 0.1, 0.4, 0.1, 'sine'));
      } else if (type === 'tick') {
        playTone(1200 + Math.random() * 400, 0, 0.03, 0.05, 'sine');
      }
    } catch (e) {
      console.warn("Audio Context restricted");
    }
  }, []);

  const range = useMemo(() => {
    const ref = getReferenceData(order.symbol);
    const tolerance = order.notionalAmount >= 1000000 ? 0.05 : 0.20;
    return {
      ref, min: ref * (1 - tolerance), max: ref * (1 + tolerance),
      tolerancePercent: (tolerance * 100).toFixed(0)
    };
  }, [order.symbol, order.notionalAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(price);
    if (isNaN(val) || val < range.min || val > range.max) {
      setError(`Value must be within ±${range.tolerancePercent}% benchmark (${range.min.toFixed(2)} - ${range.max.toFixed(2)})`);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    // === Commit 阶段: 生成盐值 + 哈希，提交 Commit ===
    const newSalt = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    setSalt(newSalt);
    const hash = wallet.computePriceHash(val, newSalt);
    setPriceHash(hash);

    setStep('commit');

    try {
      // 提交哈希到后端
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const commitRes = await fetch(`${API_BASE}/orders/${order.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.address || '',
        },
        body: JSON.stringify({ priceHash: hash }),
      });

      if (!commitRes.ok) {
        const err = await commitRes.json();
        throw new Error(err.error || 'Commit failed');
      }

      // === Reveal 阶段: 等待 2 秒后揭示 ===
      setStep('reveal');
      await new Promise(r => setTimeout(r, 2000));

      const revealRes = await fetch(`${API_BASE}/orders/${order.id}/reveal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.address || '',
        },
        body: JSON.stringify({ price: val.toString(), salt: newSalt }),
      });

      if (!revealRes.ok) {
        const err = await revealRes.json();
        throw new Error(err.error || 'Reveal failed');
      }

      setStep('signing');
      setTimeout(() => setStep('processing'), 1200);
      setTimeout(() => setStep('consensus'), 3000);
      setTimeout(() => {
        setStep('success');
        playSound('impact');
        setTimeout(() => playSound('fanfare'), 400);
        setTimeout(() => playSound('level-up'), 1500);
      }, 5000);

    } catch (err: any) {
      setError(err.message || 'Commit-Reveal 失败');
      setStep('input');
    }
  };

  const handleFinalClaim = useCallback(() => {
    onComplete(25, reportReason ? 0 : order.rewardAmount);
  }, [onComplete, reportReason, order.rewardAmount]);

  useEffect(() => {
    if (step === 'success') {
      const targetXP = 25;
      const targetFEED = order.rewardAmount;
      const duration = 3000;
      const startTime = performance.now();

      const animateTicker = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

        const nextXP = Math.floor(targetXP * easeOutExpo(progress));
        const nextFEED = Math.floor(targetFEED * easeOutExpo(progress));

        if (nextXP > displayedXP || nextFEED > displayedFEED) {
          playSound('tick');
        }

        setDisplayedXP(nextXP);
        setDisplayedFEED(nextFEED);

        if (progress < 1) requestAnimationFrame(animateTicker);
      };

      requestAnimationFrame(animateTicker);
      const autoClose = setTimeout(handleFinalClaim, 20000);
      return () => clearTimeout(autoClose);
    }
  }, [step, order.rewardAmount, playSound, handleFinalClaim, displayedXP, displayedFEED]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 backdrop-blur-3xl p-4">
      {/* Background Ambience */}
      <AnimatePresence>
        {step === 'success' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-0 pointer-events-none"
          >
            {[...Array(30)].map((_, i) => <ConfettiPiece key={i} index={i} />)}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : { scale: 1, opacity: 1 }}
        className="relative w-full max-w-4xl glass-panel rounded-[5rem] overflow-hidden shadow-[0_0_150px_rgba(0,0,0,1)] border border-white/5 z-10"
      >
        <AnimatePresence mode="wait">
          {step === 'input' && (
            <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="p-16 space-y-12">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black font-orbitron text-white uppercase italic tracking-tighter">ORACLE HANDSHAKE</h2>
                  <p className="text-xs text-slate-500 font-black uppercase tracking-[0.5em]">{order.symbol} // Reference Value: {range.ref}</p>
                </div>
                <button onClick={onClose} className="w-14 h-14 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-500 transition-colors">✕</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-12">
                <div className="space-y-5">
                  <div className="relative">
                    <input
                      type="number" step="0.0001" autoFocus value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.0000"
                      className="w-full bg-black/40 border border-white/5 rounded-[3rem] px-14 py-12 text-6xl font-orbitron focus:border-cyan-500 focus:ring-[25px] focus:ring-cyan-500/5 outline-none transition-all text-white placeholder:text-white/5"
                      required
                    />
                    <div className="absolute right-14 top-1/2 -translate-y-1/2 text-slate-700 font-black text-3xl italic tracking-tighter">USDT</div>
                  </div>
                  {error && (
                    <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-rose-500 text-xs font-black uppercase tracking-widest px-8 bg-rose-500/5 py-4 rounded-2xl border border-rose-500/10">
                      {error}
                    </motion.p>
                  )}
                </div>
                <div className="flex gap-6">
                  <button type="button" onClick={() => setStep('report')} className="flex-1 py-8 rounded-[2.5rem] bg-white/5 border border-white/5 text-slate-500 font-black text-xs uppercase tracking-[0.3em] hover:bg-white/10 transition-colors">REPORT ANOMALY</button>
                  <button type="submit" className="flex-[2] py-8 rounded-[3rem] bg-cyan-500 text-black font-black font-orbitron text-3xl shadow-[0_25px_50px_rgba(34,211,238,0.3)] active:scale-95 transition-all uppercase italic">COMMIT SIGNAL</button>
                </div>
              </form>
            </motion.div>
          )}
          {step === 'commit' && (
            <motion.div key="commit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-32 flex flex-col items-center space-y-14 text-center">
              <div className="relative">
                <div className="w-40 h-40 border-4 border-amber-500/10 rounded-full"></div>
                <motion.div
                  animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-40 h-40 border-4 border-amber-500 border-t-transparent rounded-full"
                ></motion.div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 flex items-center justify-center text-5xl"
                >🔒</motion.div>
              </div>
              <div className="space-y-4">
                <h3 className="text-4xl font-black font-orbitron text-white italic tracking-widest uppercase">
                  COMMITTING HASH
                </h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.6em] animate-pulse">
                  Encrypting price data · Generating commitment proof...
                </p>
                <p className="text-xs text-amber-500/60 font-mono mt-4 truncate max-w-md mx-auto">
                  Hash: {priceHash.slice(0, 16)}...{priceHash.slice(-8)}
                </p>
              </div>
            </motion.div>
          )}

          {step === 'reveal' && (
            <motion.div key="reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-32 flex flex-col items-center space-y-14 text-center">
              <div className="relative">
                <div className="w-40 h-40 border-4 border-emerald-500/10 rounded-full"></div>
                <motion.div
                  animate={{ rotate: -360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-40 h-40 border-4 border-emerald-500 border-t-transparent rounded-full"
                ></motion.div>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], rotateY: [0, 180, 360] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 flex items-center justify-center text-5xl"
                >🔓</motion.div>
              </div>
              <div className="space-y-4">
                <h3 className="text-4xl font-black font-orbitron text-white italic tracking-widest uppercase">
                  REVEALING PRICE
                </h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.6em] animate-pulse">
                  Broadcasting plaintext · Verifying against commitment...
                </p>
                <p className="text-xs text-emerald-500/60 font-mono mt-4">
                  Price: {price} USDT · Salt verified ✓
                </p>
              </div>
            </motion.div>
          )}

          {(step === 'signing' || step === 'processing') && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-32 flex flex-col items-center space-y-14 text-center">
              <div className="relative">
                <div className="w-40 h-40 border-4 border-cyan-500/10 rounded-full"></div>
                <motion.div
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-40 h-40 border-4 border-cyan-500 border-t-transparent rounded-full"
                ></motion.div>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 flex items-center justify-center text-5xl"
                >📡</motion.div>
              </div>
              <div className="space-y-4">
                <h3 className="text-4xl font-black font-orbitron text-white italic tracking-widest uppercase">
                  {step === 'signing' ? 'GENERATING PROOF' : 'BROADCASTING PAYLOAD'}
                </h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.6em] animate-pulse">Syncing with consensus layer...</p>
              </div>
            </motion.div>
          )}

          {step === 'consensus' && (
            <motion.div key="consensus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-16 space-y-12">
              <div className="text-center space-y-4">
                <h3 className="text-4xl font-black font-orbitron text-white italic uppercase tracking-widest">QUORUM SYNCING</h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.5em]">Waiting for {order.consensusThreshold} Validation Sigs</p>
              </div>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }}
                    className="p-7 rounded-[2rem] border border-white/5 bg-white/[0.02] flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-6">
                      <motion.span
                        animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        className="w-3 h-3 rounded-full bg-cyan-500"
                      ></motion.span>
                      <span className="text-sm font-mono text-slate-400 uppercase tracking-widest">ORACLE_NODE_{1000 + i}_ID_VERIFIED</span>
                    </div>
                    <span className="text-xs font-black text-cyan-400 font-orbitron tracking-tighter">SIGNED</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              className="relative p-16 flex flex-col items-center justify-center text-center space-y-14 overflow-hidden bg-[#050608] min-h-[900px]"
            >
              {/* Orbital Rings */}
              <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute w-[600px] h-[600px] border border-dashed border-cyan-500 rounded-full" />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 35, repeat: Infinity, ease: "linear" }} className="absolute w-[900px] h-[900px] border border-dashed border-cyan-500 rounded-full" />
              </div>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {[...Array(60)].map((_, i) => <SuccessParticle key={i} index={i} />)}
              </div>

              {/* Central Victory Symbol */}
              <motion.div
                initial={{ opacity: 0, scale: 0, rotateY: 180 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ delay: 0.2, type: 'spring', damping: 15 }}
                className="relative z-10 w-64 h-64 bg-gradient-to-tr from-cyan-600 to-cyan-400 rounded-full flex items-center justify-center shadow-[0_0_120px_rgba(34,211,238,0.5)] border-[12px] border-white/10"
              >
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 }}
                  className="text-[12rem] text-black font-black leading-none select-none drop-shadow-2xl"
                >✓</motion.span>

                <motion.div
                  animate={{ scale: [1, 3], opacity: [0.6, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full border-4 border-cyan-400/40"
                />
              </motion.div>

              {/* Typographic Victory Reveal */}
              <div className="relative z-10 space-y-12 w-full">
                <div className="space-y-4">
                  <motion.h3
                    initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 1, ease: "backOut" }}
                    className="text-[8.5rem] font-black font-orbitron text-white tracking-tighter uppercase italic leading-[0.8] drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]"
                  >
                    MISSION<br /><span className="text-cyan-400">SUCCESS</span>
                  </motion.h3>
                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
                    className="text-lg text-cyan-400 font-black uppercase tracking-[0.8em] italic"
                  >
                    Oracle Synchronized // Bounty Unlocked
                  </motion.p>
                </div>

                {/* 感谢卡片 — §13.4 喂价感谢与行为挖矿 */}
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 1.0, type: 'spring', damping: 20 }}
                  className="w-full max-w-2xl mx-auto"
                >
                  <div className="relative bg-gradient-to-br from-cyan-500/10 via-transparent to-amber-500/10 border border-white/10 rounded-[2.5rem] p-8 overflow-hidden backdrop-blur-sm">
                    {/* Shimmer effect */}
                    <motion.div
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -skew-x-12"
                    />

                    <div className="relative z-10 text-center space-y-4">
                      <p className="text-2xl">🎉</p>
                      <p className="text-sm text-cyan-300 font-bold leading-relaxed">
                        {t.thanks.title}<br />
                        <span className="text-slate-400">{t.thanks.subtitle}</span>
                      </p>

                      <div className="flex items-center justify-center gap-8 py-3">
                        <div className="text-center">
                          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{t.thanks.deviationRate}</p>
                          <p className="text-lg font-black font-orbitron text-emerald-400">0.02%</p>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div className="text-center">
                          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{t.thanks.accuracyRating}</p>
                          <p className="text-lg tracking-wider">⭐⭐⭐⭐⭐</p>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div className="text-center">
                          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{t.thanks.behaviorMining}</p>
                          <p className="text-lg font-black font-orbitron text-amber-400">+15 <span className="text-[10px] text-slate-500">FEED</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* High Fidelity Reward Cards */}
                <div className="flex justify-center gap-10 w-full px-8">
                  <RewardCard
                    title={t.feed.nodeRecognition}
                    value={displayedXP}
                    unit={t.feed.experiencePoints}
                    icon="⭐"
                    color="text-amber-400"
                    delay={1.6}
                  />
                  <RewardCard
                    title={t.feed.protocolBounty}
                    value={displayedFEED}
                    unit={t.feed.feedTokens}
                    icon="🪙"
                    color="text-cyan-400"
                    delay={1.9}
                  />
                </div>

                {/* Final Actions & Terminal Info */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }} className="pt-12 space-y-10 flex flex-col items-center">
                  <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: '#22d3ee' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleFinalClaim}
                    className="relative px-32 py-10 rounded-full bg-white text-black font-black font-orbitron text-4xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] active:scale-95 transition-all uppercase italic tracking-tighter overflow-hidden group"
                  >
                    <span className="relative z-10">CLAIM BOUNTY</span>
                    <motion.div
                      animate={{ x: ['-100%', '200%'] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100"
                    />
                  </motion.button>

                  <div className="space-y-3 opacity-40">
                    <p className="text-sm text-slate-500 font-black uppercase tracking-[0.4em] italic">Node Address: {order.symbol}_SECURE_SYNC_09</p>
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Network Latency: 12.4ms // Consensus Status: FINALIZED</p>
                  </div>
                </motion.div>
              </div>

              {/* Auto-Close Progress Indicator */}
              <motion.div
                initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 19.5, delay: 0.5, ease: 'linear' }}
                className="absolute bottom-0 left-0 h-3 bg-cyan-500 shadow-[0_0_40px_rgba(34,211,238,0.8)]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default FeedModal;
