import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Language, TranslationKeys, LANGUAGES } from './types';
import zh from './translations/zh';
import en from './translations/en';
import ja from './translations/ja';
import ko from './translations/ko';
import ru from './translations/ru';
import ar from './translations/ar';

/**
 * i18n Context — 轻量级国际化框架
 * 
 * 功能：
 * - useTranslation() → 返回翻译对象 t
 * - useLanguage() → 返回当前语言 + 切换函数
 * - 自动持久化到 localStorage
 * - 浏览器语言自动检测
 */

// ============ 翻译注册表 ============

const TRANSLATIONS: Record<Language, TranslationKeys> = {
    zh, en, ja, ko, ru, ar,
};

// ============ Context 定义 ============

interface I18nContextValue {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: TranslationKeys;
    dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextValue | null>(null);

// ============ 工具函数 ============

/** 检测浏览器默认语言 */
function detectBrowserLanguage(): Language {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('zh')) return 'zh';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('ko')) return 'ko';
    if (browserLang.startsWith('ru')) return 'ru';
    if (browserLang.startsWith('ar')) return 'ar';
    return 'en'; // 默认英文
}

/** 从 localStorage 读取保存的语言 */
function getSavedLanguage(): Language | null {
    try {
        const saved = localStorage.getItem('feed-engine-lang');
        if (saved && LANGUAGES.some(l => l.code === saved)) {
            return saved as Language;
        }
    } catch {
        // localStorage 不可用
    }
    return null;
}

// ============ Provider 组件 ============

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(
        () => getSavedLanguage() || detectBrowserLanguage()
    );

    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        try {
            localStorage.setItem('feed-engine-lang', lang);
        } catch {
            // ignore
        }
        // 更新文档方向（阿拉伯语 RTL）
        const meta = LANGUAGES.find(l => l.code === lang);
        document.documentElement.dir = meta?.dir || 'ltr';
    }, []);

    const value = useMemo<I18nContextValue>(() => {
        const meta = LANGUAGES.find(l => l.code === language);
        return {
            language,
            setLanguage,
            t: TRANSLATIONS[language] || TRANSLATIONS.en,
            dir: meta?.dir || 'ltr',
        };
    }, [language, setLanguage]);

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
};

// ============ Hooks ============

/**
 * 获取翻译对象
 * @returns t — 强类型翻译键对象
 * @example const { t } = useTranslation(); t.nav.questHall
 */
export function useTranslation(): { t: TranslationKeys } {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
    return { t: ctx.t };
}

/**
 * 获取语言控制
 * @returns { language, setLanguage, dir }
 */
export function useLanguage() {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useLanguage must be used within I18nProvider');
    return {
        language: ctx.language,
        setLanguage: ctx.setLanguage,
        dir: ctx.dir,
    };
}
