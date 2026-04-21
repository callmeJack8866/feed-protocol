import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';
import * as api from '../services/api';
import { Cpu, Fingerprint, Database, TriangleAlert, Box, HardDrive, Zap, Code2, Hexagon, Crosshair } from 'lucide-react';
import SystemLoader from './feedback/SystemLoader';
import SystemEmpty from './feedback/SystemEmpty';
interface LicenseAsset {
  id: string;
  tokenId: string;
  name: string;
  tier: string;
  maxRank: string;
  dailyLimit: number;
  feeDiscount: number;
  isStaked: boolean;
  ownerAddress?: string | null;
}

interface BadgeAsset {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  unlockedAt?: string;
}

// -------------------------------------------------------------
// Visual Asset Dictionaries
// -------------------------------------------------------------

// License Tiers -> Metallic Credit Card Textures
const licenseMetals: Record<string, string> = {
  BRONZE: 'from-amber-900/80 via-amber-700/60 to-black border-amber-700/40 text-amber-500',
  SILVER: 'from-slate-700/80 via-slate-500/60 to-black border-slate-500/40 text-slate-300',
  GOLD: 'from-yellow-600/80 via-yellow-400/60 to-black border-yellow-500/40 text-yellow-400',
  PLATINUM: 'from-indigo-600/80 via-cyan-500/50 to-black border-cyan-400/40 text-cyan-200',
  DIAMOND: 'from-sky-300/80 via-blue-400/60 to-white bg-blend-screen border-white/60 text-sky-900 shadow-[0_0_30px_rgba(125,211,252,0.3)]',
};

// Rarity -> Glowing Trophy Box Textures
const rarityGlows: Record<string, string> = {
  COMMON: 'shadow-[inset_0_0_40px_rgba(100,116,139,0.1)] border-slate-500/30 text-slate-400',
  RARE: 'shadow-[inset_0_0_60px_rgba(59,130,246,0.2)] border-blue-500/50 text-blue-400',
  EPIC: 'shadow-[inset_0_0_80px_rgba(217,70,239,0.3),0_0_30px_rgba(217,70,239,0.2)] border-fuchsia-500/50 text-fuchsia-400',
  LEGENDARY: 'shadow-[inset_0_0_100px_rgba(245,158,11,0.4),0_0_50px_rgba(245,158,11,0.3)] border-amber-500/70 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]',
};

