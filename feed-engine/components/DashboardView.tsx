import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FeederProfile } from '../types';
import { useTranslation } from '../i18n/I18nContext';

const MechCorner = ({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const rotation = position === 'tl' ? 0 : position === 'tr' ? 90 : position === 'br' ? 180 : 270;
  return (
    <div
      className="absolute pointer-events-none opacity-20 group-hover:opacity-60 transition-opacity duration-700"
      style={{
        top: position.includes('t') ? '10px' : 'auto',
        bottom: position.includes('b') ? '10px' : 'auto',
        left: position.includes('l') ? '10px' : 'auto',
        right: position.includes('r') ? '10px' : 'auto',
        transform: `rotate(${rotation}deg)`,
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M0 0H40L35 5H5V35L0 40V0Z" fill="var(--neon-cyan)" />
      </svg>
    </div>
  );
};

const CircularGauge: React.FC<{ value: number; label: string; color: string; size?: number }> = ({ value, label, color, size = 200 }) => {
  const normalizedValue = Math.max(0, Math.min(100, value));
  const radius = size * 0.4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative group">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className={color}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
        <span className="text-4xl font-black font-orbitron text-white italic">{normalizedValue.toFixed(1)}%</span>
        <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] text-center">{label}</span>
      </div>
      <div className={`absolute inset-0 blur-[40px] opacity-20 group-hover:opacity-40 transition-opacity ${color.replace('text-', 'bg-')}`} />
    </div>
  );
};

const TelemetryGraph: React.FC<{ values: number[] }> = ({ values }) => {
  const safeValues = values.length > 0 ? values : [20, 35, 28, 42, 30, 55, 40, 48];

  return (
    <div className="h-32 w-full flex items-end gap-1 px-2 overflow-hidden">
      {safeValues.map((value, index) => (
        <motion.div
          key={`${index}-${value}`}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(12, Math.min(100, value))}%` }}
          transition={{ duration: 0.5, delay: index * 0.04 }}
          className="flex-1 bg-gradient-to-t from-cyan-500/40 to-cyan-300 rounded-t-sm"
        />
      ))}
    </div>
  );
};

const DashboardView: React.FC<{ profile: FeederProfile }> = ({ profile }) => {
  const { t } = useTranslation();

  const level = Math.max(1, Math.floor(profile.xp / 1000) + 1);
  const xpIntoLevel = profile.xp % 1000;
  const xpProgress = Math.min(100, (xpIntoLevel / 1000) * 100);
  const history = profile.history ?? [];
  const averageDeviation = history.length > 0 ? history.reduce((sum, item) => sum + item.deviation, 0) / history.length : 0;
  const averageReward = history.length > 0 ? history.reduce((sum, item) => sum + item.reward, 0) / history.length : 0;
  const recentActivity = history[0]?.timestamp ? new Date(history[0].timestamp).toLocaleString() : t.dashboard.noHistory;
  const telemetryValues = history.slice(0, 12).map((item) => Math.max(12, Math.min(100, item.reward * 4 + 12)));
  const integrityScore = Math.max(0, Math.min(100, profile.accuracyRate - averageDeviation * 120));

  const headlineStats = [
    { label: t.dashboard.totalFeeds, value: profile.totalFeeds.toLocaleString(), color: 'text-cyan-400' },
    { label: t.dashboard.currentRank, value: profile.rank, color: 'text-rose-400' },
    { label: t.dashboard.staked, value: `${profile.stakedAmount.toLocaleString()} ${profile.stakeType}`, color: 'text-emerald-400' },
    { label: 'FEED', value: profile.balanceFEED.toLocaleString(), color: 'text-amber-400' },
  ];

  const walletStats = [
    { label: 'USDT', value: profile.balanceUSDT.toLocaleString(undefined, { maximumFractionDigits: 4 }), color: 'text-white' },
    { label: 'BNB', value: (profile.balanceNative ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 }), color: 'text-cyan-400' },
    { label: t.dashboard.reward, value: averageReward.toFixed(2), color: 'text-emerald-400' },
    { label: t.dashboard.deviation, value: `${averageDeviation.toFixed(3)}%`, color: 'text-rose-400' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20 relative">
      <header className="flex flex-col md:flex-row justify-between items-end gap-6 px-4">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_15px_rgba(34,211,238,1)] animate-pulse" />
            <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase italic text-white leading-none">
              {t.dashboard.nodeTelemetry}
            </h2>
          </div>
          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.5em] italic ml-7">{profile.nickname}  |  {profile.address.slice(0, 6)}...{profile.address.slice(-4)}</p>
        </div>
        <div className="px-10 py-5 bg-black/60 border border-white/10 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl flex items-center gap-8 relative group">
          <div className="text-right">
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{t.dashboard.globalStatus}</p>
            <p className="text-lg font-black font-orbitron text-emerald-400 tracking-tighter italic uppercase">{t.dashboard.synchronized}</p>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="text-right">
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Level</p>
            <p className="text-lg font-black font-orbitron text-white">LV {level}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 p-10 rounded-[4rem] glass-panel border border-white/5 relative overflow-hidden group">
          <MechCorner position="tl" />
          <MechCorner position="tr" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/hexellence.png')] opacity-[0.03] pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-around gap-8">
            <CircularGauge value={profile.accuracyRate} label={t.dashboard.linkAccuracy} color="text-cyan-400" size={220} />
            <div className="w-px h-32 bg-white/5 hidden md:block" />
            <CircularGauge value={integrityScore} label={t.dashboard.nodeIntegrity} color="text-rose-500" size={220} />
          </div>

          <div className="mt-14 space-y-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-500 font-black">
              <span>{t.dashboard.xpProgress}</span>
              <span>{xpIntoLevel} / 1000 XP</span>
            </div>
            <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-white rounded-full"
              />
            </div>
          </div>

          <div className="mt-16 pt-12 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-8">
            {headlineStats.map((stat) => (
              <div key={stat.label} className="space-y-1 text-center">
                <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{stat.label}</p>
                <p className={`text-xl font-black font-orbitron italic tracking-tighter ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-10 rounded-[4rem] glass-panel border border-white/5 flex flex-col justify-between relative overflow-hidden group">
          <MechCorner position="br" />
          <div className="space-y-6 relative z-10">
            <div className="flex justify-between items-center">
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500">{t.dashboard.recentFeeds}</h3>
              <span className="text-[9px] text-cyan-500 font-mono">{history.length} records</span>
            </div>
            <TelemetryGraph values={telemetryValues} />
          </div>

          <div className="space-y-5 relative z-10">
            <div className="p-6 rounded-[2.5rem] bg-black/40 border border-white/5 space-y-2">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.dashboard.activityStreak}</p>
              <p className="text-base font-black font-orbitron text-white italic">{recentActivity}</p>
            </div>
            <div className="p-6 rounded-[2.5rem] bg-black/40 border border-white/5 space-y-2">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.dashboard.noHistory}</p>
              <p className="text-base font-black font-orbitron text-white italic">{history.length === 0 ? t.dashboard.noHistory : `${history.length} records loaded`}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {walletStats.map((item) => (
          <motion.div
            key={item.label}
            whileHover={{ y: -10, scale: 1.02 }}
            className="p-10 rounded-[3rem] glass-panel border border-white/5 flex flex-col items-center text-center space-y-4 group cursor-pointer relative"
          >
            <div className="space-y-1 relative z-10">
              <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em]">{item.label}</p>
              <p className={`text-2xl font-black font-orbitron italic tracking-tighter ${item.color}`}>{item.value}</p>
            </div>
            <MechCorner position="tl" />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default DashboardView;
