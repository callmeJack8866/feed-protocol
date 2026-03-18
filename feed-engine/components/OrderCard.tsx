import React from 'react';
import { FeedOrder, ConditionType, SpecialCondition } from '../types';
import { MARKET_ICONS } from '../constants';
import { motion } from 'framer-motion';
import { useTranslation } from '../i18n';
import type { TranslationKeys } from '../i18n';

interface OrderCardProps {
  order: FeedOrder;
  onGrab: (orderId: string) => void;
}

const CONDITION_STYLE_BASE: Record<ConditionType, { icon: string; labelKey: keyof TranslationKeys['condition']; bgColor: string; textColor: string; borderColor: string }> = {
  [ConditionType.LIMIT_UP]: { icon: 'UP', labelKey: 'limitUp', bgColor: 'bg-red-500/20', textColor: 'text-red-400', borderColor: 'border-red-500/30' },
  [ConditionType.LIMIT_DOWN]: { icon: 'DN', labelKey: 'limitDown', bgColor: 'bg-emerald-500/20', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/30' },
  [ConditionType.CONSECUTIVE_LIMIT]: { icon: 'CL', labelKey: 'consecutiveLimit', bgColor: 'bg-red-600/25', textColor: 'text-red-300', borderColor: 'border-red-400/40' },
  [ConditionType.SUSPENSION]: { icon: 'HALT', labelKey: 'suspension', bgColor: 'bg-slate-500/20', textColor: 'text-slate-400', borderColor: 'border-slate-500/30' },
  [ConditionType.PRICE_ADJUSTMENT]: { icon: 'ADJ', labelKey: 'priceAdjustment', bgColor: 'bg-amber-500/20', textColor: 'text-amber-400', borderColor: 'border-amber-500/30' },
  [ConditionType.EX_DIVIDEND]: { icon: 'DIV', labelKey: 'exDividend', bgColor: 'bg-amber-500/20', textColor: 'text-amber-400', borderColor: 'border-amber-500/30' },
  [ConditionType.VOLATILITY_HIGH]: { icon: 'VOL', labelKey: 'volatilityHigh', bgColor: 'bg-purple-500/20', textColor: 'text-purple-400', borderColor: 'border-purple-500/30' },
  [ConditionType.SPECIAL_TREATMENT]: { icon: 'ST', labelKey: 'specialTreatment', bgColor: 'bg-red-500/20', textColor: 'text-red-400', borderColor: 'border-red-500/30' },
};

function getZoneBadge(notionalAmount: number): { label: string; icon: string; color: string } {
  if (notionalAmount >= 1000000) return { label: 'MASTER', icon: 'M3', color: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black' };
  if (notionalAmount >= 100000) return { label: 'COMPETITIVE', icon: 'C2', color: 'bg-gradient-to-r from-orange-500 to-red-500 text-white' };
  return { label: 'BEGINNER', icon: 'B1', color: 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black' };
}

const ConditionBadge: React.FC<{ condition: SpecialCondition; conditionLabels: TranslationKeys['condition'] }> = ({ condition, conditionLabels }) => {
  const style = CONDITION_STYLE_BASE[condition.type];
  if (!style) return null;
  const isCritical = condition.highlightLevel === 'critical';
  const label = conditionLabels[style.labelKey];

  return (
    <motion.div
      animate={isCritical ? { scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] } : {}}
      transition={isCritical ? { duration: 1.5, repeat: Infinity } : {}}
      className={`px-3 py-1 rounded-lg ${style.bgColor} border ${style.borderColor} backdrop-blur-sm flex items-center gap-1.5 ${isCritical ? 'shadow-[0_0_12px_rgba(239,68,68,0.3)]' : ''}`}
    >
      <span className="text-[9px] font-black font-orbitron">{style.icon}</span>
      <span className={`text-[8px] font-black uppercase tracking-wider ${style.textColor}`}>{label}</span>
    </motion.div>
  );
};

const OrderCard: React.FC<OrderCardProps> = ({ order, onGrab }) => {
  const { t } = useTranslation();
  const isLargeOrder = order.notionalAmount >= 1000000;
  const cardImages = ['/assets/images/card-btc-v2.png', '/assets/images/card-eth-v2.png', '/assets/images/card-oracle-v2.png'];
  const headerImage = cardImages[order.symbol.length % cardImages.length];
  const zone = getZoneBadge(order.notionalAmount);
  const conditions = order.specialConditions || [];
  const descriptor = conditions.length > 0
    ? `${conditions.map((condition) => {
        const style = CONDITION_STYLE_BASE[condition.type];
        return style ? t.condition[style.labelKey] : condition.description;
      }).join(' | ')} - ${order.symbol}`
    : `Initiate deep computational handshake for ${order.symbol}. Verify cryptographic proof of state across multi-exchange cross-links.`;

  return (
    <motion.div
      onClick={() => onGrab(order.orderId)}
      data-testid={`order-card-${order.id ?? order.orderId}`}
      className="cosmic-card relative h-[480px] flex flex-col overflow-hidden cursor-pointer group shadow-2xl"
    >
      <div className="h-3/5 relative overflow-hidden">
        <img
          src={headerImage}
          className="w-full h-full object-cover group-hover:scale-125 transition-transform duration-[2s] brightness-75 group-hover:brightness-110"
          alt="quest header"
          onError={(event) => {
            (event.target as HTMLImageElement).style.display = 'none';
            (event.target as HTMLImageElement).parentElement?.classList.add('bg-gradient-to-br', 'from-cyan-900/40', 'to-slate-900');
          }}
        />

        <div className="absolute inset-0 bg-white/10 w-full h-[2px] animate-scan opacity-0 group-hover:opacity-100 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1E] via-transparent to-black/20" />

        <div className="absolute bottom-[-50px] left-12 w-28 h-28 rounded-[2.5rem] bg-[#0A0F1E] border-4 border-cyan-500/20 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex items-center justify-center overflow-hidden z-20 group-hover:border-cyan-400 group-hover:scale-110 transition-all duration-500">
          <img src="/assets/images/owl-mascot-v3.png" className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt="mascot" />
          <div className="absolute inset-0 bg-cyan-500/5 mix-blend-overlay" />
        </div>

        {conditions.length > 0 && (
          <div className="absolute top-10 left-10 flex flex-col gap-2 z-20">
            {conditions.map((condition, index) => (
              <ConditionBadge key={`${condition.type}-${index}`} condition={condition} conditionLabels={t.condition} />
            ))}
          </div>
        )}

        <div className="absolute top-10 right-10 flex flex-col items-end gap-3 z-20">
          <div className={`px-4 py-1.5 rounded-lg ${zone.color} text-[8px] font-black uppercase tracking-widest`}>
            {zone.icon} {zone.label}
          </div>
          <div className="px-6 py-2 rounded-xl bg-black/80 border border-cyan-500/30 backdrop-blur-xl text-[9px] font-black font-orbitron text-cyan-400 uppercase tracking-[0.3em] shadow-lg">
            {order.exchange} // {order.market}
          </div>
          {isLargeOrder && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="px-4 py-1.5 rounded-lg bg-amber-500 text-black text-[8px] font-black uppercase tracking-widest italic"
            >
              {t.order.highRisk}
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex-1 p-12 pt-20 flex flex-col justify-between relative bg-gradient-to-b from-transparent to-cyan-900/5">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-4xl font-black font-orbitron text-white italic tracking-tighter uppercase glow-text group-hover:text-cyan-400 transition-colors">
              {order.symbol.split('.')[0]} HUB
            </h3>
            <div className="text-slate-700 font-black text-xs opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
              #{order.orderId.split('-')[1]}
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium leading-relaxed italic opacity-70 group-hover:opacity-100 transition-opacity line-clamp-2">
            {descriptor}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-10 gap-6">
          <div className="flex items-center gap-10">
            <div className="space-y-1.5">
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">{t.order.bounty}</p>
              <p className="text-2xl font-black font-orbitron text-cyan-400 tracking-tighter italic glow-cyan">
                {order.rewardAmount} <span className="text-xs opacity-40">FEED</span>
              </p>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="space-y-1.5">
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">{t.order.quorum}</p>
              <p className="text-2xl font-black font-orbitron text-white tracking-tighter italic">{order.consensusThreshold}</p>
            </div>
          </div>

          <motion.div
            whileHover={{ rotate: 15, scale: 1.2 }}
            className="min-w-16 h-16 px-3 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center text-lg font-black font-orbitron group-hover:border-cyan-500/50 group-hover:bg-cyan-500/20 group-hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] transition-all duration-500"
          >
            {MARKET_ICONS[order.market]}
          </motion.div>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/10 group-hover:border-cyan-500/40 rounded-tl-[3.5rem] transition-colors" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/10 group-hover:border-cyan-500/40 rounded-br-[3.5rem] transition-colors" />

      <motion.div
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -skew-x-12 pointer-events-none"
      />
    </motion.div>
  );
};

export default OrderCard;