const formatDate = (value?: string) => {
  if (!value) return '--/--/----';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const InventoryView: React.FC = () => {
  const { t } = useTranslation();
  const [licenses, setLicenses] = useState<LicenseAsset[]>([]);
  const [badges, setBadges] = useState<BadgeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadInventory = async (runSync = false) => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      if (runSync) {
        try {
          await api.syncNFTs();
          setMessage('SYS_LOG: Reg-Sync complete.');
        } catch (syncError: any) {
          setError(syncError.message || 'SYS_ERR: Sync failed.');
        }
      }

      const [licenseRes, achievementsRes] = await Promise.all([
        api.getLicenseInfo(),
        api.getMyAchievements(),
      ]);

      if (licenseRes.success) setLicenses((licenseRes.licenses ?? []) as LicenseAsset[]);

      if (achievementsRes.success) {
        setBadges(
          (achievementsRes.achievements ?? [])
            .filter((a: any) => a.unlocked)
            .map((a: any) => ({ ...a }))
        );
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Inventory corrupted.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory(false);
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await loadInventory(true);
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !syncing) {
    return <SystemLoader theme="emerald" message="SYS_SYNC: MOUNTING VAULT CORE" subMessage="DECRYPTING ON-CHAIN NFT INVENTORY" />;
  }

  return (
    <div className="space-y-6 lg:space-y-12 max-w-[90rem] mx-auto pb-24">
      
      {/* 1. VAULT STATUS CONSOLE (Header) */}
      <header className="relative w-full rounded-[1.75rem] lg:rounded-[3rem] p-4 sm:p-5 lg:p-14 border border-white/10 overflow-hidden shadow-2xl flex flex-col xl:flex-row justify-between items-center gap-5 lg:gap-10 bg-[#06080C]">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex-1 w-full text-center xl:text-left space-y-3">
          <div className="inline-flex items-center gap-3 px-4 py-2 border border-cyan-500/20 bg-cyan-500/5 rounded-full mb-2">
            <Database size={12} className="text-cyan-400" />
            <span className="text-[10px] uppercase font-black tracking-[0.4em] text-cyan-400">Secure Vault Access</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-7xl font-black font-orbitron tracking-tighter uppercase italic text-white leading-none">
            {t.inventory.protocolVault}
          </h2>
          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.24em] lg:tracking-[0.5em] italic ml-2 mt-2">
            Asset & Qualification Repository
          </p>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-stretch md:items-center gap-4 lg:gap-6 w-full xl:w-auto">
          {/* Summary Block */}
          <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:justify-center md:gap-8 min-w-0 md:min-w-[280px]">
             <div className="h-full rounded-[1.5rem] lg:rounded-[2rem] border border-white/5 bg-black/40 p-4 text-center lg:p-8">
               <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Licenses</p>
               <p className="font-orbitron text-3xl font-black text-cyan-400">{licenses.length}</p>
             </div>
             <div className="h-full rounded-[1.5rem] lg:rounded-[2rem] border border-white/5 bg-black/40 p-4 text-center lg:p-8">
               <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Badges</p>
               <p className="font-orbitron text-3xl font-black text-amber-400">{badges.length}</p>
             </div>
          </div>

          {/* Sync Trigger */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="min-h-[56px] p-4 lg:p-8 rounded-[1.5rem] lg:rounded-[2rem] bg-cyan-900/20 border border-cyan-500/30 flex flex-row md:flex-col items-center justify-center gap-3 md:gap-0 min-w-0 md:min-w-[200px] hover:bg-cyan-900/40 hover:border-cyan-400 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] transition-all group relative overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-x-0 h-1 bg-cyan-500 top-0 shadow-[0_0_15px_rgba(34,211,238,1)] opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent -translate-x-[200%] group-hover:animate-[scan_1.5s_ease-in-out_infinite]" />
            {syncing ? (
              <Code2 size={24} className="text-cyan-400 mb-2 animate-pulse" />
            ) : (
              <HardDrive size={24} className="text-cyan-500 mb-2 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-[10px] text-cyan-400 font-black font-orbitron uppercase tracking-[0.3em] relative z-10 group-hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
               {syncing ? '[ QUERYING ]' : '[ SCAN NFT REGISTRY ]'}
            </span>
          </button>
        </div>
      </header>

      {/* Message Output */}
      <AnimatePresence>
        {(message || error) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-2xl border px-4 lg:px-8 py-4 lg:py-5 text-xs font-black tracking-widest uppercase flex items-center gap-4 shadow-xl ${
              error ? 'border-rose-500/50 bg-rose-500/10 text-rose-400' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
            }`}
          >
            <Code2 size={16} /> {error || message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. THE LICENSES (CREDENTIAL CARDS) */}
      <section className="space-y-8 relative">
        <div className="flex items-center gap-4">
           <Fingerprint className="text-slate-500" size={20} />
           <h3 className="text-[10px] lg:text-xs font-black uppercase tracking-[0.28em] lg:tracking-[0.5em] text-slate-300">Identity Credentials (Licenses)</h3>
           <div className="flex-1 h-px bg-white/10" />
        </div>

        {licenses.length === 0 ? (
          <div className="rounded-[1.75rem] lg:rounded-[4rem] border-2 border-dashed border-rose-500/20 bg-[#0a0505] p-10 lg:p-20 flex flex-col items-center justify-center space-y-6 text-rose-500/50 relative overflow-hidden">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-[0.03]" />
             <TriangleAlert size={52} className="lg:w-16 lg:h-16 opacity-40" />
             <div className="text-center">
                 <p className="text-base lg:text-xl font-black font-orbitron uppercase tracking-widest">404: CREDENTIAL NOT FOUND</p>
                 <p className="text-[10px] uppercase font-mono tracking-[0.3em] mt-2">Zero operational licenses registered to this address.</p>
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
            {licenses.map((license, index) => {
              const bg = licenseMetals[license.tier] || licenseMetals.SILVER;
              const isDiamond = license.tier === 'DIAMOND';

              return (
                <motion.div
                  key={license.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative p-5 lg:p-10 rounded-[1.75rem] lg:rounded-[2.5rem] border overflow-hidden flex flex-col md:flex-row items-stretch gap-5 lg:gap-8 group bg-gradient-to-br ${bg} glass-panel shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] shadow-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-cyan-500/10`}
                >
                   {/* Holographic glare overlay */}
                   <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] skew-x-[-30deg] group-hover:animate-[scan_1.5s_ease-in-out_infinite]" />
                   <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-20 mix-blend-overlay pointer-events-none"/>

                   {/* Left side: Chip & Core Ident */}
                   <div className="flex flex-col justify-between border-current/20 md:border-r md:pr-8 shrink-0 relative z-10 w-full md:w-auto text-center md:text-left border-b md:border-b-0 pb-5 md:pb-0">
                      <div>
                         <div className={`w-12 h-16 rounded-xl border border-current/30 flex items-center justify-center mx-auto md:mx-0 mb-4 ${isDiamond ? 'bg-white/20' : 'bg-black/30'}`}>
                            <Cpu size={24} className="opacity-80"/>
                         </div>
                         <p className="text-[9px] font-black uppercase tracking-[0.4em] opacity-60 mb-2">Class</p>
                         <h4 className="text-2xl lg:text-3xl font-black font-orbitron uppercase tracking-tighter leading-none">{license.tier}</h4>
                      </div>
                      <div className="mt-8">
                         <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${license.isStaked ? 'bg-black/40 border border-current/30' : 'bg-emerald-500 border border-emerald-400 text-black'}`}>
                           {license.isStaked ? 'STAKED / LOCKED' : 'AVAILABLE'}
                         </span>
                      </div>
                   </div>

                   {/* Right side: Telemetry Data */}
                   <div className="flex-1 flex flex-col justify-center space-y-4 relative z-10">
                      <div className="flex justify-between items-end mb-4">
                         <div>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Operative Identity</p>
                            <p className="text-xl font-black">{license.name}</p>
                         </div>
                         <Crosshair size={32} className="opacity-20" />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                         <div className="bg-black/20 rounded-xl p-3 border border-current/10">
                            <p className="text-[8px] uppercase font-black tracking-widest opacity-60 mb-1">Max Rank</p>
                            <p className="text-sm lg:text-lg font-black font-orbitron">{license.maxRank}</p>
                         </div>
                         <div className="bg-black/20 rounded-xl p-3 border border-current/10">
                            <p className="text-[8px] uppercase font-black tracking-widest opacity-60 mb-1">Daily Cap</p>
                            <p className="text-sm lg:text-lg font-black font-orbitron">{license.dailyLimit}</p>
                         </div>
                         <div className="bg-black/20 rounded-xl p-3 border border-current/10">
                            <p className="text-[8px] uppercase font-black tracking-widest opacity-60 mb-1">Discount</p>
                            <p className="text-sm lg:text-lg font-black font-orbitron">{license.feeDiscount}%</p>
                         </div>
                      </div>

                      <div className="pt-4 mt-2 border-t border-current/20 flex justify-between items-center opacity-70">
                         <p className="font-mono text-[10px] tracking-widest uppercase">ID: {license.tokenId}</p>
                         <Hexagon size={12} />
                      </div>
                   </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. THE BADGES (TROPHY BOXES) */}
      <section className="space-y-8 relative pt-10">
        <div className="flex items-center gap-4">
           <Box className="text-slate-500" size={20} />
           <h3 className="text-[10px] lg:text-xs font-black uppercase tracking-[0.28em] lg:tracking-[0.5em] text-slate-300">Trophy Collections (Badges)</h3>
           <div className="flex-1 h-px bg-white/10" />
        </div>

        {badges.length === 0 ? (
          <div className="rounded-[1.75rem] lg:rounded-[4rem] border-2 border-dashed border-white/10 bg-[#06080A] p-10 lg:p-20 flex flex-col items-center justify-center space-y-6 text-slate-500/50">
             <Box size={52} className="lg:w-16 lg:h-16 opacity-40" />
             <div className="text-center">
                 <p className="text-base lg:text-xl font-black font-orbitron uppercase tracking-widest text-slate-500">CABINET EMPTY</p>
                 <p className="text-[10px] uppercase font-mono tracking-[0.3em] mt-2">No achievements preserved in local cache.</p>
             </div>
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-6">
            {badges.map((badge, index) => {
              const glow = rarityGlows[badge.rarity] || rarityGlows.COMMON;
              return (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
            className={`aspect-square relative rounded-2xl lg:rounded-3xl border bg-[#030406] flex flex-col items-center justify-center group overflow-hidden ${glow}`}
                >
                   {/* Bottom light emitter inside the "box" */}
                   <div className="absolute -bottom-10 inset-x-0 h-20 bg-current opacity-20 blur-[30px]" />
                   
                   {/* The floating icon */}
                   <div className="text-4xl lg:text-6xl group-hover:scale-110 group-hover:-translate-y-2 transition-transform duration-500 relative z-10 drop-shadow-2xl">
                     {badge.icon || 'TROPHY'}
                   </div>

                   {/* Rarity & Name Plate at bottom */}
                   <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col items-center bg-black/60 backdrop-blur border-t border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">{badge.rarity}</p>
                      <p className="text-sm font-bold text-white truncate w-full text-center">{badge.name}</p>
                   </div>
                   
                   {/* Hover Date Overlay */}
                   <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-end">
                      <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">EXTRACTED</p>
                      <p className="text-[9px] font-mono text-white">{formatDate(badge.unlockedAt)}</p>
                   </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
};

export default InventoryView;

