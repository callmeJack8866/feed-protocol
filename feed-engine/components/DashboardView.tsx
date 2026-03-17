
import React, { useMemo } from 'react';
import { FeederProfile } from '../types';
import { motion } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';

const MechCorner = ({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const rotation = position === 'tl' ? 0 : position === 'tr' ? 90 : position === 'br' ? 180 : 270;
  return (
    <div className={`absolute pointer-events-none opacity-20 group-hover:opacity-60 transition-opacity duration-700`}
      style={{
        top: position.includes('t') ? '10px' : 'auto',
        bottom: position.includes('b') ? '10px' : 'auto',
        left: position.includes('l') ? '10px' : 'auto',
        right: position.includes('r') ? '10px' : 'auto',
        transform: `rotate(${rotation}deg)`
      }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M0 0H40L35 5H5V35L0 40V0Z" fill="var(--neon-cyan)" />
      </svg>
    </div>
  );
};

const CircularGauge: React.FC<{ value: number; label: string; color: string; size?: number }> = ({ value, label, color, size = 200 }) => {
  const radius = size * 0.4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative group">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="currentColor" strokeWidth="8" fill="transparent"
          className="text-white/5"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="currentColor" strokeWidth="8" fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 2, ease: "easeOut" }}
          className={color}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
        <span className="text-4xl font-black font-orbitron text-white italic">{value}%</span>
        <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em]">{label}</span>
      </div>
      <div className={`absolute inset-0 blur-[40px] opacity-20 group-hover:opacity-40 transition-opacity ${color.replace('text-', 'bg-')}`} />
    </div>
  );
};

const TelemetryGraph = () => {
  const points = useMemo(() => Array.from({ length: 20 }, () => Math.random() * 40 + 30), []);

  return (
    <div className="h-32 w-full flex items-end gap-1 px-2 overflow-hidden">
      {points.map((p, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${p}%` }}
          transition={{
            repeat: Infinity,
            repeatType: 'mirror',
            duration: 1 + Math.random(),
            delay: i * 0.1
          }}
          className="flex-1 bg-gradient-to-t from-cyan-500/40 to-cyan-400 rounded-t-sm"
        />
      ))}
    </div>
  );
};

const DashboardView: React.FC<{ profile: FeederProfile }> = ({ profile }) => {
  const { t } = useTranslation();

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
          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.5em] italic ml-7">{t.dashboard.handshakeProtocol}</p>
        </div>
        <div className="px-10 py-5 bg-black/60 border border-white/10 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl flex items-center gap-8 relative group">
          <div className="text-right">
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{t.dashboard.globalStatus}</p>
            <p className="text-lg font-black font-orbitron text-emerald-400 tracking-tighter italic uppercase">{t.dashboard.synchronized}</p>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-xl">📡</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Gauges */}
        <div className="lg:col-span-2 p-10 rounded-[4rem] glass-panel border border-white/5 relative overflow-hidden group">
          <MechCorner position="tl" />
          <MechCorner position="tr" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/hexellence.png')] opacity-[0.03] pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-around gap-8">
            <CircularGauge value={profile.accuracyRate} label={t.dashboard.linkAccuracy} color="text-cyan-400" size={220} />
            <div className="w-px h-32 bg-white/5 hidden md:block" />
            <CircularGauge value={88} label={t.dashboard.nodeIntegrity} color="text-rose-500" size={220} />
          </div>

          <div className="mt-16 pt-12 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: t.dashboard.uptime, val: '99.9%', color: 'text-emerald-400' },
              { label: t.dashboard.latency, val: '12ms', color: 'text-cyan-400' },
              { label: t.dashboard.sigsPerSec, val: '4.2', color: 'text-white' },
              { label: t.dashboard.peers, val: '124', color: 'text-amber-400' }
            ].map(stat => (
              <div key={stat.label} className="space-y-1 text-center">
                <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{stat.label}</p>
                <p className={`text-xl font-black font-orbitron italic tracking-tighter ${stat.color}`}>{stat.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sync Stability Card */}
        <div className="p-10 rounded-[4rem] glass-panel border border-white/5 flex flex-col justify-between relative overflow-hidden group">
          <MechCorner position="br" />
          <div className="space-y-6 relative z-10">
            <div className="flex justify-between items-center">
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500">{t.dashboard.syncStability}</h3>
              <span className="text-[9px] text-cyan-500 font-mono animate-pulse">{t.dashboard.liveStream}</span>
            </div>
            <TelemetryGraph />
          </div>

          <div className="space-y-6 relative z-10">
            <div className="p-6 rounded-[2.5rem] bg-black/40 border border-white/5 space-y-2">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.dashboard.protocolVersion}</p>
              <p className="text-xl font-black font-orbitron text-white italic">FEED_OS_v3.42</p>
            </div>
            <button className="w-full py-6 rounded-[2.5rem] bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-cyan-500 hover:text-black hover:border-cyan-500 transition-all shadow-xl">
              {t.dashboard.downloadCoreLogs}
            </button>
          </div>
        </div>
      </div>

      {/* Hardware Matrix Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: '💎', label: t.dashboard.rewardMultiplier, val: '1.4x', color: 'text-cyan-400' },
          { icon: '🛡️', label: t.dashboard.stakeProtection, val: 'Shielded', color: 'text-emerald-400' },
          { icon: '🔥', label: t.dashboard.activityStreak, val: '14 Days', color: 'text-rose-500' },
          { icon: '⚡', label: t.dashboard.computingPower, val: '2.4 GH/s', color: 'text-amber-500' }
        ].map((item, i) => (
          <motion.div
            key={item.label}
            whileHover={{ y: -10, scale: 1.02 }}
            className="p-10 rounded-[3rem] glass-panel border border-white/5 flex flex-col items-center text-center space-y-6 group cursor-pointer relative"
          >
            <div className="text-5xl group-hover:scale-125 transition-transform duration-500 filter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] relative z-10">
              {item.icon}
            </div>
            <div className="space-y-1 relative z-10">
              <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em]">{item.label}</p>
              <p className={`text-2xl font-black font-orbitron italic tracking-tighter ${item.color}`}>{item.val}</p>
            </div>
            <MechCorner position="tl" />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default DashboardView;
