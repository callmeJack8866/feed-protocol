import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ShieldCheck, Zap, X } from 'lucide-react';

export type RewardType = 'RANK_UP' | 'ACHIEVEMENT_UNLOCK' | 'MISSION_SUCCESS';

interface RewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: RewardType;
  title: string;
  subtitle?: string;
  value?: string; // e.g. "DIAMOND CLASS" or "1000 XTTA"
}

const themeData = {
  RANK_UP: {
    color: 'emerald',
    icon: ShieldCheck,
    bg: 'bg-emerald-950/80',
    border: 'border-emerald-500/50',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_80px_rgba(16,185,129,0.3)]',
    flare: 'bg-emerald-500'
  },
  ACHIEVEMENT_UNLOCK: {
    color: 'amber',
    icon: Trophy,
    bg: 'bg-amber-950/80',
    border: 'border-amber-500/50',
    text: 'text-amber-400',
    glow: 'shadow-[0_0_80px_rgba(245,158,11,0.3)]',
    flare: 'bg-amber-500'
  },
  MISSION_SUCCESS: {
    color: 'cyan',
    icon: Zap,
    bg: 'bg-cyan-950/80',
    border: 'border-cyan-500/50',
    text: 'text-cyan-400',
    glow: 'shadow-[0_0_80px_rgba(34,211,238,0.3)]',
    flare: 'bg-cyan-500'
  }
};

const RewardModal: React.FC<RewardModalProps> = ({ isOpen, onClose, type, title, subtitle, value }) => {
  const theme = themeData[type];
  const Icon = theme.icon;

  useEffect(() => {
    if (isOpen) {
       // Optional: Fire confetti or sound effect here if implemented globally
       const timer = setTimeout(() => onClose(), 6000); // Auto close
       return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 lg:p-4 bg-black/90 backdrop-blur-md"
        >
          {/* Blackout overlay handled by parent bg */}
          
          <div className="relative w-full max-w-3xl flex flex-col items-center justify-center text-center">
             {/* Massive Light Flare behind */}
             <motion.div 
               initial={{ scale: 0, opacity: 0 }} 
               animate={{ scale: [1, 1.5, 1.2], opacity: [0, 0.8, 0.4] }} 
               transition={{ duration: 1.5, ease: 'easeOut' }}
               className={`absolute w-[260px] h-[260px] lg:w-[400px] lg:h-[400px] 2xl:w-[600px] 2xl:h-[600px] rounded-full blur-[80px] lg:blur-[100px] ${theme.flare}/30 pointer-events-none`}
             />

             {/* Container */}
             <motion.div 
               initial={{ y: 100, scale: 0.8 }}
               animate={{ y: 0, scale: 1 }}
               exit={{ y: -50, opacity: 0 }}
               transition={{ type: 'spring', damping: 20, stiffness: 200 }}
               className={`relative z-10 w-full ${theme.bg} ${theme.border} border-2 rounded-[1.5rem] lg:rounded-[2rem] 2xl:rounded-[3rem] p-5 lg:p-8 2xl:p-12 overflow-hidden ${theme.glow}`}
             >
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />
                
                <button onClick={onClose} className="absolute right-4 top-4 lg:right-8 lg:top-8 min-h-[44px] min-w-[44px] text-white/50 hover:text-white transition-colors z-20 flex items-center justify-center">
                   <X size={24} />
                </button>

                <div className="relative z-10 flex flex-col items-center">
                   <motion.div 
                     initial={{ rotateY: 180, scale: 0 }}
                     animate={{ rotateY: 0, scale: 1 }}
                     transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
                     className={`w-16 h-16 lg:w-20 lg:h-20 2xl:w-32 2xl:h-32 rounded-2xl lg:rounded-3xl ${theme.flare}/20 border-2 ${theme.border} flex items-center justify-center mb-4 2xl:mb-8 shadow-inner`}
                   >
                     <Icon className={`w-8 h-8 lg:w-10 lg:h-10 2xl:w-16 2xl:h-16 ${theme.text}`} />
                   </motion.div>

                   <motion.p 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: 0.4 }}
                     className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.25em] lg:tracking-[0.5em] text-white/70 mb-2"
                   >
                     {type.replace('_', ' ')}
                   </motion.p>
                   
                   <motion.h2 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: 0.5 }}
                     className={`text-2xl md:text-5xl 2xl:text-6xl font-black font-orbitron uppercase italic ${theme.text} drop-shadow-lg leading-tight mb-2 2xl:mb-4`}
                   >
                     {title}
                   </motion.h2>

                   {value && (
                     <motion.p 
                       initial={{ opacity: 0, scale: 0.5 }}
                       animate={{ opacity: 1, scale: 1 }}
                       transition={{ delay: 0.7, type: 'spring' }}
                       className="text-white font-black text-xl 2xl:text-2xl tracking-widest uppercase bg-white/10 px-6 2xl:px-8 py-2 2xl:py-3 rounded-2xl border border-white/20 mb-2 2xl:mb-4"
                     >
                       {value}
                     </motion.p>
                   )}

                   {subtitle && (
                     <motion.p 
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       transition={{ delay: 0.9 }}
                       className="text-xs font-mono tracking-[0.2em] uppercase text-white/40"
                     >
                       {subtitle}
                     </motion.p>
                   )}
                </div>
             </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RewardModal;
