import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useTranslation } from '../i18n/I18nContext';
import { Trophy, Target, Zap, Shield, Lock, Unlock, Hexagon, Radar, Star, Crown, Activity } from 'lucide-react';
import SystemLoader from './feedback/SystemLoader';
import SystemEmpty from './feedback/SystemEmpty';

interface Achievement {
    id: string;
    code: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    rarity: string;
    xpReward: number;
    feedReward: number;
    unlocked: boolean;
    unlockedAt?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
    ALL: <Activity size={16} />,
    MILESTONE: <Trophy size={16} />,
    PRECISION: <Target size={16} />,
    SPEED: <Zap size={16} />,
    SPECIAL: <Star size={16} />,
};

const rarityColors: Record<string, any> = {
    COMMON: { text: 'text-slate-300', border: 'border-slate-500/50', bg: 'bg-slate-500/10', glow: 'shadow-[0_0_20px_rgba(100,116,139,0.1)]' },
    RARE: { text: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10', glow: 'shadow-[0_0_20px_rgba(59,130,246,0.15)]' },
    EPIC: { text: 'text-fuchsia-400', border: 'border-fuchsia-500/50', bg: 'bg-fuchsia-500/10', glow: 'shadow-[0_0_20px_rgba(217,70,239,0.15)]' },
    LEGENDARY: { text: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-500/10', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]' },
};

const AchievementsView: React.FC = () => {
    const { t } = useTranslation();
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [stats, setStats] = useState({ total: 0, unlocked: 0, byCategory: {} as Record<string, number> });
    const [newlyUnlocked, setNewlyUnlocked] = useState<any[]>([]);
    const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
    const [error, setError] = useState('');

    const playUnlockSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
                osc.connect(gain).connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.1);
                osc.stop(ctx.currentTime + 1.0);
            });
        } catch {
            // Silently fail if Web Audio is restricted
        }
    }, []);

    useEffect(() => {
        if (showUnlockAnimation) playUnlockSound();
    }, [showUnlockAnimation, playUnlockSound]);

    const categories = useMemo(() => ([
        { key: 'ALL', label: t.achievements.allCategory, icon: categoryIcons.ALL },
        { key: 'MILESTONE', label: t.achievements.milestoneCategory, icon: categoryIcons.MILESTONE },
        { key: 'PRECISION', label: t.achievements.precisionCategory, icon: categoryIcons.PRECISION },
        { key: 'SPEED', label: t.achievements.speedCategory, icon: categoryIcons.SPEED },
        { key: 'SPECIAL', label: t.achievements.specialCategory, icon: categoryIcons.SPECIAL },
    ]), [t]);

    useEffect(() => {
        void loadAchievements();
    }, []);

    const loadAchievements = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await api.getMyAchievements();

            if (res.success) {
                const nextDocs = (res.achievements ?? []) as Achievement[];
                // Force a massive sorted structure: Legends first -> then unlocked -> locked
                const sorted = [...nextDocs].sort((a, b) => {
                   if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
                   const rval = { LEGENDARY: 4, EPIC: 3, RARE: 2, COMMON: 1 } as any;
                   return rval[b.rarity] - rval[a.rarity];
                });
                
                setAchievements(sorted);

                if (res.stats) {
                    setStats(res.stats);
                } else {
                    const byCategory = nextDocs.reduce<Record<string, number>>((acc, ach) => {
                        if (ach.unlocked) acc[ach.category] = (acc[ach.category] ?? 0) + 1;
                        return acc;
                    }, {});

                    setStats({
                        total: nextDocs.length,
                        unlocked: nextDocs.filter(a => a.unlocked).length,
                        byCategory,
                    });
                }
            }
        } catch (err: any) {
            console.error('Load achievements error:', err);
            setAchievements([]);
            setError(err.message || 'Failed to load logic core.');
        } finally {
            setLoading(false);
        }
    };

    const checkForNewAchievements = async () => {
        try {
            setError('');
            const res = await api.checkAchievements();
            if (res.success && res.newlyUnlocked && res.newlyUnlocked.length > 0) {
                setNewlyUnlocked(res.newlyUnlocked);
                setShowUnlockAnimation(true);
                await loadAchievements();
            }
        } catch (err: any) {
            console.error('Sync error:', err);
            setError(err.message || 'Registry sync failed.');
        }
    };

    const filteredAchievements = selectedCategory === 'ALL'
        ? achievements
        : achievements.filter((a) => a.category === selectedCategory);

    const completionRate = stats.total > 0 ? (stats.unlocked / stats.total) * 100 : 0;
    const cir = 2 * Math.PI * 120; // radius 120
    const strokeOffset = cir - (completionRate / 100) * cir;

    const featuredUnlock = newlyUnlocked[0];
    const featuredAchievement = featuredUnlock?.achievement;

    return (
        <div className="space-y-6 lg:space-y-12 max-w-[90rem] mx-auto pb-24">
            
            {/* 1. MASTER COLLECTION CORE (HEADER & PROGRESS) */}
            <header className="relative w-full rounded-[1.75rem] lg:rounded-[4rem] p-4 sm:p-6 lg:p-16 border border-white/5 overflow-hidden shadow-2xl flex flex-col xl:flex-row justify-between items-center gap-6 lg:gap-12 bg-[#05070A] group">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-[0.03] pointer-events-none" />
                <div className="absolute -top-[50%] left-1/2 -translate-x-1/2 w-full h-[200%] bg-cyan-900/10 blur-[150px] rounded-full pointer-events-none group-hover:bg-cyan-800/10 transition-colors duration-1000" />

                <div className="relative z-10 flex flex-col xl:flex-row items-center gap-12 w-full">
                    
                    {/* The Power Core Ring */}
                    <div className="relative w-40 h-40 sm:w-52 sm:h-52 lg:w-64 lg:h-64 shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 256 256" className="w-full h-full transform -rotate-90 absolute inset-0">
                            <circle cx="128" cy="128" r="120" stroke="currentColor" strokeWidth="4" fill="none" className="text-white/5" />
                            <circle cx="128" cy="128" r="90" stroke="currentColor" strokeWidth="2" fill="none" className="text-white/[0.02]" strokeDasharray="4 8" />
                            <circle
                                cx="128" cy="128" r="120" stroke="currentColor" strokeWidth="8" fill="none"
                                strokeDasharray={cir} strokeDashoffset={strokeOffset} strokeLinecap="round"
                                className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all duration-1500"
                            />
                        </svg>
                        <div className="flex flex-col items-center justify-center text-center relative z-10 bg-black/40 backdrop-blur-md w-28 h-28 sm:w-40 sm:h-40 lg:w-48 lg:h-48 rounded-full border border-white/10 shadow-inner group-hover:border-cyan-500/30 transition-colors">
                            <Crown size={24} className="text-cyan-400 mb-2 opacity-50" />
                            <span className="text-3xl sm:text-4xl lg:text-5xl font-black font-orbitron text-white italic drop-shadow-md">{stats.unlocked}</span>
                            <div className="w-12 h-px bg-white/20 my-1" />
                            <span className="text-lg font-black font-orbitron text-slate-500">{stats.total}</span>
                        </div>
                    </div>

                    <div className="flex-1 text-center xl:text-left space-y-4">
                        <div className="inline-flex items-center gap-3 px-4 py-2 border border-cyan-500/20 bg-cyan-500/5 rounded-full mb-2">
                           <Radar size={12} className="text-cyan-400 animate-[spin_3s_linear_infinite]"/>
                           <span className="text-[10px] uppercase font-black tracking-[0.3em] text-cyan-400">Hall of Honor Synchronized</span>
                        </div>
                        <h2 className="text-3xl sm:text-4xl lg:text-7xl font-black font-orbitron tracking-tighter uppercase italic text-white leading-none">
                            Trophy Matrix
                        </h2>
                        <p className="text-slate-500 text-sm uppercase tracking-[0.24em] lg:tracking-[0.5em] font-black w-full max-w-2xl bg-black/20 p-4 rounded-2xl border border-white/5">
                            Decode global milestones to secure rare blockchain honors and passive network yield.
                        </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-center justify-center self-stretch xl:border-l border-white/10 xl:pl-12">
                        <button
                            onClick={checkForNewAchievements}
                            className="relative group/btn overflow-hidden rounded-2xl bg-cyan-900/20 border border-cyan-500/30 px-6 lg:px-8 py-5 lg:py-6 flex flex-col items-center justify-center hover:bg-cyan-900/40 hover:border-cyan-400 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] transition-all min-h-[56px]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent -translate-x-[200%] group-hover/btn:animate-[scan_1.5s_ease-in-out_infinite]" />
                            <Radar size={32} className="text-cyan-400 mb-4" />
                            <span className="text-sm font-black font-orbitron uppercase text-white tracking-widest">[ PING SYNC ]</span>
                            <span className="text-[9px] text-cyan-500 mt-2 uppercase tracking-[0.3em]">Query Chain</span>
                        </button>
                    </div>
                </div>
            </header>

            {error && (
                <div className="flex items-center justify-center p-4 border border-rose-500/30 bg-rose-500/10 rounded-xl text-rose-400 text-xs font-black tracking-widest uppercase">
                    SYS_ERR: {error}
                </div>
            )}

            {/* 2. GALLERY WINGS (Category Filter) */}
            <div className="flex gap-3 overflow-x-auto border-b border-white/5 pb-4 lg:pb-8 no-scrollbar">
                {categories.map((cat) => {
                    const isActive = selectedCategory === cat.key;
                    return (
                        <button
                            key={cat.key}
                            onClick={() => setSelectedCategory(cat.key)}
                            className={`min-w-[140px] flex flex-col items-center justify-center px-5 lg:px-10 py-4 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] font-black transition-all duration-500 relative overflow-hidden group ${
                                isActive ? 'bg-white/10 border-white/20 border shadow-[inset_0_4px_20px_rgba(255,255,255,0.05)] text-white' : 'glass-panel border-transparent border text-slate-600 hover:bg-white/[0.05] hover:text-slate-400'
                            }`}
                        >
                            {isActive && <motion.div layoutId="cat-indicator" className="absolute top-0 inset-x-8 h-1 bg-white rounded-b-full shadow-[0_0_15px_rgba(255,255,255,0.8)]" />}
                            <div className="flex items-center gap-3 relative z-10 text-xs uppercase tracking-[0.4em]">
                                {cat.icon} {cat.label}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* 3. THE BADGE VAULT (Grid) */}
            {loading ? (
                <SystemLoader theme="amber" message="SYS_SYNC: MOUNTING HALL OF HONOR" subMessage="ACCESSING MASTER COLLECTION MATRIX" />
            ) : filteredAchievements.length === 0 ? (
                <SystemEmpty title="NO PROTOCOL BADGES DETECTED" subtitle="Secure new honors via mission completion and progression." icon="fingerprint" />
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-6">
                    {filteredAchievements.map((ach, idx) => {
                        const style = ach.unlocked ? (rarityColors[ach.rarity] || rarityColors.COMMON) : {};
                        
                        return (
                            <motion.div
                                key={ach.id}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className={`relative rounded-[1.5rem] lg:rounded-[2.5rem] border overflow-hidden flex flex-col group ${
                                    ach.unlocked 
                                      ? `bg-[#0A0D12] ${style.border} ${style.glow}` 
                                      : 'bg-[#050608] border-white/5 opacity-80'
                                }`}
                            >
                                {/* Background glow for unlocked */}
                                {ach.unlocked && (
                                    <div className="absolute inset-x-0 -top-[50%] h-[150%] opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity">
                                        <div className={`w-full h-full ${style.bg} blur-[60px]`} />
                                    </div>
                                )}

                                {/* Lock state massive overlay */}
                                {!ach.unlocked && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-dashed border-white/10 rounded-full flex flex-col items-center justify-center opacity-40 mix-blend-overlay">
                                        <Lock size={40} className="text-slate-500 mb-2" />
                                        <span className="text-[10px] font-black font-orbitron tracking-widest text-slate-500">LOCKED</span>
                                    </div>
                                )}

                                <div className="p-5 lg:p-8 relative z-10 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className={`w-16 h-16 flex items-center justify-center text-4xl rounded-2xl ${ach.unlocked ? `${style.bg} ${style.border} border` : 'bg-black border border-white/5 grayscale saturate-0 opacity-40'}`}>
                                            {ach.icon || 'ACH'}
                                        </div>
                                        <span className={`px-3 py-1 rounded bg-black/60 border text-[9px] font-black uppercase tracking-widest shadow-inner ${
                                            ach.unlocked ? `${style.border} ${style.text}` : 'border-white/5 text-slate-600'
                                        }`}>
                                            {ach.rarity}
                                        </span>
                                    </div>

                                    <h3 className={`text-xl font-bold font-orbitron mb-2 ${ach.unlocked ? 'text-white' : 'text-slate-500'}`}>{ach.name}</h3>
                                    <p className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors flex-1">{ach.description}</p>
                                </div>

                                {/* Tactical Sub-Panel for Metadata / Rewards */}
                                <div className={`relative z-10 p-6 pt-0 mt-auto flex flex-col gap-3 ${!ach.unlocked && 'opacity-30 mix-blend-luminosity'}`}>
                                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-2" />
                                    
                                    <div className="flex items-center gap-2">
                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-black border border-white/5 text-[9px] font-black uppercase tracking-widest w-full justify-center ${ach.unlocked ? 'text-cyan-400' : 'text-slate-600'}`}>
                                            <Zap size={10} /> +{ach.xpReward} XP
                                        </div>
                                        {ach.feedReward > 0 && (
                                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-black border border-white/5 text-[9px] font-black uppercase tracking-widest w-full justify-center ${ach.unlocked ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                <Hexagon size={10} /> +{ach.feedReward} FEED
                                            </div>
                                        )}
                                    </div>

                                    {ach.unlocked && ach.unlockedAt && (
                                        <p className="text-[9px] text-center text-slate-600 uppercase tracking-widest font-mono mt-1">
                                            SECURED: {new Date(ach.unlockedAt).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* 4. TOTAL BLACKOUT UNLOCK ANIMATION */}
            <AnimatePresence>
                {showUnlockAnimation && featuredAchievement && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black backdrop-blur-3xl overflow-hidden pointer-events-auto">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-10 pointer-events-none" />
                        
                        <motion.div
                            initial={{ scale: 0, rotate: -45, filter: 'brightness(5)' }}
                            animate={{ scale: 1, rotate: 0, filter: 'brightness(1)' }}
                            exit={{ scale: 0, opacity: 0, filter: 'brightness(5)' }}
                            transition={{ type: 'spring', damping: 15, stiffness: 100 }}
                                className="text-center relative z-10 px-4 sm:px-8 py-8 flex flex-col items-center justify-center max-w-2xl w-full max-h-[100dvh] overflow-y-auto custom-scrollbar"
                            >
                            <div className="relative mb-8 lg:mb-12 flex justify-center">
                                <motion.div
                                    animate={{ scale: [1, 1.1, 1], filter: ['drop-shadow(0 0 10px rgba(251,191,36,0.8))', 'drop-shadow(0 0 40px rgba(251,191,36,1))', 'drop-shadow(0 0 10px rgba(251,191,36,0.8))'] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="text-7xl sm:text-8xl lg:text-9xl relative z-10"
                                >
                                    {featuredAchievement.icon || 'ACH'}
                                </motion.div>
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 15, repeat: Infinity, ease: 'linear' }} className="absolute -inset-10 sm:-inset-16 border-2 border-dashed border-amber-400/40 rounded-full mix-blend-screen" />
                                <motion.div animate={{ rotate: -360 }} transition={{ duration: 25, repeat: Infinity, ease: 'linear' }} className="absolute -inset-16 sm:-inset-24 border border-solid border-amber-500/20 rounded-full mix-blend-screen" />
                                <div className="absolute inset-0 bg-amber-500/20 blur-[100px] pointer-events-none rounded-full" />
                            </div>

                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-4 lg:space-y-6">
                                <h2 className="text-sm lg:text-xl font-black font-mono text-amber-500 uppercase tracking-[0.25em] lg:tracking-[0.5em] flex items-center gap-3 lg:gap-4 justify-center">
                                    <div className="h-px w-5 lg:w-8 bg-amber-500/50" />
                                    HONOR DECRYPTED
                                    <div className="h-px w-5 lg:w-8 bg-amber-500/50" />
                               </h2>
                                
                                <h3 className="text-3xl sm:text-4xl lg:text-6xl font-black font-orbitron text-white italic drop-shadow-md">
                                    {featuredAchievement.name}
                                </h3>

                                <div className="bg-white/5 border border-white/10 p-4 lg:p-6 rounded-2xl max-w-lg mx-auto backdrop-blur-md">
                                    <p className="text-slate-300 text-sm lg:text-lg">{featuredAchievement.description}</p>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 lg:gap-6 pt-2 lg:pt-4">
                                    <div className="px-4 lg:px-6 py-3 sm:py-2 rounded-xl bg-amber-500/20 border border-amber-500 text-amber-400 font-black flex items-center justify-center gap-3 min-h-[48px]">
                                        <Zap size={20} /> <span className="text-lg lg:text-2xl font-orbitron">+{featuredUnlock.xpEarned} XP</span>
                                    </div>
                                    {featuredUnlock.feedEarned > 0 && (
                                        <div className="px-4 lg:px-6 py-3 sm:py-2 rounded-xl bg-emerald-500/20 border border-emerald-500 text-emerald-400 font-black flex items-center justify-center gap-3 min-h-[48px]">
                                            <Hexagon size={20} /> <span className="text-lg lg:text-2xl font-orbitron">+{featuredUnlock.feedEarned} FEED</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            <motion.button
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.5 }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowUnlockAnimation(false)}
                                className="mt-8 lg:mt-12 group relative overflow-hidden w-full sm:w-auto min-h-[56px] px-8 sm:px-16 py-4 lg:py-6 rounded-[1.5rem] lg:rounded-[2rem] bg-amber-500 text-black font-black uppercase tracking-widest text-sm lg:text-lg shadow-[0_0_50px_rgba(245,158,11,0.5)] border border-amber-400 hover:bg-amber-400 transition-colors"
                            >
                                <div className="absolute inset-0 bg-white/20 -translate-x-[200%] skew-x-[-20deg] group-hover:animate-[scan_1.5s_ease-in-out_infinite]" />
                                <span className="relative z-10 font-orbitron italic drop-shadow-md">[ SECURE ASSET ]</span>
                            </motion.button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AchievementsView;
