import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeederProfile } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { 
  Zap, Shield, Target, Crosshair, Coins, Database, Activity, 
  Terminal, HardDrive, Hexagon, Network
} from 'lucide-react';

const CircularGauge: React.FC<{ value: number; label: string; colorClass: string; icon: React.ReactNode; size?: number }> = ({ value, label, colorClass, icon, size = 180 }) => {
  const normalizedValue = Math.max(0, Math.min(100, value));
  const radius = size * 0.42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative group p-3 lg:p-6">
      <svg width={size} height={size} className="transform -rotate-90 relative z-10">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="6"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
          className={colorClass.replace('bg-', 'text-')}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-2 z-20">
        <div className={`opacity-60 ${colorClass.replace('bg-', 'text-')}`}>
           {icon}
        </div>
        <span className="text-2xl lg:text-4xl font-black font-orbitron text-white tracking-tighter drop-shadow-md">{normalizedValue.toFixed(1)}<span className="text-sm opacity-50">%</span></span>
        <span className="text-[8px] lg:text-[9px] text-slate-500 font-black uppercase tracking-[0.18em] lg:tracking-[0.3em] text-center w-2/3 leading-tight">{label}</span>
      </div>
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 rounded-full blur-[40px] opacity-10 group-hover:opacity-30 transition-opacity ${colorClass}`} />
    </div>
  );
};

const CombatLog: React.FC<{ history: any[] }> = ({ history }) => {
  const { t } = useTranslation();
  
  if (!history || history.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-8 lg:p-12 opacity-50 border-2 border-dashed border-white/5 rounded-[2rem]">
         <Network size={32} className="mb-4 text-cyan-500/50" />
         <p className="text-xs uppercase font-black tracking-[0.28em] lg:tracking-[0.5em] text-cyan-500 animate-pulse">Awaiting Deployment</p>
         <p className="text-[10px] text-slate-600 mt-2 font-mono">No operational history found in registry</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[360px] lg:h-[420px] overflow-y-auto custom-scrollbar pr-1 lg:pr-2">
      {history.map((log, i) => {
        // Calculate artificial properties if not present for the UI depth
        const isSuccess = log.reward > 0;
        const color = isSuccess ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' : 'text-rose-400 border-rose-500/30 bg-rose-500/5';
        
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            key={i} 
            className={`p-4 rounded-2xl border ${color} flex items-center justify-between group cursor-crosshair relative overflow-hidden`}
          >
             <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
             <div className="w-1 h-full absolute left-0 top-0 bg-current opacity-30 group-hover:opacity-100 transition-opacity" />
             
             <div className="flex items-center gap-4 pl-2 z-10 w-full flex-wrap">
                <Shield size={14} className="shrink-0" />
                <div className="flex-1 min-w-[120px]">
                   <p className="text-[10px] uppercase font-black tracking-widest text-white truncate max-w-full">
                     OP: {log.orderId || `0x${Math.random().toString(16).slice(2,8)}`}
                   </p>
                   <p className="text-[9px] text-slate-500 font-mono mt-1">
                     {new Date(log.timestamp).toLocaleTimeString()}
                   </p>
                </div>
             </div>

             <div className="text-right z-10 shrink-0">
               <p className="text-[11px] font-black font-orbitron italic">
                 {isSuccess ? `+${log.reward}` : '0'} <span className="text-[8px] text-slate-500 tracking-widest uppercase">FEED</span>
               </p>
               <p className="text-[9px] uppercase tracking-widest text-slate-500 mt-1">
                 DEV: <span className={log.deviation > 0.5 ? 'text-rose-400' : 'text-cyan-400'}>{log.deviation.toFixed(2)}%</span>
               </p>
             </div>
          </motion.div>
        );
      })}
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
  
  // Calculate node structural integrity based on devation bounds
  const integrityScore = Math.max(0, Math.min(100, profile.accuracyRate - averageDeviation * 80));
  const isCritical = integrityScore < 50;

  const treasuryStats = [
    { label: 'Tether Core', value: profile.balanceUSDT.toLocaleString(undefined, { maximumFractionDigits: 2 }), suffix: 'USDT', icon: <Database />, color: 'text-white' },
    { label: 'Intel Yield', value: profile.balanceFEED.toLocaleString(), suffix: 'FEED', icon: <Hexagon />, color: 'text-cyan-400' },
    { label: 'Protocol Stake', value: profile.stakedAmount.toLocaleString(), suffix: profile.stakeType, icon: <LockIcon />, color: 'text-emerald-400' },
    { label: 'Native Gas', value: (profile.balanceNative ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 }), suffix: 'BNB', icon: <Coins />, color: 'text-amber-400' },
  ];
  const gaugeSize = 148;

  return (
    <div className="max-w-[90rem] mx-auto px-0 lg:px-4 pb-24 space-y-5 lg:space-y-8">
      
      {/* 1. OPERATOR HERO BANNER */}
      <motion.div 
         initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
         className="w-full glass-panel border border-white/10 bg-[#06080A] rounded-[1.75rem] lg:rounded-[3rem] p-4 sm:p-5 lg:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-5 lg:gap-10 shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-10 pointer-events-none" />

        <div className="flex items-center gap-5 lg:gap-12 relative z-10 w-full md:w-auto">
           {/* Level Shield */}
           <div className="relative group shrink-0">
             <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-36 lg:h-36 bg-gradient-to-br from-cyan-600 via-cyan-900 to-black border-4 border-cyan-400/50 rotate-45 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500 shadow-[0_0_40px_rgba(34,211,238,0.2)]">
                <div className="-rotate-45 flex flex-col items-center">
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-300 drop-shadow-md">LEVEL</span>
                   <span className="text-3xl lg:text-5xl font-black font-orbitron italic text-white drop-shadow-[0_0_10px_currentColor]">{level}</span>
                </div>
             </div>
           </div>

           <div className="flex-1">
             <div className="flex items-center gap-4 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse" />
                <h1 className="text-2xl sm:text-3xl lg:text-5xl font-black font-orbitron uppercase tracking-tighter italic text-white leading-none">
                   {profile.nickname || 'OPERATOR_NULL'}
                </h1>
             </div>
             
             <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-[10px] lg:text-xs font-mono uppercase tracking-widest text-slate-500 mb-4 lg:mb-6">
                <p className="flex items-center gap-2">
                   <Terminal size={12}/> ID: {profile.address.slice(0, 8)}...{profile.address.slice(-6)}
                </p>
                <span className="border border-white/10 px-3 py-1 rounded text-[9px] font-black text-cyan-400 shadow-inner">
                   RANK: {profile.rank}
                </span>
             </div>

             {/* Dynamic XP Engine Bar */}
             <div className="space-y-2 w-full max-w-xl">
               <div className="flex justify-between items-end">
                  <p className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.4em] flex items-center gap-2">
                     <Zap size={10} className="text-cyan-400"/> Experience Matrix
                  </p>
                  <p className="text-[10px] text-white font-orbitron font-black">{xpIntoLevel} <span className="text-slate-600">/ 1000</span></p>
               </div>
               <div className="h-4 w-full bg-black/80 rounded-full border border-white/10 overflow-hidden relative p-1 shadow-inner group-hover:border-cyan-500/30 transition-colors">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                    className="h-full bg-cyan-400 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.8)] relative overflow-hidden"
                  >
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-1/2 -skew-x-12 translate-x-[-150%] animate-[scan_2s_ease-in-out_infinite]" />
                  </motion.div>
               </div>
             </div>
           </div>
        </div>
      </motion.div>

      {/* 2. MAIN INTERFACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        
        {/* LEFT COLUMN: Structural Integrity & Performance */}
        <div className="col-span-1 lg:col-span-2 space-y-6 lg:space-y-8">
           
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
           className={`p-4 lg:p-12 glass-panel border rounded-[1.75rem] lg:rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col sm:flex-row items-center justify-around gap-5 lg:gap-10 ${isCritical ? 'border-rose-500/30 bg-[#120505]' : 'border-white/5 bg-[#05070A]'}`}
           >
              <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-transparent to-transparent pointer-events-none" />
              
              <div className="w-full flex justify-between absolute top-4 lg:top-8 px-5 lg:px-10 items-center z-20 pointer-events-none gap-3">
                 <p className="text-[9px] uppercase tracking-[0.26em] lg:tracking-[0.5em] text-cyan-500 font-black flex items-center gap-2">
                   <Target size={12}/> Analytics Module
                 </p>
                 <span className={`text-[10px] uppercase font-black tracking-widest ${isCritical ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>
                   {isCritical ? 'WARNING: INTEGRITY COMPROMISED' : 'SYSTEMS NOMINAL'}
                 </span>
              </div>

              <div className="relative pt-8">
                 <CircularGauge 
                   value={profile.accuracyRate} 
                   label="Hit Rate" 
                   colorClass={profile.accuracyRate > 90 ? 'bg-cyan-400' : 'bg-amber-400'} 
                   icon={<Crosshair size={20}/>}
                   size={gaugeSize}
                 />
              </div>

              <div className="hidden sm:block w-px h-40 bg-white/5 z-10" />

              <div className="relative pt-8">
                 <CircularGauge 
                   value={integrityScore} 
                   label="Node Integrity" 
                   colorClass={isCritical ? 'bg-rose-500' : 'bg-emerald-400'} 
                   icon={<Shield size={20}/>}
                   size={gaugeSize}
                 />
              </div>
           </motion.div>

           <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible lg:gap-4 no-scrollbar">
             {[
               { label: 'LIFETIME OPS', value: profile.totalFeeds, color: 'text-cyan-400' },
               { label: 'BASE DEVIATION', value: `${averageDeviation.toFixed(3)}%`, color: averageDeviation > 0.5 ? 'text-rose-400' : 'text-white' },
               { label: 'SUCCESS RATIO', value: `${(profile.accuracyRate).toFixed(1)}%`, color: 'text-emerald-400' },
               { label: 'UPTIME RANK', value: profile.rank, color: 'text-amber-400' }
             ].map((stat, i) => (
                <div key={i} className="min-w-[148px] md:min-w-0 bg-black/60 border border-white/5 p-4 lg:p-6 rounded-2xl lg:rounded-3xl flex flex-col justify-center items-center text-center shadow-inner group">
                   <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black mb-2">{stat.label}</p>
                   <p className={`text-2xl font-black font-orbitron italic tracking-tighter ${stat.color} group-hover:scale-110 transition-transform`}>
                     {stat.value}
                   </p>
                </div>
             ))}
           </div>
        </div>

        {/* RIGHT COLUMN: Action Log */}
        <motion.div 
           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
           className="col-span-1 glass-panel border border-white/5 bg-[#0A0D12] rounded-[1.75rem] lg:rounded-[3rem] p-4 lg:p-8 relative shadow-2xl flex flex-col"
        >
           <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 flex items-center gap-2">
                <Activity size={12}/> Combat Log
              </h3>
              <div className="flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                 <span className="text-[9px] text-cyan-500 font-mono tracking-widest">LIVE REC</span>
              </div>
           </div>
           
           <div className="flex-1 relative">
             <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#0A0D12] to-transparent z-10 pointer-events-none" />
             <CombatLog history={history} />
             <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0A0D12] to-transparent z-10 pointer-events-none" />
           </div>
        </motion.div>
      </div>

      {/* 3. LOGISTICS & TREASURY */}
      <h2 className="text-[10px] uppercase font-black tracking-[0.28em] lg:tracking-[0.5em] text-slate-600 flex items-center gap-4 mt-8 ml-4">
        <HardDrive size={12} className="text-slate-500"/> Logistics Treasury <div className="h-px bg-white/5 flex-1" />
      </h2>
      
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {treasuryStats.map((item, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -5, scale: 1.01 }}
                 className={`p-4 lg:p-8 rounded-[1.5rem] lg:rounded-[2rem] bg-black/40 border border-white/5 flex items-start gap-4 lg:gap-5 shadow-lg relative overflow-hidden group cursor-crosshair`}
          >
            <div className={`p-4 rounded-xl bg-white/5 border border-white/10 group-hover:border-[currentColor]/30 transition-colors ${item.color}`}>
               {item.icon}
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-500 mb-2">{item.label}</p>
              <div className="flex items-baseline gap-2">
                 <p className={`text-2xl font-black font-orbitron italic tracking-tighter ${item.color}`}>
                   {item.value}
                 </p>
                 <span className="text-[10px] text-slate-600 font-black tracking-widest uppercase">{item.suffix}</span>
              </div>
            </div>
            
            <div className="absolute right-0 bottom-0 opacity-[0.02] text-9xl -translate-y-4 translate-x-4 pointer-events-none">
               {item.icon}
            </div>
          </motion.div>
        ))}
      </div>
      
    </div>
  );
};

const LockIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>;

export default DashboardView;
