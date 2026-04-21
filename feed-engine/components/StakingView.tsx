import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeederProfile } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import SystemLoader from './feedback/SystemLoader';
import SystemEmpty from './feedback/SystemEmpty';
import * as api from '../services/api';
import { Battery, BatteryCharging, Box, Lock, Unlock, Database, Hexagon, Crosshair, Cpu, TriangleAlert, Server, Activity, Fingerprint } from 'lucide-react';

type StakeType = 'FEED' | 'USDT' | 'NFT';

interface StakeRecord {
  id: string;
  stakeType: StakeType;
  amount: number;
  nftTokenId?: string | null;
  status: 'ACTIVE' | 'UNLOCKING' | 'WITHDRAWN' | 'SLASHED';
  createdAt: string;
  unlockAvailableAt?: string | null;
  unlockRequestedAt?: string | null;
}

interface LicenseInfo {
  id: string;
  tokenId: string;
  name: string;
  tier: string;
  maxRank: string;
  isStaked: boolean;
}

interface StakingSnapshot {
  currentStake: number;
  stakeType: StakeType;
  nftLicenseId?: string | null;
  rank: string;
  requirement?: { minStake: number; dailyLimit: number };
  nextRankRequirement?: { rank: string; minStake: number; additionalNeeded: number } | null;
  records: StakeRecord[];
}

// License Tiers -> Metallic Credit Card Textures
const licenseMetals: Record<string, string> = {
  BRONZE: 'from-amber-900/80 via-amber-700/60 to-black border-amber-700/40 text-amber-500',
  SILVER: 'from-slate-700/80 via-slate-500/60 to-black border-slate-500/40 text-slate-300',
  GOLD: 'from-yellow-600/80 via-yellow-400/60 to-black border-yellow-500/40 text-yellow-400',
  PLATINUM: 'from-indigo-600/80 via-cyan-500/50 to-black border-cyan-400/40 text-cyan-200',
  DIAMOND: 'from-sky-300/80 via-blue-400/60 to-white bg-blend-screen border-white/60 text-sky-900 shadow-[0_0_30px_rgba(125,211,252,0.3)]',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '--/--/----';
  return new Date(value).toLocaleString();
};

