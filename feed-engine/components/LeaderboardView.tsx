import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useTranslation } from '../i18n';
import { Trophy, Target, Zap, Clock, Crown, Award, Hexagon, ChevronRight, Crosshair, ChevronDown } from 'lucide-react';

const RANK_COLORS: Record<string, string> = {
  S: 'text-amber-400',
  A: 'text-fuchsia-400',
  B: 'text-cyan-400',
  C: 'text-emerald-400',
  D: 'text-blue-400',
  E: 'text-slate-400',
  F: 'text-slate-500',
};

interface Season {
  code: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface LeaderboardEntry {
  feederId: string;
  address: string;
  nickname?: string;
  rank: string;
  totalXp: number;
  feeds: number;
  accuracy: number;
  position: number;
  reward?: number;
  stakedAmount?: number;
  rankType?: string;
}

interface RewardConfigEntry {
  feed?: number;
  xp?: number;
  nft?: boolean;
}

// -------------------------------------------------------------
// UI Helper: Render individual high-fidelity tags for rewards
// -------------------------------------------------------------
const RewardTags = ({ reward }: { reward: RewardConfigEntry | null }) => {
  if (!reward) return <span className="text-slate-600 font-mono text-xs">--</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {reward.feed ? (
        <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
          <Hexagon size={10} className="text-amber-400" />
          <span className="text-amber-400 font-black font-orbitron text-[10px] tracking-widest">{reward.feed.toLocaleString()} FEED</span>
        </span>
      ) : null}
      {reward.xp ? (
        <span className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded flex items-center gap-1.5 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
          <Zap size={10} className="text-cyan-400" />
          <span className="text-cyan-400 font-black text-[10px] tracking-widest">{reward.xp.toLocaleString()} XP</span>
        </span>
      ) : null}
      {reward.nft ? (
        <span className="px-2 py-1 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded flex items-center gap-1.5 shadow-[0_0_10px_rgba(217,70,239,0.1)]">
          <Award size={10} className="text-fuchsia-400" />
          <span className="text-fuchsia-400 font-black text-[10px] tracking-widest">NFT</span>
        </span>
      ) : null}
    </div>
  );
};

