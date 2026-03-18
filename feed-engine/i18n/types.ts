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

    // ======== 仪表盘 ========
    dashboard: {
        title: string;
        totalFeeds: string;
        accuracy: string;
        xpProgress: string;
        currentRank: string;
        nextRank: string;
        balance: string;
        staked: string;
        recentFeeds: string;
        noHistory: string;
        deviation: string;
        reward: string;
        // 扩展 — DashboardView 组件
        nodeTelemetry: string;
        handshakeProtocol: string;
        globalStatus: string;
        synchronized: string;
        linkAccuracy: string;
        nodeIntegrity: string;
        uptime: string;
        latency: string;
        sigsPerSec: string;
        peers: string;
        syncStability: string;
        liveStream: string;
        protocolVersion: string;
        downloadCoreLogs: string;
        rewardMultiplier: string;
        stakeProtection: string;
        activityStreak: string;
        computingPower: string;
    };

    // ======== 质押 ========
    staking: {
        title: string;
        stake: string;
        unstake: string;
        claim: string;
        currentStake: string;
        minRequired: string;
        lockPeriod: string;
        rewards: string;
        apr: string;
        stakeType: string;
        // 扩展 — StakingView 组件
        subtitle: string;
        seasonEnd: string;
        activeGuarantee: string;
        protocolTrust: string;
        marketStatus: string;
        active: string;
        withdrawalCooldown: string;
        days: string;
        initiateUnstake: string;
        slashingRisk: string;
        lowExposure: string;
        safeZone: string;
        riskDescription: string;
        basicRequirement: string;
        proRequirement: string;
        eliteRequirement: string;
        beginnerZoneAccess: string;
        competitiveZoneAccess: string;
        arbitrationRights: string;
        deposit: string;
        withdraw: string;
        amountToStake: string;
        amountToWithdraw: string;
        available: string;
        max: string;
        collateralWarning: string;
        initializeStake: string;
        requestRelease: string;
    };

    // ======== 排行榜 ========
    leaderboard: {
        title: string;
        rank: string;
        feeder: string;
        feeds: string;
        accuracy: string;
        xp: string;
        seasonTitle: string;
        remaining: string;
        poolTotal: string;
        myRank: string;
        overallRank: string;
        feedCount: string;
        accuracyRate: string;
        tabOverall: string;
        tabFeeds: string;
        tabAccuracy: string;
        seasonReward: string;
        updatedHourly: string;
        viewFullTop: string;
    };

    // ======== 培训 ========
    training: {
        title: string;
        subtitle: string;
        courses: string;
        progress: string;
        startCourse: string;
        exam: string;
        passed: string;
        failed: string;
        xpReward: string;
        totalCourses: string;
        completed: string;
        inProgress: string;
        examsPassed: string;
        notStarted: string;
        studying: string;
        categoryOnboarding: string;
        categoryMonthly: string;
        categoryMarketSpecific: string;
        categoryAdvanced: string;
        learningProgress: string;
        completionReward: string;
        continueStudy: string;
        reviewCourse: string;
        startStudy: string;
        minutes: string;
        requiredCourse: string;
        courseOutline: string;
        retakeExam: string;
        startExam: string;
        passingScore: string;
        timeLimit: string;
        submitAnswers: string;
        congrats: string;
        notPassed: string;
        correct: string;
        passLine: string;
        backToCourses: string;
    };

    // ======== 仲裁 ========
    arbitration: {
        title: string;
        cases: string;
        vote: string;
        evidence: string;
        appeal: string;
        support: string;
        oppose: string;
        pending: string;
        // 扩展 — ArbitrationView 组件
        judicialChamber: string;
        asClassOnly: string;
        disputeResolution: string;
        activeConflict: string;
        stakedBounty: string;
        conflictRoot: string;
        currentVotes: string;
        untilLock: string;
        arbitrationProtocol: string;
        evidenceVsSignatures: string;
        primaryEvidence: string;
        disputeSummary: string;
        aggregatedSubmissions: string;
        feederId: string;
        reportedPrice: string;
        additionalNodesHalted: string;
        waitingConsensus: string;
        rejectValue: string;
        affirmValue: string;
        activeArbitrators: string;
        criticalityTier: string;
    };

    // ======== 库存 ========
    inventory: {
        title: string;
        nfts: string;
        badges: string;
        licenses: string;
        empty: string;
        rarity: string;
        unlockedAt: string;
        // 扩展 — InventoryView 组件
        protocolVault: string;
        vaultSubtitle: string;
        totalValue: string;
        assets: string;
        viewSignature: string;
        mintCredential: string;
    };

    // ======== 成就 ========
    achievements: {
        title: string;
        subtitle: string;
        checkNew: string;
        unlocked: string;
        achievementUnlocked: string;
        awesome: string;
        allCategory: string;
        milestoneCategory: string;
        precisionCategory: string;
        speedCategory: string;
        specialCategory: string;
        rarityCommon: string;
        rarityRare: string;
        rarityEpic: string;
        rarityLegendary: string;
        unlockedAtLabel: string;
    };

    // ======== 订单详情 ========
    orderDetail: {
        liveMarketFlux: string;
        riskExposure: string;
        masterTierCoverage: string;
        consensusTelemetry: string;
        consensusThreshold: string;
        nodesCommitted: string;
        pendingBounties: string;
        feedTokens: string;
        rankExperience: string;
        signalLifespan: string;
        missionTier: string;
        classAAccess: string;
        engageDirective: string;
        protocolBusy: string;
        abortBriefing: string;
        sigStrength: string;
    };

    // ======== 偏好设置 ========
    preferences: {
        title: string;
        subtitle: string;
        jurisdictionFocus: string;
        assetSpecialties: string;
        preferredGateways: string;
        filterDescription: string;
        saveParameters: string;
    };

    // ======== 钱包 ========
    wallet: {
        connect: string;
        disconnect: string;
        switchChain: string;
        wrongChain: string;
        noMetamask: string;
        signing: string;
    };

    // ======== 布局/侧边栏 ========
    layout: {
        systemLogs: string;
        fuelReserves: string;
        hardwareStatus: string;
        integrityRating: string;
        syncEfficiency: string;
        riskCollateral: string;
        overrideSecurity: string;
        engageNode: string;
        connecting: string;
        terminalLink: string;
    };
}
