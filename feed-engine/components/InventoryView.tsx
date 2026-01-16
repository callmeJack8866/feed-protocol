
import React from 'react';
import { motion } from 'framer-motion';

const InventoryView: React.FC = () => {
  const items = [
    { name: 'S-CLASS LICENSE', type: 'LICENSE', id: 'LIC-9921', color: 'rose', rarity: 'LEGENDARY', desc: 'Full access to Master Zone and Arbitration rights.' },
    { name: 'US STOCKS AUTHORITY', type: 'MARKET', id: 'MKT-112', color: 'cyan', rarity: 'RARE', desc: 'Verified status for NYSE and NASDAQ oracle queries.' },
    { name: 'CRYPTO VETERAN', type: 'MARKET', id: 'MKT-004', color: 'emerald', rarity: 'UNCOMMON', desc: 'Expertise in high-volatility decentralized market data.' },
    { name: 'ZENITH SEASON 11', type: 'BADGE', id: 'BDG-S11', color: 'purple', rarity: 'LIMITED', desc: 'Top 100 finish in Season 11 leaderboard.' },
    { name: 'EARLY ADOPTER', type: 'BADGE', id: 'BDG-EA', color: 'amber', rarity: 'SPECIAL', desc: 'Founding member of the manual oracle network.' },
  ];

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter italic uppercase">PROTOCOL VAULT</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Digital Licenses & Reputation Signatures</p>
        </div>
        <div className="flex gap-4">
           <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-center">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total Value</p>
              <p className="text-sm font-black font-orbitron">12.5k FEED</p>
           </div>
           <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-center">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Assets</p>
              <p className="text-sm font-black font-orbitron">5 / 20</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
        {items.map((item, idx) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            whileHover={{ y: -12 }}
            className={`group relative aspect-[3/4.5] rounded-[2.5rem] overflow-hidden border transition-all duration-500 bg-slate-900 shadow-2xl flex flex-col ${
              item.color === 'rose' ? 'border-rose-500/30 hover:shadow-rose-500/20' : 
              item.color === 'cyan' ? 'border-cyan-500/30 hover:shadow-cyan-500/20' :
              item.color === 'emerald' ? 'border-emerald-500/30 hover:shadow-emerald-500/20' :
              item.color === 'purple' ? 'border-purple-500/30 hover:shadow-purple-500/20' :
              'border-white/10 hover:shadow-white/10'
            }`}
          >
             {/* Holographic shimmer effect */}
             <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.08] opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
             
             <div className="p-8 pb-0 flex justify-between items-start z-10">
                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest border border-white/10 bg-black/40 ${
                  item.color === 'rose' ? 'text-rose-400 border-rose-500/20' : 'text-slate-400'
                }`}>{item.rarity}</span>
                <span className="text-[10px] font-mono text-slate-700">#{item.id.split('-')[1]}</span>
             </div>

             <div className="flex-1 flex flex-col items-center justify-center p-8 z-10">
                <div className={`w-36 h-36 rounded-full flex items-center justify-center relative ${
                  item.color === 'rose' ? 'bg-rose-500/10 shadow-[0_0_50px_rgba(244,63,94,0.1)]' :
                  item.color === 'cyan' ? 'bg-cyan-500/10 shadow-[0_0_50px_rgba(34,211,238,0.1)]' :
                  item.color === 'emerald' ? 'bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.1)]' :
                  'bg-white/5'
                }`}>
                   <div className="text-5xl group-hover:scale-110 transition-transform duration-500">
                     {item.type === 'LICENSE' ? '🎖️' : item.type === 'MARKET' ? '💹' : '🏅'}
                   </div>
                   {/* Animated rings */}
                   <motion.div 
                     animate={{ rotate: 360 }}
                     transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                     className={`absolute inset-0 border border-dashed rounded-full ${
                       item.color === 'rose' ? 'border-rose-500/20' : 'border-white/5'
                     }`}
                   />
                </div>
             </div>

             <div className="p-8 space-y-4 bg-black/20 backdrop-blur-md border-t border-white/5 z-10">
                <div className="space-y-1">
                   <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{item.type}</p>
                   <h3 className="text-lg font-bold font-orbitron group-hover:text-white transition-colors">{item.name}</h3>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                <button className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-colors">
                  View Signature
                </button>
             </div>
          </motion.div>
        ))}

        {/* Add more button */}
        <button className="aspect-[3/4.5] rounded-[2.5rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center space-y-4 hover:border-white/20 hover:bg-white/[0.01] transition-all group">
           <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-3xl text-slate-700 group-hover:text-slate-500 transition-colors">＋</span>
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 group-hover:text-slate-500">Mint Credential</span>
        </button>
      </div>
    </div>
  );
};

export default InventoryView;
