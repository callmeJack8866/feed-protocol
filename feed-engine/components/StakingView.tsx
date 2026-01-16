
import React, { useState } from 'react';
import { FeederProfile } from '../types';
import { motion } from 'framer-motion';

const StakingView: React.FC<{ profile: FeederProfile }> = ({ profile }) => {
  const [stakeMode, setStakeMode] = useState<'stake' | 'withdraw'>('stake');
  
  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase italic">STAKING & COLLATERAL</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Secure your position in the oracle network and insure the protocol</p>
        </div>
        <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
           <div className="text-right">
              <p className="text-[10px] text-slate-500 font-black uppercase">Season End</p>
              <p className="text-sm font-black font-orbitron text-rose-500">12D 14H 21M</p>
           </div>
           <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">⌛</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           {/* Stake Overview */}
           <div className="p-10 rounded-[3rem] glass-panel border border-emerald-500/20 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative z-10 flex flex-col md:flex-row justify-between gap-10">
                 <div className="space-y-8">
                    <div>
                       <p className="text-xs text-slate-500 uppercase font-black tracking-widest mb-1">Your Active Guarantee</p>
                       <div className="flex items-baseline gap-3">
                          <h3 className="text-6xl font-black font-orbitron text-white italic tracking-tighter">{profile.stakedAmount.toLocaleString()}</h3>
                          <span className="text-xl text-emerald-400 font-black">USDT</span>
                       </div>
                    </div>
                    <div className="flex gap-10">
                       <div className="space-y-1">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Protocol Trust</p>
                          <p className="text-xl font-black font-orbitron text-white">98.4%</p>
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Market Status</p>
                          <p className="text-xl font-black font-orbitron text-emerald-400">ACTIVE</p>
                       </div>
                    </div>
                 </div>

                 <div className="w-full md:w-64 p-8 bg-black/40 rounded-[2.5rem] border border-white/5 space-y-6 flex flex-col justify-center">
                    <div className="space-y-1 text-center">
                       <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Withdrawal Cooldown</p>
                       <p className="text-3xl font-black font-orbitron text-white">30 <span className="text-sm opacity-50 uppercase tracking-tighter italic">Days</span></p>
                    </div>
                    <button className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-black uppercase tracking-[0.2em] transition-all">
                       INITIATE UNSTAKE
                    </button>
                 </div>
              </div>
           </div>

           {/* Risk Visualization */}
           <div className="p-8 rounded-[3rem] glass-panel border border-rose-500/20 bg-rose-500/[0.02]">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xs font-black text-rose-500 uppercase tracking-widest px-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                    Slashing Risk Visualization
                 </h3>
                 <span className="text-[10px] text-slate-500 font-black uppercase">Low Exposure</span>
              </div>
              <div className="flex items-end gap-1 h-24 mb-6">
                 {[10, 15, 8, 12, 45, 20, 15, 10, 5, 8, 12, 10, 5, 2].map((v, i) => (
                   <motion.div 
                     key={i}
                     initial={{ height: 0 }}
                     animate={{ height: `${v}%` }}
                     className={`flex-1 rounded-t-sm ${i === 4 ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' : 'bg-slate-800'}`}
                   />
                 ))}
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium text-center">
                 Your reputation score currently offsets <strong>95%</strong> of collateral volatility risks. 
                 <span className="text-emerald-500 ml-1">Safe Zone.</span>
              </p>
           </div>

           {/* Staking Tiers Info */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { tier: 'Basic', amount: 100, access: 'Beginner Zone', color: 'slate' },
                { tier: 'Pro', amount: 1000, access: 'Competitive Zone', color: 'cyan' },
                { tier: 'Elite', amount: 10000, access: 'Arbitration Rights', color: 'rose' }
              ].map(tier => (
                <div key={tier.tier} className={`p-8 rounded-[2.5rem] glass-panel border group hover:scale-[1.02] transition-transform ${
                  tier.color === 'rose' ? 'border-rose-500/20' : 
                  tier.color === 'cyan' ? 'border-cyan-500/20' : 'border-white/5'
                }`}>
                   <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{tier.tier} Requirement</p>
                   <p className={`text-3xl font-black font-orbitron group-hover:scale-110 transition-transform origin-left ${
                     tier.color === 'rose' ? 'text-rose-400' : 
                     tier.color === 'cyan' ? 'text-cyan-400' : 'text-white'
                   }`}>${tier.amount.toLocaleString()}</p>
                   <p className="text-[10px] text-slate-600 font-bold mt-2 uppercase tracking-tighter italic">{tier.access}</p>
                </div>
              ))}
           </div>
        </div>

        {/* Action Panel */}
        <div className="p-10 rounded-[3.5rem] glass-panel border border-white/10 space-y-10 flex flex-col justify-between">
           <div className="space-y-8">
              <div className="flex bg-slate-900/80 p-1.5 rounded-[1.8rem] border border-white/5">
                <button 
                  onClick={() => setStakeMode('stake')}
                  className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${stakeMode === 'stake' ? 'bg-cyan-500 text-black shadow-xl shadow-cyan-500/20' : 'text-slate-500 hover:text-white'}`}
                >
                  DEPOSIT
                </button>
                <button 
                  onClick={() => setStakeMode('withdraw')}
                  className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${stakeMode === 'withdraw' ? 'bg-cyan-500 text-black shadow-xl shadow-cyan-500/20' : 'text-slate-500 hover:text-white'}`}
                >
                  WITHDRAW
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest px-1">Amount to {stakeMode}</label>
                <div className="relative group">
                   <input 
                     type="number"
                     placeholder="0.00"
                     className="w-full bg-black/40 border border-white/10 rounded-3xl px-8 py-6 text-3xl font-orbitron outline-none focus:border-cyan-500 focus:ring-8 focus:ring-cyan-500/5 transition-all text-white"
                   />
                   <span className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-600 font-black text-sm">USDT</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-black uppercase tracking-widest px-1">
                   <span>Available: ${profile.balanceUSDT.toLocaleString()}</span>
                   <button className="text-cyan-500 hover:text-cyan-400 transition-colors">MAX</button>
                </div>
              </div>
           </div>

           <div className="space-y-6">
              <div className="p-6 bg-rose-500/5 rounded-3xl border border-rose-500/10 space-y-3">
                 <div className="flex gap-4">
                    <span className="text-xl">⚖️</span>
                    <p className="text-[9px] text-rose-500/80 leading-relaxed font-black uppercase tracking-tight">
                       Oracle collateral is used as a final settlement guarantee. Malicious feeding results in immediate slashing via Judicial Chamber consensus.
                    </p>
                 </div>
              </div>

              <button className={`w-full py-6 rounded-[2.2rem] font-black font-orbitron text-lg transition-all shadow-2xl active:scale-95 italic ${
                stakeMode === 'stake' ? 'bg-cyan-500 text-black shadow-cyan-500/30 hover:bg-cyan-400' : 'bg-white/10 text-white hover:bg-white/20'
              }`}>
                {stakeMode === 'stake' ? 'INITIALIZE STAKE' : 'REQUEST RELEASE'}
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default StakingView;
