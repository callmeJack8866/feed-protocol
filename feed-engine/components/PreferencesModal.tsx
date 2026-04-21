import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

interface Preferences {
  countries: string[];
  exchanges: string[];
  assets: string[];
}

interface PreferencesModalProps {
  prefs: Preferences;
  onClose: () => void;
  onUpdate: (prefs: Preferences) => void;
}

const COUNTRIES = [
  { id: 'US', label: 'United States', flag: 'US' },
  { id: 'CN', label: 'China', flag: 'CN' },
  { id: 'HK', label: 'Hong Kong', flag: 'HK' },
  { id: 'JP', label: 'Japan', flag: 'JP' },
  { id: 'GLOBAL', label: 'Global Crypto', flag: 'GL' },
];

const EXCHANGES = ['NYSE', 'NASDAQ', 'SSE', 'SZSE', 'HKEX', 'BINANCE', 'COINBASE'];
const ASSETS = ['CRYPTO', 'US_STOCK', 'CN_STOCK', 'HK_STOCK', 'FOREX', 'COMMODITY'];

const PreferencesModal: React.FC<PreferencesModalProps> = ({ prefs, onClose, onUpdate }) => {
  const { t } = useTranslation();

  const toggle = (category: keyof Preferences, item: string) => {
    const current = prefs[category];
    const updated = current.includes(item)
      ? current.filter(i => i !== item)
      : [...current, item];
    onUpdate({ ...prefs, [category]: updated });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/95 backdrop-blur-xl p-0 lg:p-4">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full h-[100dvh] lg:h-auto lg:max-h-[90vh] lg:max-w-3xl glass-panel rounded-none lg:rounded-[3rem] overflow-hidden shadow-2xl border-0 lg:border border-white/10 flex flex-col"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#070A0D]/90 px-4 py-4 sm:px-6 lg:px-12 lg:py-8 backdrop-blur-xl">
          <div className="space-y-1 min-w-0">
            <h2 className="text-2xl lg:text-3xl font-black font-orbitron tracking-tight text-white uppercase italic">{t.preferences.title}</h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] lg:tracking-[0.3em]">{t.preferences.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 text-slate-300"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-6 lg:px-12 lg:py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
            <div className="space-y-4">
              <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest px-1">{t.preferences.jurisdictionFocus}</h3>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggle('countries', c.id)}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                      prefs.countries.includes(c.id)
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-current/20 px-1 text-[9px]">{c.flag}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-black text-fuchsia-500 uppercase tracking-widest px-1">{t.preferences.assetSpecialties}</h3>
              <div className="flex flex-wrap gap-2">
                {ASSETS.map(a => (
                  <button
                    key={a}
                    onClick={() => toggle('assets', a)}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                      prefs.assets.includes(a)
                        ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-400'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {a.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest px-1">{t.preferences.preferredGateways}</h3>
              <div className="flex flex-wrap gap-2">
                {EXCHANGES.map(e => (
                  <button
                    key={e}
                    onClick={() => toggle('exchanges', e)}
                    className={`min-h-[44px] px-5 py-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                      prefs.exchanges.includes(e)
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-white/10 bg-[#070A0D]/92 px-4 py-4 sm:px-6 lg:px-12 lg:py-6 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 lg:gap-6">
            <p className="text-[10px] text-slate-500 font-bold max-w-md leading-relaxed italic">
              {t.preferences.filterDescription}
            </p>
            <button
              onClick={onClose}
              className="w-full sm:w-auto min-h-[52px] px-8 lg:px-12 py-4 rounded-[1.25rem] lg:rounded-[2rem] bg-cyan-500 text-black font-black font-orbitron text-sm shadow-2xl shadow-cyan-500/20 active:scale-95 transition-all"
            >
              {t.preferences.saveParameters}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PreferencesModal;
