/**
 * i18n 类型定义
 * 支持语言枚举和翻译键的强类型接口
 */

/** 支持的语言 — 方案 §13: zh-CN / en / zh-TW / ko / ja / vi */
export type Language = 'zh' | 'en' | 'zhTW' | 'ko' | 'ja' | 'vi';

/** 语言元数据 */
export interface LanguageMeta {
    code: Language;
    name: string;       // 本语言名称
    nameEn: string;     // 英文名
    flag: string;       // 旗帜 emoji
    dir: 'ltr' | 'rtl'; // 文字方向
}

/** 所有支持语言的元数据 */
export const LANGUAGES: LanguageMeta[] = [
    { code: 'zh', name: '简体中文', nameEn: 'Chinese (Simplified)', flag: '🇨🇳', dir: 'ltr' },
    { code: 'en', name: 'English', nameEn: 'English', flag: '🇺🇸', dir: 'ltr' },
    { code: 'zhTW', name: '繁體中文', nameEn: 'Chinese (Traditional)', flag: '🇹🇼', dir: 'ltr' },
    { code: 'ja', name: '日本語', nameEn: 'Japanese', flag: '🇯🇵', dir: 'ltr' },
    { code: 'ko', name: '한국어', nameEn: 'Korean', flag: '🇰🇷', dir: 'ltr' },
    { code: 'vi', name: 'Tiếng Việt', nameEn: 'Vietnamese', flag: '🇻🇳', dir: 'ltr' },
];

/** 翻译键 — 按模块分组，强类型保证 */
export interface TranslationKeys {
    // ======== 通用导航 ========
    nav: {
        questHall: string;
        dashboard: string;
        leaderboard: string;
        inventory: string;
        trainingCenter: string;
        staking: string;
        arbitration: string;
    };

    // ======== 分区 (Zone) ========
    zone: {
        beginner: string;
        competitive: string;
        master: string;
        beginnerDesc: string;
        competitiveDesc: string;
        masterDesc: string;
        quests: string;
    };

    // ======== 订单卡片 ========
    order: {
        bounty: string;
        quorum: string;
        highRisk: string;
        grab: string;
        grabbed: string;
        feeding: string;
        settled: string;
        disputed: string;
    };

    // ======== 附加条件 ========
    condition: {
        limitUp: string;
        limitDown: string;
        consecutiveLimit: string;
        suspension: string;
        priceAdjustment: string;
        exDividend: string;
        volatilityHigh: string;
        specialTreatment: string;
    };

    // ======== 喂价模态框 ========
    feed: {
        oracleHandshake: string;
        referenceValue: string;
        commitSignal: string;
        reportAnomaly: string;
        generatingProof: string;
        broadcastingPayload: string;
        syncing: string;
        quorumSyncing: string;
        waitingValidation: string;
        missionSuccess: string;
        oracleSynchronized: string;
        claimBounty: string;
        nodeRecognition: string;
        protocolBounty: string;
        experiencePoints: string;
        feedTokens: string;
        disbursed: string;
    };

    // ======== 感谢卡片 ========
    thanks: {
        title: string;
        subtitle: string;
        deviationRate: string;
        accuracyRating: string;
        behaviorMining: string;
    };

    // ======== 通用 ========
    common: {
        confirm: string;
        cancel: string;
        close: string;
        loading: string;
        error: string;
        success: string;
        save: string;
        settings: string;
        language: string;
    };
}
