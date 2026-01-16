
import React from 'react';
import { FeedOrder, OrderStatus } from '../types';
import { MARKET_ICONS } from '../constants';
import { motion } from 'framer-motion';

interface OrderCardProps {
  order: FeedOrder;
  onGrab: (orderId: string) => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onGrab }) => {
  const isLargeOrder = order.notionalAmount >= 1000000;
  const headerImage = `https://picsum.photos/seed/${order.symbol}/800/450`;

  return (
    <motion.div 
      onClick={() => onGrab(order.orderId)}
      className="cosmic-card relative h-[560px] flex flex-col overflow-hidden cursor-pointer group shadow-2xl"
    >
      {/* Visual Header */}
      <div className="h-3/5 relative overflow-hidden">
        <img 
          src={headerImage} 
          className="w-full h-full object-cover group-hover:scale-125 transition-transform duration-[2s] brightness-75 group-hover:brightness-110" 
          alt="quest header" 
        />
        
        {/* Animated Scanline Overlay */}
        <div className="absolute inset-0 bg-white/10 w-full h-[2px] animate-scan opacity-0 group-hover:opacity-100 z-10" />
        
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1E] via-transparent to-black/20"></div>
        
        {/* Floating Mascot Avatar */}
        <div className="absolute bottom-[-50px] left-12 w-28 h-28 rounded-[2.5rem] bg-[#0A0F1E] border-4 border-cyan-500/20 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex items-center justify-center overflow-hidden z-20 group-hover:border-cyan-400 group-hover:scale-110 transition-all duration-500">
           <img src={`https://picsum.photos/seed/${order.orderId}/200/200`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt="mascot" />
           <div className="absolute inset-0 bg-cyan-500/5 mix-blend-overlay" />
        </div>

        {/* Floating System Badges */}
        <div className="absolute top-10 right-10 flex flex-col items-end gap-3 z-20">
           <div className="px-6 py-2 rounded-xl bg-black/80 border border-cyan-500/30 backdrop-blur-xl text-[9px] font-black font-orbitron text-cyan-400 uppercase tracking-[0.3em] shadow-lg">
              {order.exchange} // {order.market}
           </div>
           {isLargeOrder && (
             <motion.div 
               animate={{ opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="px-4 py-1.5 rounded-lg bg-amber-500 text-black text-[8px] font-black uppercase tracking-widest italic"
             >
                High Risk Signal
             </motion.div>
           )}
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 p-12 pt-20 flex flex-col justify-between relative bg-gradient-to-b from-transparent to-cyan-900/5">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-4xl font-black font-orbitron text-white italic tracking-tighter uppercase glow-text group-hover:text-cyan-400 transition-colors">
              {order.symbol.split('.')[0]} HUB
            </h3>
            <div className="text-slate-700 font-black text-xs opacity-40 group-hover:opacity-100 transition-opacity">
              #{order.orderId.split('-')[1]}
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium leading-relaxed italic opacity-70 group-hover:opacity-100 transition-opacity line-clamp-2">
            Initiate deep computational handshake for {order.symbol}. Verify cryptographic proof of state across multi-exchange cross-links.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-10">
           <div className="flex items-center gap-10">
              <div className="space-y-1.5">
                 <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">Bounty</p>
                 <p className="text-2xl font-black font-orbitron text-cyan-400 tracking-tighter italic glow-cyan">{order.rewardAmount} <span className="text-xs opacity-40">FEED</span></p>
              </div>
              <div className="w-px h-12 bg-white/10"></div>
              <div className="space-y-1.5">
                 <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">Quorum</p>
                 <p className="text-2xl font-black font-orbitron text-white tracking-tighter italic">{order.consensusThreshold}</p>
              </div>
           </div>
           
           <motion.div 
             whileHover={{ rotate: 15, scale: 1.2 }}
             className="w-16 h-16 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center text-4xl group-hover:border-cyan-500/50 group-hover:bg-cyan-500/20 group-hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] transition-all duration-500"
           >
             {MARKET_ICONS[order.market]}
           </motion.div>
        </div>
      </div>

      {/* Animated Corners */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/10 group-hover:border-cyan-500/40 rounded-tl-[3.5rem] transition-colors" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/10 group-hover:border-cyan-500/40 rounded-br-[3.5rem] transition-colors" />

      {/* Internal Glare Effect */}
      <motion.div 
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -skew-x-12 pointer-events-none"
      />
    </motion.div>
  );
};

export default OrderCard;
