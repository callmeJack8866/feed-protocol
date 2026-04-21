import React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SystemErrorProps {
  message?: string;
  resolution?: string;
  inline?: boolean;
  onRetry?: () => void;
}

const SystemError: React.FC<SystemErrorProps> = ({ 
  message = "CRITICAL_FAILURE: DATA CHAIN CORRUPTED", 
  resolution = "Contact network command if this breach persists.",
  inline = false,
  onRetry
}) => {
  if (inline) {
    return (
      <AnimatePresence>
         <motion.div 
           initial={{ opacity: 0, y: -10 }} 
           animate={{ opacity: 1, y: 0 }} 
           exit={{ opacity: 0, scale: 0.95 }}
           className="w-full bg-[#1A0505] border border-rose-500/50 rounded-2xl px-4 lg:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4 shadow-[0_0_20px_rgba(244,63,94,0.15)] relative overflow-hidden"
         >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
            <AlertTriangle className="text-rose-500 shrink-0" size={20} />
            <div className="flex-1">
               <p className="text-xs font-black uppercase tracking-widest text-rose-400">{message}</p>
            </div>
            {onRetry && (
              <button onClick={onRetry} className="text-[9px] font-black uppercase tracking-[0.2em] px-4 py-2 bg-rose-500/10 text-rose-300 rounded-lg hover:bg-rose-500 hover:text-black transition-colors border border-rose-500/30">
                [ RETRY LINK ]
              </button>
            )}
         </motion.div>
      </AnimatePresence>
    );
  }

  // Full Block Error
  return (
    <div className="w-full py-12 lg:py-20 flex flex-col items-center justify-center text-center bg-[#0F0202] border border-rose-500/20 rounded-[1.75rem] lg:rounded-[2.5rem] relative overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-5 mix-blend-overlay pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-rose-600/10 blur-[80px] rounded-full pointer-events-none" />

      <motion.div
        animate={{ x: [-2, 2, -2, 0], opacity: [1, 0.8, 1, 1] }}
        transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
        className="relative z-10 mb-8"
      >
         <ShieldAlert className="h-16 w-16 lg:h-20 lg:w-20 text-rose-500" strokeWidth={1.5} />
      </motion.div>

      <div className="relative z-10 space-y-4 px-8 max-w-lg">
         <h2 className="font-orbitron font-black text-lg md:text-3xl text-rose-500 uppercase tracking-widest leading-tight">
           SYSTEM_HALT
         </h2>
         <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-400/80">
           {message}
         </p>
         <p className="text-[10px] uppercase font-mono text-slate-500 tracking-widest">
           {resolution}
         </p>
         
         {onRetry && (
           <div className="pt-6">
             <button onClick={onRetry} className="min-h-[48px] px-6 lg:px-8 py-4 bg-rose-950 text-rose-400 border border-rose-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 hover:text-black transition-all shadow-[0_0_30px_rgba(244,63,94,0.3)]">
               ESTABLISH SECURE LINK OVERRIDE
             </button>
           </div>
         )}
      </div>
    </div>
  );
};

export default SystemError;
