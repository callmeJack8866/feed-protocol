import React, { useState, useEffect, useCallback } from 'react';
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

const AchievementsView: React.FC = () => {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [stats, setStats] = useState({ total: 0, unlocked: 0, byCategory: {} as Record<string, number> });
    const [newlyUnlocked, setNewlyUnlocked] = useState<any[]>([]);
    const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
    const { t } = useTranslation();

    /**
     * 解锁音效 — Web Audio 升调和弦
     * 触发条件：showUnlockAnimation 变为 true
     */
    const playUnlockSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
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
        } catch { /* 静默降级 */ }
    }, []);

    useEffect(() => {
        if (showUnlockAnimation) playUnlockSound();
    }, [showUnlockAnimation, playUnlockSound]);

    const categories = [
        { key: 'ALL', label: t.achievements.allCategory, icon: '🏆' },
        { key: 'MILESTONE', label: t.achievements.milestoneCategory, icon: '🏅' },
        { key: 'PRECISION', label: t.achievements.precisionCategory, icon: '🎯' },
        { key: 'SPEED', label: t.achievements.speedCategory, icon: '⚡' },
        { key: 'SPECIAL', label: t.achievements.specialCategory, icon: '🌟' }
    ];

    const rarityColors: Record<string, string> = {
        'COMMON': 'from-slate-400 to-slate-500',
        'RARE': 'from-blue-400 to-blue-600',
        'EPIC': 'from-purple-400 to-purple-600',
        'LEGENDARY': 'from-amber-400 to-orange-500'
    };

    const rarityLabels: Record<string, string> = {
        'COMMON': t.achievements.rarityCommon,
        'RARE': t.achievements.rarityRare,
        'EPIC': t.achievements.rarityEpic,
        'LEGENDARY': t.achievements.rarityLegendary
    };

    useEffect(() => {
        loadAchievements();
    }, []);

    const loadAchievements = async () => {
        try {
            setLoading(true);
            const res = await api.getMyAchievements();
            if (res.success && res.achievements) {
                setAchievements(res.achievements);
                if (res.stats) setStats(res.stats);
            }
        } catch (error) {
            console.error('Load achievements error:', error);
            // Mock 数据作为备用
            setAchievements([
                { id: '1', code: 'FIRST_FEED', name: '初出茅庐', description: '完成首次喂价', category: 'MILESTONE', icon: '🎯', rarity: 'COMMON', xpReward: 50, feedReward: 0, unlocked: true, unlockedAt: new Date().toISOString() },
                { id: '2', code: 'FEEDS_100', name: '百单达人', description: '累计完成 100 单', category: 'MILESTONE', icon: '💯', rarity: 'RARE', xpReward: 200, feedReward: 0, unlocked: false },
                { id: '3', code: 'SHARPSHOOTER', name: '神枪手', description: '连续 10 单偏差 < 0.05%', category: 'PRECISION', icon: '🎯', rarity: 'RARE', xpReward: 150, feedReward: 0, unlocked: false },
                { id: '4', code: 'SEASON_CHAMPION', name: '赛季冠军', description: '获得月赛季第一名', category: 'SPECIAL', icon: '🏆', rarity: 'LEGENDARY', xpReward: 1000, feedReward: 500, unlocked: false },
            ]);
            setStats({ total: 4, unlocked: 1, byCategory: { MILESTONE: 1 } });
        } finally {
            setLoading(false);
        }
    };

    const checkForNewAchievements = async () => {
        try {
            const res = await api.checkAchievements();
            if (res.success && res.newlyUnlocked && res.newlyUnlocked.length > 0) {
                setNewlyUnlocked(res.newlyUnlocked);
                setShowUnlockAnimation(true);
                loadAchievements(); // 刷新列表
            }
        } catch (error) {
            console.error('Check achievements error:', error);
        }
    };

    const filteredAchievements = selectedCategory === 'ALL'
        ? achievements
        : achievements.filter(a => a.category === selectedCategory);

    const completionRate = stats.total > 0 ? Math.round((stats.unlocked / stats.total) * 100) : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            <header className="flex justify-between items-start">
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

            {/* 进度概览 */}
            <div className="glass-panel rounded-3xl p-8 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-5xl font-black font-orbitron text-cyan-400">{stats.unlocked}/{stats.total}</p>
                        <p className="text-slate-500 mt-1">{t.achievements.unlocked}</p>
                    </div>
                    <div className="w-32 h-32 relative">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-800" />
                            <circle
                                cx="64" cy="64" r="56"
                                stroke="currentColor" strokeWidth="8" fill="none"
                                strokeDasharray={`${completionRate * 3.52} 352`}
                                className="text-cyan-500 transition-all duration-1000"
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-2xl font-black font-orbitron">
                            {completionRate}%
                        </span>
                    </div>
                </div>

                {/* 分类统计 */}
                <div className="grid grid-cols-4 gap-4">
                    {categories.slice(1).map(cat => (
                        <div key={cat.key} className="text-center p-4 bg-white/5 rounded-xl">
                            <span className="text-2xl">{cat.icon}</span>
                            <p className="text-lg font-bold mt-1">{(stats.byCategory as any)[cat.key] || 0}</p>
                            <p className="text-xs text-slate-500">{cat.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 分类筛选 */}
            <div className="flex gap-3 overflow-x-auto pb-2">
                {categories.map(cat => (
                    <button
                        key={cat.key}
                        onClick={() => setSelectedCategory(cat.key)}
                        className={`px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${selectedCategory === cat.key
                            ? 'bg-cyan-500 text-black'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        {cat.icon} {cat.label}
                    </button>
                ))}
            </div>

            {/* 成就列表 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAchievements.map((achievement, idx) => (
                    <motion.div
                        key={achievement.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`relative p-6 rounded-2xl border transition-all ${achievement.unlocked
                            ? 'glass-panel border-white/20'
                            : 'bg-slate-900/50 border-white/5 opacity-60 grayscale'
                            }`}
                    >
                        {/* 稀有度背景 */}
                        {achievement.unlocked && (
                            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${rarityColors[achievement.rarity]} opacity-10`} />
                        )}

                        <div className="relative space-y-4">
                            <div className="flex justify-between items-start">
                                <span className="text-5xl">{achievement.icon}</span>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase bg-gradient-to-r ${rarityColors[achievement.rarity]} text-white`}>
                                    {rarityLabels[achievement.rarity]}
                                </span>
                            </div>

                            <div>
                                <h3 className="text-xl font-bold">{achievement.name}</h3>
                                <p className="text-sm text-slate-400 mt-1">{achievement.description}</p>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-white/10">
                                <div className="space-y-1">
                                    <span className="text-amber-400 font-bold">+{achievement.xpReward} XP</span>
                                    {achievement.feedReward > 0 && (
                                        <span className="text-emerald-400 font-bold ml-2">+{achievement.feedReward} FEED</span>
                                    )}
                                </div>
                                {achievement.unlocked ? (
                                    <span className="text-emerald-400 text-lg">✅</span>
                                ) : (
                                    <span className="text-slate-500 text-lg">🔒</span>
                                )}
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

            {/* 解锁动画弹窗 */}
            <AnimatePresence>
                {showUnlockAnimation && newlyUnlocked.length > 0 && (() => {
                    const achievement = newlyUnlocked[0].achievement;
                    const rarityGlow: Record<string, string> = {
                        COMMON: 'from-slate-400/40 via-slate-300/20 to-slate-400/40',
                        RARE: 'from-blue-500/50 via-cyan-400/25 to-blue-500/50',
                        EPIC: 'from-purple-500/50 via-pink-400/25 to-purple-500/50',
                        LEGENDARY: 'from-amber-500/60 via-yellow-300/30 to-amber-500/60',
                    };
                    const glowClass = rarityGlow[achievement.rarity] || rarityGlow.COMMON;

                    return (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md overflow-hidden">

                            {/* 金色粒子爆炸 */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                {[...Array(40)].map((_, i) => {
                                    const angle = (i * (360 / 40)) + (Math.random() * 10);
                                    const dist = 120 + Math.random() * 350;
                                    const x = Math.cos(angle * (Math.PI / 180)) * dist;
                                    const y = Math.sin(angle * (Math.PI / 180)) * dist;
                                    const size = 3 + Math.random() * 7;
                                    const isCircle = i % 3 !== 0;
                                    const colors = ['#fbbf24', '#f59e0b', '#fcd34d', '#ffffff', '#22d3ee'];
                                    const color = colors[i % colors.length];

                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                                            animate={{ x, y, scale: [0, 1.5, 0.5], opacity: [1, 1, 0] }}
                                            transition={{ duration: 1.5 + Math.random(), delay: 0.2 + Math.random() * 0.3, ease: 'easeOut' }}
                                            style={{
                                                width: size, height: size,
                                                backgroundColor: color,
                                                borderRadius: isCircle ? '50%' : '2px',
                                                boxShadow: `0 0 ${size * 2}px ${color}`,
                                                position: 'absolute',
                                                transform: isCircle ? '' : `rotate(${Math.random() * 360}deg)`,
                                            }}
                                        />
                                    );
                                })}
                            </div>

                            {/* 稀有度脉冲光晕 */}
                            <motion.div
                                animate={{ scale: [0.5, 2.5], opacity: [0.8, 0] }}
                                transition={{ duration: 2, repeat: 2, ease: 'easeOut' }}
                                className={`absolute w-[300px] h-[300px] rounded-full bg-gradient-radial ${glowClass} blur-2xl pointer-events-none`}
                            />

                            <motion.div
                                initial={{ scale: 0, rotate: -10 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="text-center space-y-8 relative z-10"
                            >
                                {/* 图标 + 光环 */}
                                <div className="relative inline-block">
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                                        transition={{ duration: 0.5, repeat: 2 }}
                                        className="text-9xl relative z-10"
                                    >
                                        {achievement.icon}
                                    </motion.div>
                                    {/* 旋转光环 */}
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
                                        {achievement.name}
                                    </motion.h3>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.7 }}
                                        className="text-slate-400"
                                    >
                                        {achievement.description}
                                    </motion.p>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.9 }}
                                        className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase bg-gradient-to-r ${rarityColors[achievement.rarity]} text-white`}
                                    >
                                        {rarityLabels[achievement.rarity]}
                                    </motion.div>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 1.1 }}
                                        className="text-2xl font-bold text-amber-400"
                                    >
                                        +{newlyUnlocked[0].xpEarned} XP
                                        {newlyUnlocked[0].feedEarned > 0 && ` · +${newlyUnlocked[0].feedEarned} FEED`}
                                    </motion.p>
                                </div>

                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1.3 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setShowUnlockAnimation(false)}
                                    className="px-12 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black font-orbitron shadow-[0_20px_60px_rgba(251,191,36,0.3)] hover:shadow-[0_25px_70px_rgba(251,191,36,0.5)] transition-shadow"
                                >
                                    {t.achievements.awesome}
                                </motion.button>
                            </motion.div>
                        </div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
};

export default AchievementsView;
