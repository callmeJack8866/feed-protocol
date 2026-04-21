import React from 'react';
import { Target, Hexagon, Fingerprint, Database, Orbit } from 'lucide-react';
import { motion } from 'framer-motion';

export type VoidIconType = 'target' | 'hexagon' | 'fingerprint' | 'database' | 'orbit';

interface SystemEmptyProps {
  title?: string;
  subtitle?: string;
  icon?: VoidIconType;
}

const icons = {
  target: Target,
  hexagon: Hexagon,
  fingerprint: Fingerprint,
  database: Database,
  orbit: Orbit
};

const SystemEmpty: React.FC<SystemEmptyProps> = ({ 
  title = "VOID_DETECTED",
  subtitle = "Radar failed to acquire matching payloads in this sector.",
  icon = 'target'
}) => {
  const IconComponent = icons[icon];

  return (
    <div className="w-full py-12 lg:py-24 flex flex-col items-center justify-center relative overflow-hidden bg-black/20 border border-white/5 rounded-[1.75rem] lg:rounded-[2.5rem]">
       <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
       
       <motion.div 
         animate={{ rotate: 360, scale: [1, 1.05, 1] }} 
         transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
         className="relative mb-8"
       >
          <IconComponent className="h-16 w-16 lg:h-[100px] lg:w-[100px] text-slate-800" strokeWidth={1} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-700 animate-pulse" />
          </div>
       </motion.div>

       <div className="relative z-10 text-center space-y-3 px-6">
          <p className="font-orbitron font-black text-base md:text-2xl uppercase tracking-[0.18em] lg:tracking-[0.4em] text-slate-500 drop-shadow-md">
            {title}
          </p>
          <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-slate-600 max-w-sm mx-auto leading-relaxed">
            {subtitle}
          </p>
       </div>
    </div>
  );
};

export default SystemEmpty;