const StakingView: React.FC<{ profile: FeederProfile }> = ({ profile }) => {
  const { t } = useTranslation();
  const [stakeMode, setStakeMode] = useState<'stake' | 'withdraw'>('stake');
  const [mobileStakePanelOpen, setMobileStakePanelOpen] = useState(false);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [mobileLicenseOpen, setMobileLicenseOpen] = useState(false);
  const [stakeType, setStakeType] = useState<StakeType>('USDT');
  const [amount, setAmount] = useState('');
  const [selectedLicenseId, setSelectedLicenseId] = useState('');
  const [staking, setStaking] = useState<StakingSnapshot | null>(null);
  const [licenses, setLicenses] = useState<LicenseInfo[]>([]);
  const [requirements, setRequirements] = useState<Record<string, { minStake: number; dailyLimit: number }>>({});
  const [unlockCooldownDays, setUnlockCooldownDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [stakingRes, licenseRes, requirementRes] = await Promise.all([
        api.getStakingInfo(),
        api.getLicenseInfo(),
        api.getStakingRequirements(),
      ]);

      if (stakingRes.success) setStaking(stakingRes.staking ?? null);
      if (licenseRes.success) setLicenses((licenseRes.licenses ?? []) as LicenseInfo[]);
      if (requirementRes.success) {
        setRequirements(requirementRes.requirements ?? {});
        setUnlockCooldownDays(requirementRes.unlockCooldownDays ?? 30);
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Core linkage failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeRecords = useMemo(() => (staking?.records ?? []).filter((r) => r.status === 'ACTIVE'), [staking]);
  const unlockingRecords = useMemo(() => (staking?.records ?? []).filter((r) => r.status === 'UNLOCKING'), [staking]);
  const availableLicenseOptions = useMemo(() => licenses.filter((l) => !l.isStaked), [licenses]);

  const currentRequirement = staking?.requirement ?? requirements[staking?.rank ?? ''];
  const canSubmitStake = stakeType === 'NFT' ? Boolean(selectedLicenseId) : Number(amount) > 0;

  const handleStake = async () => {
    if (!canSubmitStake) {
      setError('SYS_ERR: Invalid payload for injection.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const selectedLicense = availableLicenseOptions.find((l) => l.id === selectedLicenseId);
      const res = await api.stakeTokens(
        stakeType === 'NFT' ? 0 : Number(amount),
        stakeType,
        undefined,
        selectedLicense?.tokenId,
      );

      if (res.success) {
        setMessage(stakeType === 'NFT' ? 'CORE INJECTED: Credential Linked.' : 'CORE INJECTED: Energy Stabilized.');
        setAmount('');
        setSelectedLicenseId('');
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Injection Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestUnlock = async (recordId: string) => {
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.requestUnlockStake(recordId);
      if (res.success) {
        setMessage('SYS_LOG: Payload unlock initiated. Awaiting buffer clearance.');
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Decryption sequence failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (recordId: string) => {
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.withdrawStake(recordId);
      if (res.success) {
        setMessage('SYS_LOG: Extraction successful. Cargo remitted to operator.');
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Extraction failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SystemLoader theme="cyan" message="SYS_SYNC: INITIALIZING CORE CONFINEMENT" subMessage="SECURING AUTHORIZATION TERMINAL" />;
  }

  // Energy Bar Logic
  const energyMax = staking?.nextRankRequirement 
    ? (staking.currentStake + staking.nextRankRequirement.additionalNeeded) 
    : (currentRequirement?.minStake || 1);
  const energyProgress = Math.min((staking?.currentStake ?? 0) / energyMax, 1);

  return (
    <div className="space-y-6 lg:space-y-10 max-w-[95rem] mx-auto pb-24">
      {/* 1. THE ENERGY CORE (HEADER) */}
      <header className="relative w-full rounded-[1.75rem] lg:rounded-[4rem] p-4 sm:p-5 lg:p-14 border border-cyan-500/20 overflow-hidden shadow-2xl flex flex-col xl:flex-row justify-between items-center gap-5 lg:gap-10 bg-[#02050A]">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-10 pointer-events-none" />
        <div className="absolute -left-40 -top-40 w-96 h-96 bg-cyan-900/30 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative z-10 w-full flex flex-col items-start space-y-4 max-w-xl">
           <div className="inline-flex items-center gap-3 px-4 py-2 border border-cyan-500/30 bg-cyan-500/10 rounded-full mb-2 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
             <Activity size={12} className="text-cyan-400" />
             <span className="text-[10px] uppercase font-black tracking-[0.4em] text-cyan-400">Core Authorization Unit</span>
           </div>
           <h2 className="text-3xl sm:text-4xl lg:text-6xl font-black font-orbitron tracking-tighter uppercase italic text-white leading-none">
             Station Power
           </h2>
           <p className="text-slate-400 text-sm font-bold uppercase tracking-widest leading-relaxed">
             Deploy protocol guarantees into the matrix to augment your clearance level.
           </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-6 w-full flex-1">
           <div className="bg-black border border-cyan-500/20 p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2.5rem] relative overflow-hidden flex flex-col items-center justify-center">
              <BatteryCharging size={60} className="absolute right-[-10px] bottom-[-10px] text-cyan-900/40 opacity-30 rotate-12" />
              <p className="text-[9px] uppercase font-black tracking-widest text-cyan-500 mb-2 z-10">Reactor Output</p>
              <p className="text-4xl font-black font-orbitron text-white z-10">{(staking?.currentStake ?? 0).toLocaleString()}</p>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 mt-2 z-10 font-bold">Base Type: {staking?.stakeType || profile.stakeType}</p>
           </div>

           <div className="bg-black/60 border border-white/5 p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2.5rem] flex flex-col items-center justify-center text-center">
              <p className="text-[9px] uppercase font-black tracking-widest text-slate-500 mb-2">Rank Threshold</p>
              <p className="text-3xl font-black font-orbitron text-slate-300">{currentRequirement?.minStake?.toLocaleString?.() ?? 0}</p>
              <p className="text-[9px] uppercase tracking-widest text-slate-600 mt-2 font-bold">Class {staking?.rank || profile.rank}</p>
           </div>

           <div className="col-span-2 md:col-span-1 bg-black/60 border border-rose-500/10 p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2.5rem] flex flex-col items-center justify-center text-center">
              <p className="text-[9px] uppercase font-black tracking-widest text-rose-500 mb-2">Buffer Lockout</p>
              <p className="text-3xl font-black font-orbitron text-rose-400">{unlockCooldownDays} <span className="text-lg">DAYS</span></p>
           </div>
        </div>
      </header>

      {/* Up-Rank Progress Bar */}
      {staking?.nextRankRequirement && (
        <div className="px-4 lg:px-10 py-5 lg:py-6 rounded-2xl lg:rounded-3xl bg-black border border-cyan-500/30 flex flex-col md:flex-row items-center gap-4 lg:gap-6">
           <div className="shrink-0">
             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Upgrade Vector</p>
             <p className="text-white font-orbitron font-black text-xl">TO RANK {staking.nextRankRequirement.rank}</p>
           </div>
           
           <div className="flex-1 w-full space-y-2">
             <div className="h-3 bg-slate-900 rounded-sm border border-slate-800 p-0.5 overflow-hidden flex gap-0.5">
                {[...Array(20)].map((_, i) => (
                   <div key={i} className={`flex-1 ${i / 20 < energyProgress ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-transparent'}`} />
                ))}
             </div>
             <p className="text-right text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-widest">
               {staking.nextRankRequirement.additionalNeeded.toLocaleString()} MORE ENERGY REQUIRED
             </p>
           </div>
        </div>
      )}

      {/* Error/Success Feed */}
      <AnimatePresence>
        {(message || error) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-2xl border px-4 lg:px-8 py-4 lg:py-5 text-xs font-black tracking-widest uppercase flex items-center gap-4 shadow-xl ${
              error ? 'border-rose-500/50 bg-rose-500/10 text-rose-400' : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
            }`}
          >
            {error ? <TriangleAlert size={16} /> : <Cpu size={16} />} {error || message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6 lg:gap-10">
        
        {/* LEFT COMPARTMENT: PAYLOADS & BUFFERS */}
        <div className="space-y-10">
          
          {/* Active Payloads */}
          <section className="space-y-6">
             <div className="flex items-center gap-4 px-4">
                <Box size={24} className="text-cyan-500" />
                <div>
                   <h3 className="text-sm font-black font-orbitron uppercase tracking-widest text-white">Active Cargo Payloads</h3>
                   <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Energy supplying current rank privileges.</p>
                </div>
             </div>

             <button
               type="button"
               onClick={() => setMobileStakePanelOpen((value) => !value)}
               className="lg:hidden w-full min-h-[48px] rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300"
             >
               {mobileStakePanelOpen ? 'Hide Active Payloads' : `Show Active Payloads (${activeRecords.length})`}
             </button>

             <div className={`${mobileStakePanelOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
               {activeRecords.length === 0 ? (
                 <div className="bg-black/50 border border-dashed border-white/10 rounded-[2rem] p-10 flex flex-col items-center justify-center text-slate-500">
                    <Database size={32} className="opacity-20 mb-3" />
                    <p className="font-orbitron font-black text-xs tracking-widest uppercase">Zero Active Payloads</p>
                 </div>
               ) : (
                 activeRecords.map((record) => (
                   <div key={record.id} className="bg-[#05070A] border border-cyan-500/20 rounded-[1.5rem] lg:rounded-[2rem] p-4 lg:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 lg:gap-6 group hover:border-cyan-500/50 transition-colors">
                      <div className="flex items-center gap-6">
                         <div className="w-16 h-16 rounded-2xl bg-cyan-950 flex flex-col items-center justify-center border border-cyan-500/30">
                            <Lock size={20} className="text-cyan-500 mb-1" />
                            <span className="text-[8px] font-black uppercase text-cyan-400">SEALED</span>
                         </div>
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{record.stakeType} ASSET</p>
                            <p className="text-xl font-bold font-orbitron text-white">
                                {record.stakeType === 'NFT' ? `ID ${record.nftTokenId}` : `${record.amount.toLocaleString()} Units`}
                            </p>
                            <p className="text-[9px] text-slate-600 font-mono tracking-widest mt-1 uppercase">SYNCED: {formatDateTime(record.createdAt)}</p>
                         </div>
                      </div>
            <button
onClick={() => handleRequestUnlock(record.id)}
disabled={submitting}
className="min-h-[48px] w-full md:w-auto px-6 lg:px-8 py-4 rounded-xl border border-cyan-500/30 text-cyan-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-cyan-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        [ INITIATE UNLOCK PROCEDURE ]
                      </button>
                   </div>
                 ))
               )}
             </div>
          </section>

          {/* Unlock Queue (Extraction Buffer) */}
          <section className="space-y-6">
             <div className="flex items-center gap-4 px-4 mt-8">
                <TriangleAlert size={24} className="text-rose-500" />
                <div>
                   <h3 className="text-sm font-black font-orbitron uppercase tracking-widest text-rose-500">Extraction Buffers</h3>
                   <p className="text-[10px] text-rose-500/60 uppercase tracking-widest mt-1">Cargo executing cooldown detachment protocols.</p>
                </div>
             </div>

             <button
               type="button"
               onClick={() => setMobileQueueOpen((value) => !value)}
               className="lg:hidden w-full min-h-[48px] rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 text-[10px] font-black uppercase tracking-[0.25em] text-rose-300"
             >
               {mobileQueueOpen ? 'Hide Extraction Queue' : `Show Extraction Queue (${unlockingRecords.length})`}
             </button>

             <div className={`${mobileQueueOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
               {unlockingRecords.length === 0 ? (
                 <div className="bg-black/50 border border-dashed border-rose-500/10 rounded-[2rem] p-10 flex flex-col items-center justify-center text-rose-900/50">
                    <Database size={32} className="opacity-40 mb-3" />
                    <p className="font-orbitron font-black text-xs tracking-widest uppercase">Buffer Clear</p>
                 </div>
               ) : (
                 unlockingRecords.map((record) => {
                   const unlockAt = record.unlockAvailableAt ? new Date(record.unlockAvailableAt) : null;
                   const canWithdraw = unlockAt ? unlockAt.getTime() <= Date.now() : false;

                   return (
                     <div key={record.id} className="bg-[#0A0505] border border-rose-500/30 rounded-[1.5rem] lg:rounded-[2rem] p-4 lg:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 lg:gap-6 relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                        <div className="flex items-center gap-6 relative z-10">
                           <div className="w-16 h-16 rounded-2xl bg-rose-950 flex flex-col items-center justify-center border border-rose-500/50">
                              <Unlock size={20} className="text-rose-500 mb-1 animate-pulse" />
                              <span className="text-[8px] font-black uppercase text-rose-400">FLUSHING</span>
                           </div>
                           <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500/70">{record.stakeType} ASSET</p>
                              <p className="text-xl font-bold font-orbitron text-rose-200">
                                  {record.stakeType === 'NFT' ? `ID ${record.nftTokenId}` : `${record.amount.toLocaleString()} Units`}
                              </p>
                              <p className="text-[9px] text-rose-400/60 font-mono tracking-widest mt-1 uppercase">ETA: {formatDateTime(record.unlockAvailableAt)}</p>
                           </div>
                        </div>
                        <button
                          onClick={() => handleWithdraw(record.id)}
                          disabled={submitting || !canWithdraw}
className="min-h-[48px] w-full md:w-auto relative z-10 px-6 lg:px-8 py-4 rounded-xl border border-rose-500 text-rose-300 font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(244,63,94,0.2)] disabled:opacity-30 disabled:shadow-none hover:bg-rose-500 hover:text-black transition-all"
                        >
                          {canWithdraw ? '[ EXTRACT ASSET ]' : 'SECURITY TIMER ACTIVE'}
                        </button>
                     </div>
                   );
                 })
               )}
             </div>
          </section>

          {/* Embedded NFT Licenses */}
          <section className="space-y-6 pt-10 border-t border-white/5">
             <div className="flex items-center gap-4 px-4">
                <Crosshair size={20} className="text-slate-500" />
                <h3 className="text-sm font-black font-orbitron uppercase tracking-widest text-slate-300">Identity Credentials (Licenses)</h3>
             </div>
             <button
               type="button"
               onClick={() => setMobileLicenseOpen((value) => !value)}
               className="lg:hidden w-full min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300"
             >
               {mobileLicenseOpen ? 'Hide Credentials' : `Show Credentials (${licenses.length})`}
             </button>

             {licenses.length === 0 ? (
                <div className="p-5 lg:p-8 border border-white/5 rounded-2xl text-slate-600 text-xs font-mono uppercase text-center bg-black/50">
                   No credentials synced to this terminal.
                </div>
             ) : (
                <div className={`${mobileLicenseOpen ? 'grid' : 'hidden'} lg:grid grid-cols-1 md:grid-cols-2 gap-4`}>
                   {licenses.map(license => {
                      const bg = licenseMetals[license.tier] || licenseMetals.SILVER;
                      return (
                         <div key={license.id} className={`p-6 rounded-[2rem] border bg-gradient-to-br ${bg} relative overflow-hidden group`}>
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-20 mix-blend-overlay pointer-events-none"/>
                            <div className="relative z-10 flex justify-between items-start">
                               <div>
                                  <Cpu size={20} className="mb-3 opacity-80" />
                                  <h4 className="font-black font-orbitron text-lg leading-none mb-1">{license.name}</h4>
                                  <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Tier {license.tier} | Cap Rank {license.maxRank}</p>
                               </div>
                               <span className={`px-2 py-1 rounded border text-[8px] font-black uppercase tracking-[0.2em] ${license.isStaked ? 'bg-black/60 border-current/30' : 'bg-white/20 border-white/40'}`}>
                                 {license.isStaked ? 'LOCKED' : 'READY'}
                               </span>
                            </div>
                         </div>
                      );
                   })}
                </div>
             )}
          </section>
        </div>

        {/* RIGHT COMPARTMENT: THE INJECTION TERMINAL */}
        <div className="xl:sticky xl:top-8 h-fit">
<div className="bg-[#050608] border border-cyan-500/30 rounded-[1.75rem] lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_0_50px_rgba(34,211,238,0.05)] relative overflow-hidden">
              <div className="absolute right-0 top-0 w-64 h-64 bg-cyan-900/10 blur-[100px] pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-8">
                 <Server className="text-cyan-500" size={24} />
                 <h3 className="text-xl font-black font-orbitron uppercase tracking-widest text-white">Injection Terminal</h3>
              </div>

              <div className="flex bg-black p-1.5 rounded-2xl border border-white/5 mb-10">
<button
onClick={() => setStakeMode('stake')}
className={`min-h-[48px] flex-1 py-3 lg:py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all ${stakeMode === 'stake' ? 'bg-cyan-950/60 border border-cyan-500/30 text-cyan-400' : 'text-slate-600 hover:text-white'}`}
                >
                  Load Asset
                </button>
<button
onClick={() => setStakeMode('withdraw')}
className={`min-h-[48px] flex-1 py-3 lg:py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all ${stakeMode === 'withdraw' ? 'bg-rose-950/40 border border-rose-500/30 text-rose-400' : 'text-slate-600 hover:text-white'}`}
                >
                  Remote Extract
                </button>
              </div>

              {stakeMode === 'stake' ? (
                <div className="space-y-10 relative z-10">
                  <div className="space-y-4">
                    <label className="text-[10px] text-cyan-500/70 font-black uppercase tracking-[0.3em] flex items-center gap-2">
                       <Hexagon size={12} /> Target Asset Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['USDT', 'FEED', 'NFT'] as StakeType[]).map((option) => (
                        <button
                          key={option}
                          onClick={() => setStakeType(option)}
                          className={`rounded-2xl border px-2 py-5 text-sm font-black font-orbitron transition-all ${stakeType === option ? 'border-cyan-500 bg-cyan-500 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:scale-105' : 'border-white/10 bg-black/40 text-slate-500 hover:border-white/30'}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  {stakeType === 'NFT' ? (
                    <div className="space-y-4">
                      <label className="text-[10px] text-cyan-500/70 font-black uppercase tracking-[0.3em] flex items-center gap-2">
                         <Fingerprint size={12} /> Secure Credential Port
                      </label>
                      <select
                        value={selectedLicenseId}
                        onChange={(e) => setSelectedLicenseId(e.target.value)}
className="min-h-[52px] w-full bg-black border-2 border-cyan-500/20 rounded-2xl px-5 lg:px-6 py-4 lg:py-6 text-white font-black tracking-widest uppercase outline-none focus:border-cyan-500 cursor-pointer appearance-none"
                      >
                        <option value="" className="text-slate-600">Select Linked Identity Card</option>
                        {availableLicenseOptions.map((l) => (
                          <option key={l.id} value={l.id}>{l.name} [{l.tier}]</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <label className="text-[10px] text-cyan-500/70 font-black uppercase tracking-[0.3em] flex items-center gap-2">
                         <Activity size={12} /> Energy Volume Allocation
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="100"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="000,000"
className="min-h-[64px] w-full bg-black border-2 border-cyan-500/20 rounded-2xl px-5 lg:px-8 py-5 lg:py-8 text-3xl lg:text-4xl font-black font-orbitron outline-none focus:border-cyan-500 text-cyan-400 placeholder-cyan-900 transition-colors"
                        />
<span className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 text-cyan-900 border border-cyan-900/50 px-3 lg:px-4 py-2 rounded-lg font-black">{stakeType}</span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/5 bg-black/50 p-6 flex items-center gap-4 text-slate-400">
                     <Database size={24} className="opacity-50 shrink-0" />
                     <div className="text-xs font-mono uppercase tracking-widest space-y-1">
                        <p>Available Balance: <span className="text-white">{profile.balanceUSDT.toLocaleString()} USDT</span> / <span className="text-white">{profile.balanceFEED.toLocaleString()} FEED</span></p>
                        <p>Required Base Rank Threshold: <span className="text-white">{(currentRequirement?.minStake ?? 0).toLocaleString()}</span></p>
                     </div>
                  </div>

                  <button
                    onClick={handleStake}
                    disabled={submitting || !canSubmitStake}
className="min-h-[56px] w-full py-4 lg:py-8 mt-4 rounded-2xl lg:rounded-3xl font-black font-orbitron text-lg lg:text-2xl uppercase tracking-widest bg-cyan-500 text-black shadow-[0_0_50px_rgba(34,211,238,0.4)] hover:bg-cyan-400 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:active:scale-100"
                  >
                    [ INITIALIZE CORE INJECTION ]
                  </button>
                </div>
              ) : (
                <div className="space-y-8 relative z-10 text-center py-10">
                   <TriangleAlert size={48} className="text-rose-500/50 mx-auto mb-4" />
                   <p className="text-rose-400 font-bold uppercase tracking-widest text-sm">Remote Extraction Procedure</p>
                   <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                     Identify target buffer from the Extraction Queue. Standard detachment protocols apply. Overriding structural cooldown is strictly prohibited.
                   </p>
                </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default StakingView;
