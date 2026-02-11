import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as api from '../services/api';

const RANK_COLORS: Record<string, string> = {
  'S': 'text-amber-400',
  'A': 'text-purple-400',
  'B': 'text-cyan-400',
  'C': 'text-emerald-400',
  'D': 'text-blue-400',
  'E': 'text-slate-400',
  'F': 'text-slate-500'
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

const LeaderboardView: React.FC = () => {
  const [season, setSeason] = useState<Season | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<{ overall: number; feeds: number; accuracy: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'OVERALL' | 'FEEDS' | 'ACCURACY'>('OVERALL');
  const [rewards, setRewards] = useState<Record<string, any>>({});

  const tabs = [
    { key: 'OVERALL', label: '综合排名', icon: '🏆' },
    { key: 'FEEDS', label: '喂价数量', icon: '📊' },
    { key: 'ACCURACY', label: '准确率', icon: '🎯' }
  ];

  useEffect(() => {
    loadCurrentSeason();
  }, []);

  useEffect(() => {
    if (season) {
      loadLeaderboard();
    }
  }, [season, activeTab]);

  const loadCurrentSeason = async () => {
    try {
      const res = await api.getCurrentSeason();
      if (res.success && res.season) {
        setSeason(res.season);

        // 加载奖励信息
        const rewardsRes = await api.getSeasonRewards(res.season.code);
        if (rewardsRes.success && rewardsRes.rewards) {
          setRewards(rewardsRes.rewards);
        }
      }
    } catch (error) {
      console.error('Load season error:', error);
      // Mock 数据
      setSeason({
        code: '2026-01',
        name: '2026年1月赛季',
        status: 'ACTIVE',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
  };

  const loadLeaderboard = async () => {
    if (!season) return;

    try {
      setLoading(true);
      const [leaderboardRes, myRankRes] = await Promise.all([
        api.getSeasonLeaderboard(season.code, activeTab, 50),
        api.getMySeasonRank(season.code)
      ]);

      if (leaderboardRes.success && leaderboardRes.leaderboard) {
        setLeaderboard(leaderboardRes.leaderboard);
      }
      if (myRankRes.success && myRankRes.ranks) {
        setMyRank(myRankRes.ranks);
      }
    } catch (error) {
      console.error('Load leaderboard error:', error);
      // Mock 数据
      setLeaderboard([
        { id: '1', address: '0x1234...abcd', nickname: 'OracleKing', rank: 'S', xp: 125800, totalFeeds: 2456, accuracyRate: 99.2, position: 1 },
        { id: '2', address: '0x5678...efgh', nickname: 'PriceMaster', rank: 'A', xp: 98500, totalFeeds: 1892, accuracyRate: 98.7, position: 2 },
        { id: '3', address: '0x9abc...ijkl', nickname: 'FeedHunter', rank: 'A', xp: 87200, totalFeeds: 1654, accuracyRate: 97.5, position: 3 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getRemainingTime = () => {
    if (!season) return '';
    const end = new Date(season.endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return '赛季已结束';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}天${hours}小时`;
  };

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase">SEASON LEADERBOARD</h2>
          <p className="text-slate-500">{season?.name || '加载中...'} · 剩余 {getRemainingTime()}</p>
        </div>
        <div className="px-6 py-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
          <p className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">奖池总额</p>
          <p className="text-xl font-black font-orbitron text-white">250,000 <span className="text-sm">FEED</span></p>
        </div>
      </header>

      {/* 我的排名 */}
      {myRank && (
        <div className="glass-panel rounded-2xl p-6">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4">我的赛季排名</p>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-4xl font-black font-orbitron text-cyan-400">#{myRank.overall}</p>
              <p className="text-sm text-slate-400">综合排名</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-black font-orbitron text-amber-400">#{myRank.feeds}</p>
              <p className="text-sm text-slate-400">喂价数量</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-black font-orbitron text-emerald-400">#{myRank.accuracy}</p>
              <p className="text-sm text-slate-400">准确率</p>
            </div>
          </div>
        </div>
      )}

      {/* 排行榜类型切换 */}
      <div className="flex gap-3">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${activeTab === tab.key
              ? 'bg-cyan-500 text-black'
              : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* 排行榜 */}
      <div className="grid grid-cols-1 gap-4">
        {/* Header Row */}
        <div className="px-10 py-4 grid grid-cols-12 text-xs font-black text-slate-500 uppercase tracking-widest">
          <div className="col-span-1">排名</div>
          <div className="col-span-4">喂价员</div>
          <div className="col-span-2">等级</div>
          <div className="col-span-2">{activeTab === 'FEEDS' ? '喂价数' : activeTab === 'ACCURACY' ? '准确率' : 'XP'}</div>
          <div className="col-span-3 text-right">赛季奖励</div>
        </div>

        {/* User List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((user, index) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-1 px-10 rounded-[2rem] glass-panel border border-white/5 flex items-center min-h-[80px] grid grid-cols-12 group hover:border-cyan-500/30 transition-all ${index === 0 ? 'bg-amber-500/5 border-amber-500/20' :
                  index === 1 ? 'bg-slate-400/5 border-slate-400/20' :
                    index === 2 ? 'bg-orange-500/5 border-orange-500/20' : ''
                  }`}
              >
                <div className={`col-span-1 font-orbitron font-black text-2xl ${index === 0 ? 'text-amber-400' :
                  index === 1 ? 'text-slate-300' :
                    index === 2 ? 'text-orange-400' : 'text-slate-600'
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
                <div className={`col-span-2 font-black text-sm uppercase ${RANK_COLORS[user.rank]}`}>
                  {user.rank} Class
                </div>
                <div className="col-span-2 font-bold font-orbitron text-white">
                  {activeTab === 'FEEDS' ? user.totalFeeds.toLocaleString() :
                    activeTab === 'ACCURACY' ? `${user.accuracyRate}%` :
                      user.xp.toLocaleString()}
                </div>
                <div className="col-span-3 text-right">
                  {index < 3 && (
                    <span className="text-amber-400 font-bold">
                      {index === 0 ? '🥇 5,000 FEED' : index === 1 ? '🥈 3,000 FEED' : '🥉 3,000 FEED'}
                    </span>
                  )}
                  {index >= 3 && index < 10 && (
                    <span className="text-slate-400">1,500 FEED</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <footer className="p-10 rounded-[3rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center space-y-4">
        <p className="text-slate-500 text-sm font-medium">排行榜每小时更新一次</p>
        <button className="text-cyan-500 font-bold hover:underline">查看完整 TOP 1000</button>
      </footer>
    </div>
  );
};

export default LeaderboardView;
