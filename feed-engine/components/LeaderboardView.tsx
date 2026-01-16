
import React from 'react';
import { MOCK_LEADERBOARD, RANK_COLORS } from '../constants';
import { motion } from 'framer-motion';

const LeaderboardView: React.FC = () => {
  return (
    <div className="space-y-10">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase">SEASON LEADERBOARD</h2>
          <p className="text-slate-500">Elite feeders competing for the #1 zenith crown</p>
        </div>
        <div className="px-6 py-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
          <p className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">Reward Pool</p>
          <p className="text-xl font-black font-orbitron text-white">250,000 <span className="text-sm">FEED</span></p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {/* Header Row */}
        <div className="px-10 py-4 grid grid-cols-12 text-xs font-black text-slate-500 uppercase tracking-widest">
           <div className="col-span-1">Rank</div>
           <div className="col-span-4">Feeder Identity</div>
           <div className="col-span-2">Class</div>
           <div className="col-span-2">Points (XP)</div>
           <div className="col-span-1">Feeds</div>
           <div className="col-span-2 text-right">Accuracy</div>
        </div>

        {/* User List */}
        <div className="space-y-3">
          {MOCK_LEADERBOARD.map((user, index) => (
            <motion.div 
              key={user.address}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-1 px-10 rounded-[2rem] glass-panel border border-white/5 flex items-center min-h-[80px] grid grid-cols-12 group hover:border-cyan-500/30 transition-all ${index === 0 ? 'bg-cyan-500/5 border-cyan-500/20' : ''}`}
            >
              <div className="col-span-1 font-orbitron font-black text-2xl text-slate-600 group-hover:text-cyan-400 transition-colors">
                #{index + 1}
              </div>
              <div className="col-span-4 flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center overflow-hidden border border-white/10">
                    <img src={`https://picsum.photos/seed/${user.address}/100/100`} alt="avatar" />
                 </div>
                 <div>
                    <p className="font-bold text-lg group-hover:text-white transition-colors">{user.nickname}</p>
                    <p className="text-[10px] text-slate-500 font-mono uppercase">{user.address}</p>
                 </div>
              </div>
              <div className={`col-span-2 font-black text-sm uppercase ${RANK_COLORS[user.rank]}`}>
                {user.rank} Class
              </div>
              <div className="col-span-2 font-bold font-orbitron text-white">
                {user.xp.toLocaleString()}
              </div>
              <div className="col-span-1 text-slate-400 font-medium">
                {user.feeds}
              </div>
              <div className="col-span-2 text-right">
                 <div className="inline-flex items-center gap-2 text-emerald-400 font-bold font-orbitron text-lg">
                    {user.accuracy}%
                    <span className="text-[10px] text-emerald-500">▲</span>
                 </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <footer className="p-10 rounded-[3rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center space-y-4">
         <p className="text-slate-500 text-sm font-medium">Next rankings update in 4 hours...</p>
         <button className="text-cyan-500 font-bold hover:underline">VIEW FULL TOP 1000</button>
      </footer>
    </div>
  );
};

export default LeaderboardView;
