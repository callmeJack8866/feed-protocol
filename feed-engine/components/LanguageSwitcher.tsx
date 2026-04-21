import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, LANGUAGES } from '../i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Language selector with flag, locale code, and a compact dropdown.
 */
const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const currentLang = LANGUAGES.find(l => l.code === language);

    /** Close dropdown when clicking outside. */
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={ref} className="relative z-50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex min-h-[44px] items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/30 transition-all group"
            >
                <span className="text-lg">{currentLang?.flag}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-cyan-400 transition-colors">
                    {currentLang?.code.toUpperCase()}
                </span>
                <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    className="text-slate-500"
                >
                    <ChevronDown size={14} />
                </motion.span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-3 w-56 max-w-[calc(100vw-2rem)] bg-[#0F1115] border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden backdrop-blur-xl"
                    >
                        {LANGUAGES.map(lang => (
                            <button
                                key={lang.code}
                                onClick={() => { setLanguage(lang.code); setIsOpen(false); }}
                                className={`w-full min-h-[52px] flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors ${language === lang.code ? 'bg-cyan-500/10 border-l-2 border-cyan-500' : 'border-l-2 border-transparent'
                                    }`}
                            >
                                <span className="text-xl">{lang.flag}</span>
                                <div className="flex-1 text-left">
                                    <p className={`text-sm font-bold ${language === lang.code ? 'text-cyan-400' : 'text-white'}`}>
                                        {lang.name}
                                    </p>
                                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">{lang.nameEn}</p>
                                </div>
                                {language === lang.code && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="text-cyan-400"
                                    >
                                        <Check size={16} />
                                    </motion.span>
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LanguageSwitcher;
