
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  { id: 'US', label: 'United States', flag: '🇺🇸' },
  { id: 'CN', label: 'China', flag: '🇨🇳' },
  { id: 'HK', label: 'Hong Kong', flag: '🇭🇰' },
  { id: 'JP', label: 'Japan', flag: '🇯🇵' },
  { id: 'GLOBAL', label: 'Global Crypto', flag: '🌐' }
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-3xl glass-panel rounded-[3rem] overflow-hidden shadow-2xl border border-white/10"
      >
        <div className="p-12 space-y-10">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h2 className="text-3xl font-black font-orbitron tracking-tight text-white uppercase italic">{t.preferences.title}</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">{t.preferences.subtitle}</p>
            </div>
            <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all">✕</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Countries Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest px-2">{t.preferences.jurisdictionFocus}</h3>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggle('countries', c.id)}
                    className={`px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                      prefs.countries.includes(c.id) ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    <span>{c.flag}</span> {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Asset Types Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-purple-500 uppercase tracking-widest px-2">{t.preferences.assetSpecialties}</h3>
              <div className="flex flex-wrap gap-2">
                {ASSETS.map(a => (
                  <button
                    key={a}
                    onClick={() => toggle('assets', a)}
                    className={`px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                      prefs.assets.includes(a) ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {a.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Exchanges Section */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest px-2">{t.preferences.preferredGateways}</h3>
              <div className="flex flex-wrap gap-2">
                {EXCHANGES.map(e => (
                  <button
                    key={e}
                    onClick={() => toggle('exchanges', e)}
                    className={`px-5 py-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                      prefs.exchanges.includes(e) ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
            <p className="text-[10px] text-slate-500 font-bold max-w-xs leading-relaxed italic">
              {t.preferences.filterDescription}
            </p>
            <button 
              onClick={onClose}
              className="w-full sm:w-auto px-12 py-5 rounded-[2rem] bg-cyan-500 text-black font-black font-orbitron text-sm shadow-2xl shadow-cyan-500/20 active:scale-95 transition-all"
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
