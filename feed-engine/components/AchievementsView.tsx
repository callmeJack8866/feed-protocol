import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useTranslation } from '../i18n/I18nContext';

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

const categoryIcons: Record<string, string> = {
    ALL: 'ALL',
    MILESTONE: 'MLS',
    PRECISION: 'ACC',
    SPEED: 'SPD',
    SPECIAL: 'SPC',
};

const rarityColors: Record<string, string> = {
    COMMON: 'from-slate-400 to-slate-500',
    RARE: 'from-blue-400 to-blue-600',
    EPIC: 'from-fuchsia-400 to-fuchsia-600',
    LEGENDARY: 'from-amber-400 to-orange-500',
};

const AchievementsView: React.FC = () => {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [stats, setStats] = useState({ total: 0, unlocked: 0, byCategory: {} as Record<string, number> });
    const [newlyUnlocked, setNewlyUnlocked] = useState<any[]>([]);
    const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
    const [error, setError] = useState('');
    const { t } = useTranslation();

    const playUnlockSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
                osc.connect(gain).connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + 1.5);
            });
        } catch {
            // Silent fallback if Web Audio is unavailable.
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

    const rarityLabels: Record<string, string> = {
        COMMON: t.achievements.rarityCommon,
        RARE: t.achievements.rarityRare,
        EPIC: t.achievements.rarityEpic,
        LEGENDARY: t.achievements.rarityLegendary,
    };

    useEffect(() => {
        void loadAchievements();
    }, []);

    const loadAchievements = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await api.getMyAchievements();

            if (res.success) {
                const nextAchievements = (res.achievements ?? []) as Achievement[];
                setAchievements(nextAchievements);

                if (res.stats) {
                    setStats(res.stats);
                } else {
                    const byCategory = nextAchievements.reduce<Record<string, number>>((acc, achievement) => {
                        if (achievement.unlocked) {
                            acc[achievement.category] = (acc[achievement.category] ?? 0) + 1;
                        }
                        return acc;
                    }, {});

                    setStats({
                        total: nextAchievements.length,
                        unlocked: nextAchievements.filter((achievement) => achievement.unlocked).length,
                        byCategory,
                    });
                }
            }
        } catch (loadError: any) {
            console.error('Load achievements error:', loadError);
            setAchievements([]);
            setStats({ total: 0, unlocked: 0, byCategory: {} });
            setError(loadError.message || 'Failed to load achievements.');
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
        } catch (checkError: any) {
            console.error('Check achievements error:', checkError);
            setError(checkError.message || 'Failed to check achievements.');
        }
    };

    const filteredAchievements = selectedCategory === 'ALL'
        ? achievements
        : achievements.filter((achievement) => achievement.category === selectedCategory);

    const completionRate = stats.total > 0 ? Math.round((stats.unlocked / stats.total) * 100) : 0;
    const featuredUnlock = newlyUnlocked[0];
    const featuredAchievement = featuredUnlock?.achievement;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            <header className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-2">
                    <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase">{t.achievements.title}</h2>
                    <p className="text-slate-500">{t.achievements.subtitle}</p>
                </div>
                <button
                    onClick={checkForNewAchievements}
                    className="px-6 py-3 rounded-xl bg-amber-500/20 text-amber-400 font-bold hover:bg-amber-500/30 transition-colors"
                >
                    {t.achievements.checkNew}
                </button>
            </header>

            {error && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-4 text-sm text-rose-300">
                    {error}
                </div>
            )}

            <div className="glass-panel rounded-3xl p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <p className="text-5xl font-black font-orbitron text-cyan-400">{stats.unlocked}/{stats.total}</p>
                        <p className="text-slate-500 mt-1">{t.achievements.unlocked}</p>
                    </div>
                    <div className="w-32 h-32 relative shrink-0">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-800" />
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={`${completionRate * 3.52} 352`}
                                className="text-cyan-500 transition-all duration-1000"
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-2xl font-black font-orbitron">
                            {completionRate}%
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {categories.slice(1).map((category) => (
                        <div key={category.key} className="text-center p-4 bg-white/5 rounded-xl">
                            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300">{category.icon}</span>
                            <p className="text-lg font-bold mt-2">{stats.byCategory[category.key] || 0}</p>
                            <p className="text-xs text-slate-500">{category.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
                {categories.map((category) => (
                    <button
                        key={category.key}
                        onClick={() => setSelectedCategory(category.key)}
                        className={`px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                            selectedCategory === category.key
                                ? 'bg-cyan-500 text-black'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                    >
                        {category.icon} {category.label}
                    </button>
                ))}
            </div>

            {filteredAchievements.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-white/10 px-6 py-12 text-center text-slate-500">
                    No achievements are available for this filter yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAchievements.map((achievement, idx) => (
                        <motion.div
                            key={achievement.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`relative p-6 rounded-2xl border transition-all ${
                                achievement.unlocked
                                    ? 'glass-panel border-white/20'
                                    : 'bg-slate-900/50 border-white/5 opacity-60 grayscale'
                            }`}
                        >
                            {achievement.unlocked && (
                                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${rarityColors[achievement.rarity] || rarityColors.COMMON} opacity-10`} />
                            )}

                            <div className="relative space-y-4">
                                <div className="flex justify-between items-start gap-4">
                                    <span className="text-5xl">{achievement.icon || 'ACH'}</span>
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase bg-gradient-to-r ${rarityColors[achievement.rarity] || rarityColors.COMMON} text-white`}>
                                        {rarityLabels[achievement.rarity] || achievement.rarity}
                                    </span>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold">{achievement.name}</h3>
                                    <p className="text-sm text-slate-400 mt-1">{achievement.description}</p>
                                </div>

                                <div className="flex justify-between items-center pt-4 border-t border-white/10 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-amber-400 font-bold">+{achievement.xpReward} XP</span>
                                        {achievement.feedReward > 0 && (
                                            <span className="text-emerald-400 font-bold ml-2">+{achievement.feedReward} FEED</span>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${achievement.unlocked ? 'text-emerald-300' : 'text-slate-500'}`}>
                                        {achievement.unlocked ? 'OK' : 'LOCK'}
                                    </span>
                                </div>

                                {achievement.unlocked && achievement.unlockedAt && (
                                    <p className="text-xs text-slate-500">
                                        {t.achievements.unlockedAtLabel} {new Date(achievement.unlockedAt).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            <AnimatePresence>
                {showUnlockAnimation && featuredAchievement && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md overflow-hidden">
                        <motion.div
                            initial={{ scale: 0, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="text-center space-y-8 relative z-10 px-8"
                        >
                            <div className="relative inline-block">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                                    transition={{ duration: 0.5, repeat: 2 }}
                                    className="text-9xl relative z-10"
                                >
                                    {featuredAchievement.icon || 'ACH'}
                                </motion.div>
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                    className="absolute -inset-8 border-2 border-dashed border-amber-400/30 rounded-full"
                                />
                                <motion.div
                                    animate={{ rotate: -360 }}
                                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                                    className="absolute -inset-14 border border-dashed border-amber-500/15 rounded-full"
                                />
                            </div>

                            <div className="space-y-4">
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-2xl font-bold text-amber-400 uppercase tracking-widest"
                                >
                                    {t.achievements.achievementUnlocked}
                                </motion.h2>
                                <motion.h3
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-4xl font-black font-orbitron text-white"
                                >
                                    {featuredAchievement.name}
                                </motion.h3>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.7 }}
                                    className="text-slate-400"
                                >
                                    {featuredAchievement.description}
                                </motion.p>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.9 }}
                                    className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase bg-gradient-to-r ${rarityColors[featuredAchievement.rarity] || rarityColors.COMMON} text-white`}
                                >
                                    {rarityLabels[featuredAchievement.rarity] || featuredAchievement.rarity}
                                </motion.div>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.1 }}
                                    className="text-2xl font-bold text-amber-400"
                                >
                                    +{featuredUnlock.xpEarned} XP
                                    {featuredUnlock.feedEarned > 0 && ` | +${featuredUnlock.feedEarned} FEED`}
                                </motion.p>
                            </div>

                            <motion.button
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1.3 }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowUnlockAnimation(false)}
                                className="px-12 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black font-orbitron shadow-[0_20px_60px_rgba(251,191,36,0.3)]"
                            >
                                {t.achievements.awesome}
                            </motion.button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AchievementsView;
