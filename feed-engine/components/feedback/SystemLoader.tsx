import React from 'react';
import { motion } from 'framer-motion';

interface SystemLoaderProps {
  message?: string;
  subMessage?: string;
  theme?: 'cyan' | 'rose' | 'amber' | 'emerald';
  fullScreen?: boolean;
}

const themeMap = {
  cyan: { text: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.5)]', core: 'bg-cyan-500' },
  rose: { text: 'text-rose-400', border: 'border-rose-500/30', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.5)]', core: 'bg-rose-500' },
  amber: { text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.5)]', core: 'bg-amber-500' },
  emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.5)]', core: 'bg-emerald-500' },
};

const SystemLoader: React.FC<SystemLoaderProps> = ({ 
  message = "SYS_SYNC: ESTABLISHING NETWORK LINK...", 
  subMessage = "STANDBY FOR CORE SYNCHRONIZATION",
  theme = 'cyan',
  fullScreen = false 
}) => {
  const currentTheme = themeMap[theme];

  return (
    <div className={`flex flex-col items-center justify-center space-y-4 lg:space-y-6 ${fullScreen ? 'fixed inset-0 z-50 bg-[#02050A]/90 backdrop-blur-sm px-4' : 'h-44 lg:h-64 relative z-10 w-full'}`}>
      
      {/* Heavy Cyber Scanner Graphic */}
      <div className="relative w-24 h-24 lg:w-32 lg:h-32 flex items-center justify-center">
        {/* Static Frame */}
        <div className={`absolute inset-0 rounded-full border-2 border-dashed ${currentTheme.border} opacity-20`} />
        
        {/* Orbital Rotator */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          className={`absolute inset-2 rounded-full border-t-2 border-b-2 border-transparent ${currentTheme.border}`}
          style={{ borderTopColor: 'currentColor' }}
        />

        {/* Pulse Core */}
        <motion.div
           animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
           transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
           className={`w-4 h-4 rounded-full ${currentTheme.core} ${currentTheme.glow}`}
        />

        {/* Scanning Line overlay */}
        <motion.div 
           animate={{ top: ['0%', '100%', '0%'] }}
           transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
           className={`absolute left-0 right-0 h-px ${currentTheme.core} opacity-50 shadow-[0_0_10px_currentColor]`}
        />
      </div>

      <div className="text-center space-y-2">
        <motion.p 
           animate={{ opacity: [1, 0.5, 1] }}
           transition={{ duration: 1.5, repeat: Infinity }}
           className={`text-xs font-black font-orbitron uppercase tracking-widest ${currentTheme.text}`}
        >
          {message}
        </motion.p>
        <p className="text-[8px] lg:text-[9px] font-mono tracking-[0.18em] lg:tracking-[0.3em] uppercase text-slate-500">
           {subMessage}
        </p>
      </div>
      
    </div>
  );
};

export default SystemLoader;