const LeaderboardView: React.FC = () => {
  const { t } = useTranslation();
  const [season, setSeason] = useState<Season | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<{ overall: number; feeds: number; accuracy: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonLoading, setSeasonLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'OVERALL' | 'FEEDS' | 'ACCURACY'>('OVERALL');
  const [rewards, setRewards] = useState<Record<string, RewardConfigEntry>>({});
  const [error, setError] = useState('');

  const tabs = [
    { key: 'OVERALL', label: t.leaderboard.tabOverall, icon: <Trophy size={16} /> },
    { key: 'FEEDS', label: t.leaderboard.tabFeeds, icon: <Zap size={16} /> },
    { key: 'ACCURACY', label: t.leaderboard.tabAccuracy, icon: <Target size={16} /> },
  ];

  useEffect(() => {
    void loadCurrentSeason();
  }, []);

  useEffect(() => {
    if (season) {
      void loadLeaderboard();
    } else {
      setLeaderboard([]);
      setMyRank(null);
      setLoading(false);
    }
  }, [season, activeTab]);

  const loadCurrentSeason = async () => {
    try {
      setSeasonLoading(true);
      setError('');
      const res = await api.getCurrentSeason();
      if (!res.success || !res.season) throw new Error('Failed to load current season');

      setSeason(res.season);
      const rewardsRes = await api.getSeasonRewards(res.season.code);
      if (rewardsRes.success && rewardsRes.rewards) {
        setRewards(rewardsRes.rewards as unknown as Record<string, RewardConfigEntry>);
      } else {
        setRewards({});
      }
    } catch (seasonError: any) {
      console.error('Load season error:', seasonError);
      setSeason(null);
      setRewards({});
      setError(seasonError.message || 'Failed to load season data.');
    } finally {
      setSeasonLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    if (!season) return;
    try {
      setLoading(true);
      setError('');
      const [leaderboardRes, myRankRes] = await Promise.all([
        api.getSeasonLeaderboard(season.code, activeTab, 50),
        api.getMySeasonRank(season.code),
      ]);
      setLeaderboard(leaderboardRes.success && leaderboardRes.leaderboard ? leaderboardRes.leaderboard : []);
      setMyRank(myRankRes.success && myRankRes.ranks ? myRankRes.ranks : null);
    } catch (leaderboardError: any) {
      console.error('Load leaderboard error:', leaderboardError);
      setLeaderboard([]);
      setMyRank(null);
      setError(leaderboardError.message || 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
    }
  };

  const totalPool = useMemo(() => {
    return (Object.values(rewards) as RewardConfigEntry[]).reduce<number>((sum, reward) => sum + (reward.feed ?? 0), 0);
  }, [rewards]);

  const getRemainingTime = () => {
    if (!season) return '--';
    const end = new Date(season.endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return 'FINISHED';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}D : ${String(hours).padStart(2,'0')}H`;
  };

  const getRewardForPosition = (position: number): RewardConfigEntry | null => {
    for (const [key, value] of Object.entries(rewards)) {
      if (key.includes('-')) {
        const [start, end] = key.split('-').map(Number);
        if (position >= start && position <= end) return value;
      } else if (Number(key) === position) {
        return value;
      }
    }
    return null;
  };

  // Podium (Top 3) vs Roster Split
  const podiumEntries = leaderboard.slice(0, 3);
  const rosterEntries = leaderboard.slice(3);

  const getPodiumStyle = (pos: number) => {
     if (pos === 1) return { ring: 'border-amber-400', glow: 'shadow-[0_0_40px_rgba(245,158,11,0.2)]', text: 'text-amber-400', bg: 'bg-amber-400/5', crown: true };
     if (pos === 2) return { ring: 'border-slate-300', glow: 'shadow-[0_0_20px_rgba(203,213,225,0.1)]', text: 'text-slate-300', bg: 'bg-slate-300/5', crown: false };
     if (pos === 3) return { ring: 'border-orange-500', glow: 'shadow-[0_0_20px_rgba(249,115,22,0.1)]', text: 'text-orange-500', bg: 'bg-orange-500/5', crown: false };
     return { ring: '', glow: '', text: '', bg: '', crown: false };
  };

  return (
    <div className="space-y-6 lg:space-y-10 max-w-[90rem] mx-auto pb-24 lg:pb-20">
      
      {/* 1. SEASON TOURNAMENT BANNER */}
      <header className="relative w-full rounded-[1.75rem] lg:rounded-[3rem] p-4 sm:p-5 lg:p-14 border border-white/10 overflow-hidden shadow-2xl flex flex-col xl:flex-row justify-between items-center gap-5 lg:gap-10 bg-[#06080C]">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-10 pointer-events-none" />
        <div className="absolute -top-[200px] -left-[200px] w-[500px] h-[500px] bg-cyan-500/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-[200px] -right-[200px] w-[500px] h-[500px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex-1 w-full text-center xl:text-left space-y-3 lg:space-y-4">
           <div className="inline-flex items-center gap-3 px-4 py-2 border border-cyan-500/30 bg-cyan-500/10 rounded-full mb-2">
              <Clock size={12} className="text-cyan-400 animate-pulse"/>
              <span className="text-[10px] uppercase font-black tracking-widest text-cyan-400">Time to Phase Shift: {getRemainingTime()}</span>
           </div>
           <h2 className="text-3xl sm:text-4xl lg:text-7xl font-black font-orbitron tracking-tighter uppercase italic text-white drop-shadow-md leading-none">
              {season ? season.name : 'AWAITING SEASON'}
           </h2>
           <p className="text-slate-500 text-xs uppercase tracking-[0.24em] lg:tracking-[0.5em] font-black italic ml-2">
             Operative Ranking Matrix
           </p>
        </div>

        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-row items-stretch gap-3 lg:gap-6 w-full xl:w-auto">
           {/* Global Prize Pool Badge */}
           <div className="p-5 lg:p-8 border border-amber-500/20 bg-amber-500/5 rounded-[1.5rem] lg:rounded-[2.5rem] flex flex-col items-center justify-center min-w-0 md:min-w-[240px] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/0 via-amber-500/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
              <Crown size={24} className="text-amber-500 mb-3" />
              <p className="text-[10px] text-amber-500/70 font-black uppercase tracking-widest mb-1">Total Prize Pool</p>
              <p className="text-2xl lg:text-4xl font-black font-orbitron italic text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                 {totalPool > 0 ? totalPool.toLocaleString() : '--'} <span className="text-base text-amber-500/50">FEED</span>
              </p>
           </div>
           
           {/* Personal Profile Slice */}
           {myRank && (
              <div className="p-5 lg:p-8 border border-white/5 bg-white/5 rounded-[1.5rem] lg:rounded-[2.5rem] flex flex-col justify-center min-w-0 md:min-w-[280px]">
                 <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Target size={12} /> My Profile Readiness
                 </p>
                 <div className="flex items-center justify-between gap-6">
                    <div>
                       <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">OVR Rank</p>
                       <p className="text-3xl font-black font-orbitron text-cyan-400">#{myRank.overall}</p>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                       <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Feeds</p>
                       <p className="text-xl font-black font-orbitron text-amber-400">#{myRank.feeds}</p>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                       <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Acc</p>
                       <p className="text-xl font-black font-orbitron text-emerald-400">#{myRank.accuracy}</p>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-center p-4 border border-rose-500/30 bg-rose-500/10 rounded-xl text-rose-400 text-xs font-black tracking-widest uppercase">
          ERR: {error}
        </div>
      )}

      {/* 2. TOURNAMENT CATEGORY SWITCHES */}
      <div className="flex gap-3 overflow-x-auto border-b border-white/5 pb-4 lg:pb-6 no-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`min-w-[150px] lg:min-w-0 lg:flex-1 flex flex-col items-center justify-center py-4 lg:py-6 px-4 rounded-2xl lg:rounded-3xl font-black transition-all relative overflow-hidden group ${
                isActive ? 'bg-cyan-500/10 border-cyan-500/30 border shadow-[0_0_20px_rgba(34,211,238,0.1)] text-cyan-400' : 'bg-white/[0.02] border-white/5 border text-slate-500 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              {isActive && (
                <motion.div layoutId="tab-highlight" className="absolute bottom-0 inset-x-0 h-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]" />
              )}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />
              <div className="flex items-center gap-2 lg:gap-3 relative z-10 uppercase tracking-[0.18em] lg:tracking-[0.3em] text-xs lg:text-sm group-hover:scale-105 transition-transform">
                {tab.icon} {tab.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* 3. CONTENT AREA */}
      <div className="min-h-[360px] lg:min-h-[500px]">
         {seasonLoading || loading ? (
           <div className="flex flex-col items-center justify-center py-32 space-y-4">
             <div className="relative w-16 h-16">
               <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full" />
             </div>
             <p className="text-cyan-500 text-[10px] font-black uppercase tracking-[0.5em] animate-pulse">Syncing Leaderboard</p>
           </div>
         ) : !season ? (
           <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/10 rounded-[3rem] text-slate-500">
             <Trophy size={48} className="mb-4 opacity-50" />
             <p className="text-xs uppercase tracking-[0.4em] font-black">NO ACTIVE TOURNAMENT</p>
           </div>
         ) : leaderboard.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/10 rounded-[3rem] text-slate-500">
             <Crosshair size={48} className="mb-4 opacity-50" />
             <p className="text-xs uppercase tracking-[0.4em] font-black">AWAITING CONTENDERS</p>
           </div>
         ) : (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 lg:space-y-12">
             
             {/* THE PODIUM (Top 3) */}
             {podiumEntries.length > 0 && (
                <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible items-stretch md:items-end no-scrollbar">
                   {podiumEntries.map((user, i) => {
                      const style = getPodiumStyle(user.position);
                      // Custom layout for visual hierarchy (2, 1, 3 typical podium alignment if desktop, but simple grid is better for responsive data density)
                      return (
                        <motion.div 
                          key={user.feederId}
                          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                          className={`relative min-w-[260px] md:min-w-0 flex flex-col items-center p-5 lg:p-8 rounded-[2rem] lg:rounded-[3rem] border ${style.ring} ${style.bg} ${style.glow} group overflow-hidden ${user.position === 1 ? 'md:scale-[1.05] md:z-10 animate-[pulse_4s_ease-in-out_infinite]' : ''}`}
                        >
                           <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />
                           
                           {style.crown && <Crown size={32} className={`mb-2 ${style.text} absolute top-6 right-6 opacity-20 group-hover:opacity-100 transition-opacity`} />}
                           
                           <div className="mb-6 relative">
                              <div className={`w-24 h-24 rounded-full border-4 ${style.ring} bg-black flex items-center justify-center relative z-10 overflow-hidden`}>
                                 <img src="/assets/images/owl-mascot-v3.png" alt="Avatar" className="w-[120%] h-[120%] opacity-80" />
                              </div>
                              <div className={`absolute bottom-[-10px] left-1/2 -translate-x-1/2 px-4 py-1 rounded border border-black font-black font-orbitron italic text-lg shadow-xl bg-black ${style.text} z-20`}>
                                 #{user.position}
                              </div>
                           </div>

                           <div className="text-center space-y-1 relative z-10 w-full mb-6">
                              <p className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors truncate">{user.nickname || 'Anonymous'}</p>
                              <p className="text-[9px] text-slate-500 font-mono tracking-widest uppercase truncate">{user.address}</p>
                           </div>

                           <div className="w-full flex justify-between items-center bg-black/60 rounded-xl p-4 border border-white/5 relative z-10 mb-6">
                              <div className="space-y-1">
                                 <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">
                                    {activeTab === 'FEEDS' ? 'Total Feeds' : activeTab === 'ACCURACY' ? 'Accuracy' : 'Power (XP)'}
                                 </p>
                                 <p className="text-2xl font-black font-orbitron text-white italic">
                                    {activeTab === 'FEEDS' ? user.feeds.toLocaleString() : activeTab === 'ACCURACY' ? `${user.accuracy}%` : user.totalXp.toLocaleString()}
                                 </p>
                              </div>
                              <div className="text-right">
                                 <span className={`text-[9px] font-black uppercase tracking-widest border border-white/10 px-2 py-1 rounded bg-black shadow-inner ${RANK_COLORS[user.rank] || 'text-slate-400'}`}>
                                    {user.rank} CLASS
                                 </span>
                              </div>
                           </div>
                           
                           <div className="relative z-10 w-full pt-4 border-t border-white/10 mt-auto">
                              <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest text-center mb-3">Locked Protocol Bounty</p>
                              <div className="flex justify-center w-full">
                                <RewardTags reward={getRewardForPosition(user.position)} />
                              </div>
                           </div>
                        </motion.div>
                      );
                   })}
                </div>
             )}

             {/* THE ROSTER (Rank 4+) */}
             {rosterEntries.length > 0 && (
                <div className="glass-panel border border-white/5 rounded-[1.75rem] lg:rounded-[3rem] p-3 lg:p-10 shadow-2xl relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
                   
                   <div className="px-6 py-4 flex flex-wrap lg:grid lg:grid-cols-12 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 border-b border-white/5">
                     <div className="hidden lg:block lg:col-span-1">RANK</div>
                     <div className="hidden lg:block lg:col-span-4">OPERATIVE</div>
                     <div className="hidden lg:block lg:col-span-2">CLASS</div>
                     <div className="hidden lg:block lg:col-span-2">
                       {activeTab === 'FEEDS' ? 'FEEDS' : activeTab === 'ACCURACY' ? 'ACCURACY' : 'POWER (XP)'}
                     </div>
                     <div className="hidden lg:block lg:col-span-3 text-right">SECURED BOUNTY</div>
                   </div>

                  <div className="space-y-2 relative z-10">
                     {rosterEntries.map((user, index) => (
                       <motion.div
                         key={user.feederId}
                         initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}
                         className="p-4 lg:px-6 rounded-[1.35rem] lg:rounded-[2rem] bg-black/40 border border-white/5 flex flex-col lg:grid lg:grid-cols-12 items-center gap-3 lg:gap-4 group hover:bg-white/[0.03] hover:border-l-[3px] hover:border-l-cyan-400 hover:border-t-cyan-500/30 hover:border-r-cyan-500/30 hover:border-b-cyan-500/30 transition-all duration-300 lg:hover:translate-x-2 cursor-crosshair relative overflow-hidden"
                       >
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/[0.05] to-transparent -translate-x-[200%] group-hover:animate-[scan_1s_ease-in-out]" />

                         <div className="lg:col-span-1 font-orbitron font-black text-xl text-slate-500 group-hover:text-cyan-400 transition-colors w-full lg:w-auto text-center lg:text-left">
                           #{user.position}
                         </div>

                         <div className="lg:col-span-4 flex w-full lg:w-auto items-center gap-4 justify-center lg:justify-start">
                           <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden shrink-0">
                             <img src="/assets/images/owl-mascot-v3.png" alt="avatar" className="w-full h-full object-cover" />
                           </div>
                           <div className="flex-1 min-w-0 text-center lg:text-left">
                             <p className="font-bold text-sm text-slate-300 group-hover:text-white truncate">{user.nickname || 'Anonymous'}</p>
                             <p className="text-[9px] text-slate-600 font-mono uppercase truncate">{user.address}</p>
                           </div>
                         </div>

                         <div className="lg:col-span-2 font-black text-[11px] uppercase text-center lg:text-left w-full lg:w-auto">
                           <span className={`px-2 py-1 rounded bg-white/5 ${RANK_COLORS[user.rank] || 'text-slate-400'}`}>
                              {user.rank}
                           </span>
                         </div>

                         <div className="lg:hidden w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                           <div className="flex items-center justify-between gap-3">
                             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                               {activeTab === 'FEEDS' ? 'Feeds' : activeTab === 'ACCURACY' ? 'Accuracy' : 'Power'}
                             </span>
                             <span className="font-orbitron text-lg font-black text-white">
                               {activeTab === 'FEEDS' ? user.feeds.toLocaleString() : activeTab === 'ACCURACY' ? `${user.accuracy}%` : user.totalXp.toLocaleString()}
                             </span>
                           </div>
                         </div>

                         <div className="hidden lg:block lg:col-span-2 font-bold font-orbitron text-white text-lg w-full lg:w-auto text-center lg:text-left">
                           {activeTab === 'FEEDS' ? user.feeds.toLocaleString() : activeTab === 'ACCURACY' ? `${user.accuracy}%` : user.totalXp.toLocaleString()}
                         </div>

                         <div className="lg:col-span-3 lg:justify-end flex w-full justify-center lg:w-auto">
                           <RewardTags reward={getRewardForPosition(user.position)} />
                         </div>
                       </motion.div>
                     ))}
                   </div>
                </div>
             )}

             <div className="flex justify-center pt-8">
                <ChevronDown className="text-slate-600 animate-bounce" size={24} />
             </div>
           </motion.div>
         )}
      </div>

    </div>
  );
};

export default LeaderboardView;
