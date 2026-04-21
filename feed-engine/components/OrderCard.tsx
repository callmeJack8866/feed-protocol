import React from 'react';
import { FeedOrder, ConditionType, SpecialCondition } from '../types';
import { MARKET_ICONS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n';
import type { TranslationKeys } from '../i18n';
import { 
  ShieldAlert, ShieldCheck, Sword, Crown, Clock, Flame, Zap, AlertTriangle, 
  Target, BarChart3, Coins, Database, Fingerprint, Activity, Crosshair
} from 'lucide-react';

interface OrderCardProps {
  order: FeedOrder;
  onGrab: (orderId: string) => void;
}

const CONDITION_STYLE_BASE: Record<ConditionType, { icon: React.ReactNode; labelKey: keyof TranslationKeys['condition']; bgColor: string; textColor: string; borderColor: string }> = {
  [ConditionType.LIMIT_UP]: { icon: <Activity size={12}/>, labelKey: 'limitUp', bgColor: 'bg-red-500/10', textColor: 'text-red-400', borderColor: 'border-red-500/30' },
  [ConditionType.LIMIT_DOWN]: { icon: <Activity size={12}/>, labelKey: 'limitDown', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/30' },
  [ConditionType.CONSECUTIVE_LIMIT]: { icon: <Flame size={12}/>, labelKey: 'consecutiveLimit', bgColor: 'bg-red-600/20', textColor: 'text-red-300', borderColor: 'border-red-400/40' },
  [ConditionType.SUSPENSION]: { icon: <ShieldAlert size={12}/>, labelKey: 'suspension', bgColor: 'bg-slate-500/10', textColor: 'text-slate-400', borderColor: 'border-slate-500/30' },
  [ConditionType.PRICE_ADJUSTMENT]: { icon: <BarChart3 size={12}/>, labelKey: 'priceAdjustment', bgColor: 'bg-amber-500/10', textColor: 'text-amber-400', borderColor: 'border-amber-500/30' },
  [ConditionType.EX_DIVIDEND]: { icon: <Coins size={12}/>, labelKey: 'exDividend', bgColor: 'bg-amber-500/10', textColor: 'text-amber-400', borderColor: 'border-amber-500/30' },
  [ConditionType.VOLATILITY_HIGH]: { icon: <Zap size={12}/>, labelKey: 'volatilityHigh', bgColor: 'bg-purple-500/10', textColor: 'text-purple-400', borderColor: 'border-purple-500/30' },
  [ConditionType.SPECIAL_TREATMENT]: { icon: <AlertTriangle size={12}/>, labelKey: 'specialTreatment', bgColor: 'bg-red-500/10', textColor: 'text-red-400', borderColor: 'border-red-500/30' },
};

function getZoneTheme(notionalAmount: number) {
  if (notionalAmount >= 1000000) return { 
    tier: 'S-CLASS',
    label: 'ZENITH ORACLE', 
    icon: <Crown size={18}/>, 
    color: 'rose',
    bgClasses: 'bg-gradient-to-br from-rose-950/80 via-[#0A050A]/90 to-black',
    border: 'border-rose-500/40',
    hoverBorder: 'group-hover:border-rose-500/80',
    glow: 'group-hover:shadow-[0_0_40px_rgba(225,29,72,0.3),inset_0_0_30px_rgba(225,29,72,0.1)]',
    textHighlight: 'text-rose-400',
    tagBg: 'bg-rose-500/20',
    radarPulse: 'bg-rose-400'
  };
  if (notionalAmount >= 100000) return { 
    tier: 'A-CLASS',
    label: 'COMBAT FEED', 
    icon: <Sword size={18}/>, 
    color: 'orange',
    bgClasses: 'bg-gradient-to-br from-orange-950/80 via-[#0A0705]/90 to-black',
    border: 'border-orange-500/40',
    hoverBorder: 'group-hover:border-orange-500/80',
    glow: 'group-hover:shadow-[0_0_40px_rgba(249,115,22,0.3),inset_0_0_30px_rgba(249,115,22,0.1)]',
    textHighlight: 'text-orange-400',
    tagBg: 'bg-orange-500/20',
    radarPulse: 'bg-orange-400'
  };
  return { 
    tier: 'B-CLASS',
    label: 'PRIMARY SYNC', 
    icon: <ShieldCheck size={18}/>, 
    color: 'cyan',
    bgClasses: 'bg-gradient-to-br from-cyan-950/80 via-[#050A10]/90 to-black',
    border: 'border-cyan-500/40',
    hoverBorder: 'group-hover:border-cyan-500/80',
    glow: 'group-hover:shadow-[0_0_40px_rgba(34,211,238,0.3),inset_0_0_30px_rgba(34,211,238,0.1)]',
    textHighlight: 'text-cyan-400',
    tagBg: 'bg-cyan-500/20',
    radarPulse: 'bg-cyan-400'
  };
}

const formatTime = (seconds: number) => {
  if (!seconds || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const OrderCard: React.FC<OrderCardProps> = ({ order, onGrab }) => {
  const { t } = useTranslation();
  const theme = getZoneTheme(order.notionalAmount);
  const isHighRisk = order.notionalAmount >= 1000000;
  const isLargeSettlement = order.notionalAmount >= 500000;
  const conditions = order.specialConditions || [];

  return (
    <motion.div
      onClick={() => onGrab(order.orderId)}
      data-testid={`order-card-${order.id ?? order.orderId}`}
      className={`relative min-h-[286px] lg:h-[380px] 2xl:h-[480px] rounded-[1.5rem] lg:rounded-[2rem] border ${theme.border} ${theme.bgClasses} backdrop-blur-xl flex flex-col overflow-hidden cursor-crosshair group transition-all duration-500 ${theme.hoverBorder} ${theme.glow}`}
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 opacity-10 mix-blend-overlay group-hover:opacity-30 transition-opacity bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-white/5 rounded-full blur-[80px] pointer-events-none" />
      <div className={`absolute top-0 w-full h-[1px] bg-gradient-to-r from-transparent via-${theme.color}-500 to-transparent opacity-50`} />

      {/* Header: ID & Market */}
      <div className="flex justify-between items-start p-4 lg:p-6 pb-2 z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className={`w-2 h-2 rounded-full ${theme.radarPulse} shadow-[0_0_10px_currentColor] animate-pulse`} />
             <p className={`text-[10px] font-black uppercase tracking-[0.4em] ${theme.textHighlight}`}>
               {theme.tier} CONTRACT
             </p>
          </div>
          <p className="text-[11px] font-mono text-slate-500 uppercase">#{order.orderId.substring(0,8)}</p>
        </div>
        <div className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-1.5 rounded-lg border border-white/10 bg-black/40`}>
          <span className="text-[10px] font-black tracking-widest text-slate-400">{order.exchange}</span>
          <span className="text-slate-600">/</span>
          <span className={`text-[10px] font-black tracking-widest ${theme.textHighlight}`}>{order.market}</span>
        </div>
      </div>

      {/* Central Identity: The Asset */}
      <div className="px-4 lg:px-6 py-3 lg:py-6 flex-1 z-10 flex flex-col justify-center">
        <div className="flex justify-between items-center mb-2">
            <h3 className="text-3xl sm:text-4xl 2xl:text-[3.5rem] font-black font-orbitron text-white italic tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] group-hover:scale-105 transition-transform origin-left">
            {order.symbol.split('.')[0]}
            </h3>
            <div className={`w-11 h-11 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-2xl lg:text-3xl font-orbitron border ${theme.border} bg-black/50`}>
               {MARKET_ICONS[order.market] || <Database size={24} className="text-slate-400"/>}
            </div>
        </div>
        <p className="text-[9px] lg:text-[10px] text-slate-500 uppercase tracking-widest font-mono line-clamp-1 mb-4 lg:mb-8">
            {order.symbol} INTELLIGENCE REQUIRED
        </p>

        {/* Mission Tags / Rarity Identifiers */}
        <div className="flex flex-wrap gap-2 mb-4">
           <div className={`px-2.5 py-1.5 rounded-md border ${theme.border} ${theme.tagBg} flex items-center gap-1.5`}>
              <Target size={10} className={theme.textHighlight}/>
              <span className={`text-[8px] font-black tracking-widest uppercase ${theme.textHighlight}`}>{theme.label}</span>
           </div>

           {(order.timeRemaining && order.timeRemaining > 0) && (
             <div className="px-2.5 py-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 flex items-center gap-1.5">
                <Clock size={10} className="text-cyan-400"/>
                <span className="text-[8px] font-mono font-black tracking-widest text-cyan-400">{formatTime(order.timeRemaining)} LEFT</span>
             </div>
           )}

           {isHighRisk && (
             <div className="px-2.5 py-1.5 rounded-md border border-red-500/40 bg-red-500/20 flex items-center gap-1.5 animate-pulse">
                <AlertTriangle size={10} className="text-red-400"/>
                <span className="text-[8px] font-black tracking-widest text-red-400">{t.order.highRisk}</span>
             </div>
           )}

           {isLargeSettlement && !isHighRisk && (
             <div className="px-2.5 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 flex items-center gap-1.5">
                <Coins size={10} className="text-amber-400"/>
                <span className="text-[8px] font-black tracking-widest text-amber-400">HEAVY PAYOUT</span>
             </div>
           )}
        </div>

        {/* Dynamic Condition Array */}
        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {conditions.map((condition, idx) => {
              const style = CONDITION_STYLE_BASE[condition.type];
              if (!style) return null;
              const isCrit = condition.highlightLevel === 'critical';
              return (
                <div key={idx} className={`px-2 py-1 rounded border ${style.borderColor} ${style.bgColor} flex items-center gap-1`}>
                   <span className={style.textColor}>{style.icon}</span>
                   <span className={`text-[8px] font-black uppercase tracking-wider ${style.textColor}`}>
                      {t.condition[style.labelKey]}
                   </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Bounty Action Area */}
      <div className={`mt-auto border-t border-white/5 bg-black/60 p-4 lg:p-6 z-10 flex items-end justify-between transition-colors ${theme.hoverBorder}`}>
        <div>
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.4em] mb-1.5 flex items-center gap-1.5">
             <Crosshair size={10}/> {t.order.bounty}
          </p>
          <div className="flex items-baseline gap-2">
             <span className={`text-xl lg:text-2xl 2xl:text-3xl font-black font-orbitron italic drop-shadow-[0_0_10px_currentColor] ${theme.textHighlight}`}>
               {order.rewardAmount}
             </span>
             <span className="text-[10px] font-black text-slate-500 tracking-widest">FEED</span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] mb-1.5">QUORUM</p>
          <p className="text-base lg:text-lg font-black font-orbitron text-white italic tracking-tighter">
             {order.consensusThreshold} <span className="text-[10px] text-slate-600 uppercase tracking-widest not-italic ml-1">NODES</span>
          </p>
        </div>
      </div>

      {/* Hover Selection Overlay - Cyberpunk Brackets */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
         <div className={`absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 ${theme.textHighlight.replace('text-', 'border-')}`} />
         <div className={`absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 ${theme.textHighlight.replace('text-', 'border-')}`} />
         <div className={`absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 ${theme.textHighlight.replace('text-', 'border-')}`} />
         <div className={`absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 ${theme.textHighlight.replace('text-', 'border-')}`} />
      </div>
      
      {/* Scanline sweep effect on hover */}
      <div className="absolute w-[200%] h-12 bg-white/5 -rotate-45 -translate-y-[400px] group-hover:translate-y-[800px] transition-transform duration-[1.5s] ease-in-out pointer-events-none z-0" />
    </motion.div>
  );
};

export default OrderCard;
