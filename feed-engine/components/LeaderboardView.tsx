import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import * as api from '../services/api';
import { useTranslation } from '../i18n';

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
  id: string;
  address: string;
  nickname?: string;
  rank: string;
  xp: number;
  totalFeeds: number;
  accuracyRate: number;
  position: number;
}

interface RewardConfigEntry {
  feed?: number;
  xp?: number;
  nft?: boolean;
}

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
    { key: 'OVERALL', label: t.leaderboard.tabOverall, icon: 'OVR' },
    { key: 'FEEDS', label: t.leaderboard.tabFeeds, icon: 'FDS' },
    { key: 'ACCURACY', label: t.leaderboard.tabAccuracy, icon: 'ACC' },
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

      if (!res.success || !res.season) {
        throw new Error('Failed to load current season');
      }

      setSeason(res.season);

      const rewardsRes = await api.getSeasonRewards(res.season.code);
      if (rewardsRes.success && rewardsRes.rewards) {
        setRewards(rewardsRes.rewards as Record<string, RewardConfigEntry>);
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
    return Object.values(rewards).reduce((sum, reward) => sum + (reward.feed ?? 0), 0);
  }, [rewards]);

  const getRemainingTime = () => {
    if (!season) return '--';
    const end = new Date(season.endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return 'closed';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  const getRewardForPosition = (position: number) => {
    for (const [key, value] of Object.entries(rewards)) {
      if (key.includes('-')) {
        const [start, end] = key.split('-').map(Number);
        if (position >= start && position <= end) {
          return value;
        }
      } else if (Number(key) === position) {
        return value;
      }
    }
    return null;
  };

  const formatReward = (position: number) => {
    const reward = getRewardForPosition(position);
    if (!reward) return '--';

    const parts: string[] = [];
    if (reward.feed) parts.push(`${reward.feed.toLocaleString()} FEED`);
    if (reward.xp) parts.push(`${reward.xp.toLocaleString()} XP`);
    if (reward.nft) parts.push('NFT');
    return parts.join(' | ');
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase">{t.leaderboard.seasonTitle}</h2>
          <p className="text-slate-500">
            {season ? `${season.name} | ${t.leaderboard.remaining} ${getRemainingTime()}` : 'No active season data'}
          </p>
        </div>
        <div className="px-6 py-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
          <p className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">{t.leaderboard.poolTotal}</p>
          <p className="text-xl font-black font-orbitron text-white">
            {totalPool > 0 ? totalPool.toLocaleString() : '--'} <span className="text-sm">FEED</span>
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {myRank && (
        <div className="glass-panel rounded-2xl p-6">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4">{t.leaderboard.myRank}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-4xl font-black font-orbitron text-cyan-400">#{myRank.overall}</p>
              <p className="text-sm text-slate-400">{t.leaderboard.overallRank}</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-black font-orbitron text-amber-400">#{myRank.feeds}</p>
              <p className="text-sm text-slate-400">{t.leaderboard.feedCount}</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-black font-orbitron text-emerald-400">#{myRank.accuracy}</p>
              <p className="text-sm text-slate-400">{t.leaderboard.accuracyRate}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'OVERALL' | 'FEEDS' | 'ACCURACY')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === tab.key ? 'bg-cyan-500 text-black' : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {seasonLoading || loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      ) : !season ? (
        <div className="rounded-[2rem] border border-dashed border-white/10 px-6 py-12 text-center text-slate-500">
          No active season is available right now.
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-white/10 px-6 py-12 text-center text-slate-500">
          No leaderboard entries are available for this season yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="px-10 py-4 grid grid-cols-12 text-xs font-black text-slate-500 uppercase tracking-widest">
            <div className="col-span-1">{t.leaderboard.rank}</div>
            <div className="col-span-4">{t.leaderboard.feeder}</div>
            <div className="col-span-2">{t.leaderboard.rank}</div>
            <div className="col-span-2">
              {activeTab === 'FEEDS' ? t.leaderboard.feedCount : activeTab === 'ACCURACY' ? t.leaderboard.accuracyRate : t.leaderboard.xp}
            </div>
            <div className="col-span-3 text-right">{t.leaderboard.seasonReward}</div>
          </div>

          <div className="space-y-3">
            {leaderboard.map((user, index) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-1 px-10 rounded-[2rem] glass-panel border border-white/5 flex items-center min-h-[80px] grid grid-cols-12 group hover:border-cyan-500/30 transition-all ${
                  index === 0
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : index === 1
                      ? 'bg-slate-400/5 border-slate-400/20'
                      : index === 2
                        ? 'bg-orange-500/5 border-orange-500/20'
                        : ''
                }`}
              >
                <div className={`col-span-1 font-orbitron font-black text-2xl ${
                  index === 0
                    ? 'text-amber-400'
                    : index === 1
                      ? 'text-slate-300'
                      : index === 2
                        ? 'text-orange-400'
                        : 'text-slate-600'
                } group-hover:text-cyan-400 transition-colors`}>
                  #{user.position}
                </div>
                <div className="col-span-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center overflow-hidden border border-white/10">
                    <img src="/assets/images/owl-mascot-v3.png" alt="avatar" />
                  </div>
                  <div>
                    <p className="font-bold text-lg group-hover:text-white transition-colors">{user.nickname || 'Anonymous'}</p>
                    <p className="text-[10px] text-slate-500 font-mono uppercase">{user.address}</p>
                  </div>
                </div>
                <div className={`col-span-2 font-black text-sm uppercase ${RANK_COLORS[user.rank] || 'text-slate-400'}`}>
                  {user.rank} Class
                </div>
                <div className="col-span-2 font-bold font-orbitron text-white">
                  {activeTab === 'FEEDS'
                    ? user.totalFeeds.toLocaleString()
                    : activeTab === 'ACCURACY'
                      ? `${user.accuracyRate}%`
                      : user.xp.toLocaleString()}
                </div>
                <div className="col-span-3 text-right">
                  <span className={`${index < 3 ? 'text-amber-400' : 'text-slate-400'} font-bold`}>
                    {formatReward(user.position)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <footer className="p-10 rounded-[3rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center space-y-4">
        <p className="text-slate-500 text-sm font-medium">{t.leaderboard.updatedHourly}</p>
        <button className="text-cyan-500 font-bold hover:underline">{t.leaderboard.viewFullTop}</button>
      </footer>
    </div>
  );
};

export default LeaderboardView;
