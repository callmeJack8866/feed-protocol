/**
 * API 服务层 - 与 Feed Engine 后端对接
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// 存储当前钱包地址
let currentWalletAddress: string | null = null;

/**
 * 设置当前钱包地址
 */
export function setWalletAddress(address: string | null) {
    currentWalletAddress = address;
}

/**
 * 获取当前钱包地址
 */
export function getWalletAddress(): string | null {
    return currentWalletAddress;
}

/**
 * 通用请求方法
 */
async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (currentWalletAddress) {
        headers['x-wallet-address'] = currentWalletAddress;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

// ============ 认证 API ============

export interface AuthResponse {
    success: boolean;
    feeder?: any;
    token?: string;
    message?: string;
}

/**
 * 钱包登录
 */
export async function connectWallet(address: string, signature: string, message: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/api/auth/connect', {
        method: 'POST',
        body: JSON.stringify({ address, signature, message }),
    });
    if (res.success) {
        setWalletAddress(address);
    }
    return res;
}

/**
 * 注册喂价员
 */
export async function registerFeeder(data: {
    address: string;
    nickname: string;
    countries: string[];
    exchanges: string[];
    assetTypes: string[];
    stakeType: 'FEED' | 'USDT' | 'NFT';
}): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * 获取当前用户资料
 */
export async function getProfile(): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/profile');
}

// ============ 订单 API ============

export interface OrdersResponse {
    success: boolean;
    orders: any[];
}

export interface OrderResponse {
    success: boolean;
    order: any;
}

/**
 * 获取订单列表
 */
export async function getOrders(params?: {
    status?: string;
    market?: string;
}): Promise<OrdersResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.market) query.set('market', params.market);

    const queryString = query.toString();
    return request<OrdersResponse>(`/api/orders${queryString ? `?${queryString}` : ''}`);
}

/**
 * 获取订单详情
 */
export async function getOrderDetail(orderId: string): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/orders/${orderId}`);
}

/**
 * 抢单
 */
export async function grabOrder(orderId: string): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/orders/${orderId}/grab`, {
        method: 'POST',
    });
}

/**
 * 提交价格哈希 (Commit)
 */
export async function submitPriceHash(orderId: string, priceHash: string): Promise<any> {
    return request(`/api/orders/${orderId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ priceHash }),
    });
}

/**
 * 揭示价格 (Reveal)
 */
export async function revealPrice(orderId: string, price: number, salt: string, evidenceUrl?: string): Promise<any> {
    return request(`/api/orders/${orderId}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ price, salt, evidenceUrl }),
    });
}

// ============ 喂价员 API ============

export interface FeederResponse {
    success: boolean;
    feeder?: any;
    history?: any[];
    leaderboard?: any[];
}

/**
 * 获取当前喂价员信息
 */
export async function getFeederProfile(): Promise<FeederResponse> {
    return request<FeederResponse>('/api/feeders/me');
}

/**
 * 更新偏好设置
 */
export async function updatePreferences(data: {
    countries?: string[];
    exchanges?: string[];
    assetTypes?: string[];
}): Promise<FeederResponse> {
    return request<FeederResponse>('/api/feeders/preferences', {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * 获取喂价历史
 */
export async function getHistory(): Promise<FeederResponse> {
    return request<FeederResponse>('/api/feeders/history');
}

/**
 * 获取排行榜
 */
export async function getLeaderboard(limit = 50): Promise<FeederResponse> {
    return request<FeederResponse>(`/api/feeders/leaderboard?limit=${limit}`);
}

// ============ 仲裁 API ============

export interface ArbitrationResponse {
    success: boolean;
    cases?: any[];
    case?: any;
    vote?: any;
    appeal?: any;
}

/**
 * 获取仲裁案件列表
 */
export async function getArbitrationCases(status?: string): Promise<ArbitrationResponse> {
    const query = status ? `?status=${status}` : '';
    return request<ArbitrationResponse>(`/api/arbitration/cases${query}`);
}

/**
 * 获取仲裁案件详情
 */
export async function getArbitrationCase(caseId: string): Promise<ArbitrationResponse> {
    return request<ArbitrationResponse>(`/api/arbitration/cases/${caseId}`);
}

/**
 * 创建仲裁案件
 */
export async function createArbitrationCase(data: {
    orderId: string;
    disputeReason: string;
    description?: string;
    evidenceUrls?: string[];
    disputedFeederId?: string;
}): Promise<ArbitrationResponse> {
    return request<ArbitrationResponse>('/api/arbitration/cases', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * 仲裁投票
 */
export async function voteArbitration(caseId: string, vote: 'SUPPORT_INITIATOR' | 'REJECT_INITIATOR' | 'ABSTAIN', reason?: string): Promise<ArbitrationResponse> {
    return request<ArbitrationResponse>(`/api/arbitration/cases/${caseId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote, reason }),
    });
}

/**
 * 发起 DAO 申诉
 */
export async function createAppeal(caseId: string, reason: string, evidenceUrls?: string[]): Promise<ArbitrationResponse> {
    return request<ArbitrationResponse>(`/api/arbitration/cases/${caseId}/appeal`, {
        method: 'POST',
        body: JSON.stringify({ reason, evidenceUrls }),
    });
}

/**
 * DAO 投票
 */
export async function voteAppeal(appealId: string, vote: 'SUPPORT' | 'REJECT', feedAmount: number): Promise<ArbitrationResponse> {
    return request<ArbitrationResponse>(`/api/arbitration/appeals/${appealId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote, feedAmount }),
    });
}

// ============ 质押 API ============

export interface StakingResponse {
    success: boolean;
    staking?: any;
    record?: any;
    licenses?: any[];
    requirements?: any;
}

/**
 * 获取质押信息
 */
export async function getStakingInfo(): Promise<StakingResponse> {
    return request<StakingResponse>('/api/staking/info');
}

/**
 * 质押
 */
export async function stake(data: {
    stakeType: 'FEED' | 'USDT' | 'NFT';
    amount?: number;
    nftTokenId?: string;
    txHash: string;
}): Promise<StakingResponse> {
    return request<StakingResponse>('/api/staking/stake', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * 申请解锁
 */
export async function requestUnlock(recordId: string): Promise<StakingResponse> {
    return request<StakingResponse>('/api/staking/request-unlock', {
        method: 'POST',
        body: JSON.stringify({ recordId }),
    });
}

/**
 * 提取
 */
export async function withdraw(recordId: string, txHash: string): Promise<StakingResponse> {
    return request<StakingResponse>('/api/staking/withdraw', {
        method: 'POST',
        body: JSON.stringify({ recordId, txHash }),
    });
}

/**
 * 获取 NFT 执照列表
 */
export async function getLicenses(): Promise<StakingResponse> {
    return request<StakingResponse>('/api/staking/licenses');
}

/**
 * 获取质押要求
 */
export async function getStakingRequirements(): Promise<StakingResponse> {
    return request<StakingResponse>('/api/staking/requirements');
}

// ============ 链上 API ============

export interface ChainResponse {
    success: boolean;
    status?: any;
    feeder?: any;
    licenses?: any[];
    isOwner?: boolean;
    txHash?: string;
}

/**
 * 获取链上状态
 */
export async function getChainStatus(): Promise<ChainResponse> {
    return request<ChainResponse>('/api/chain/status');
}

/**
 * 同步链上质押
 */
export async function syncOnChainStake(): Promise<ChainResponse> {
    return request<ChainResponse>('/api/chain/sync-stake', {
        method: 'POST',
    });
}

/**
 * 同步 NFT
 */
export async function syncNFTs(): Promise<ChainResponse> {
    return request<ChainResponse>('/api/chain/sync-nfts', {
        method: 'POST',
    });
}

/**
 * 验证 NFT 所有权
 */
export async function verifyNFT(tokenId: string): Promise<ChainResponse> {
    return request<ChainResponse>('/api/chain/verify-nft', {
        method: 'POST',
        body: JSON.stringify({ tokenId }),
    });
}

// ============ 工具函数 ============

/**
 * 生成价格哈希
 */
export function generatePriceHash(price: number, salt: string): string {
    // 简化版哈希，实际应使用 keccak256
    const data = `${price}:${salt}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * 生成随机 salt
 */
export function generateSalt(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return '0x' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// ============ 培训 API ============

export interface TrainingResponse {
    success: boolean;
    courses?: any[];
    course?: any;
    progress?: any[];
    stats?: any;
    record?: any;
    exam?: any;
    result?: any;
}

/**
 * 获取课程列表
 */
export async function getCourses(category?: string): Promise<TrainingResponse> {
    const query = category ? `?category=${category}` : '';
    return request<TrainingResponse>(`/api/training/courses${query}`);
}

/**
 * 获取课程详情
 */
export async function getCourseDetail(courseId: string): Promise<TrainingResponse> {
    return request<TrainingResponse>(`/api/training/courses/${courseId}`);
}

/**
 * 获取学习进度
 */
export async function getTrainingProgress(): Promise<TrainingResponse> {
    return request<TrainingResponse>('/api/training/progress');
}

/**
 * 更新学习进度
 */
export async function updateTrainingProgress(courseId: string, progress: number): Promise<TrainingResponse> {
    return request<TrainingResponse>(`/api/training/progress/${courseId}`, {
        method: 'POST',
        body: JSON.stringify({ progress }),
    });
}

/**
 * 获取考试详情
 */
export async function getExam(examId: string): Promise<TrainingResponse> {
    return request<TrainingResponse>(`/api/training/exams/${examId}`);
}

/**
 * 提交考试答案
 */
export async function submitExam(examId: string, answers: number[], startedAt: Date): Promise<TrainingResponse> {
    return request<TrainingResponse>(`/api/training/exams/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, startedAt: startedAt.toISOString() }),
    });
}

// ============ 赛季 API ============

export interface SeasonResponse {
    success: boolean;
    seasons?: any[];
    season?: any;
    leaderboard?: any[];
    ranks?: any;
    stats?: any;
    rewards?: any;
    source?: string;
}

/**
 * 获取赛季列表
 */
export async function getSeasons(limit = 10): Promise<SeasonResponse> {
    return request<SeasonResponse>(`/api/seasons?limit=${limit}`);
}

/**
 * 获取当前赛季
 */
export async function getCurrentSeason(): Promise<SeasonResponse> {
    return request<SeasonResponse>('/api/seasons/current');
}

/**
 * 获取赛季排行榜
 */
export async function getSeasonLeaderboard(code: string, type = 'OVERALL', limit = 100): Promise<SeasonResponse> {
    return request<SeasonResponse>(`/api/seasons/${code}/leaderboard?type=${type}&limit=${limit}`);
}

/**
 * 获取我的赛季排名
 */
export async function getMySeasonRank(code: string): Promise<SeasonResponse> {
    return request<SeasonResponse>(`/api/seasons/${code}/my-rank`);
}

/**
 * 获取赛季奖励信息
 */
export async function getSeasonRewards(code: string): Promise<SeasonResponse> {
    return request<SeasonResponse>(`/api/seasons/${code}/rewards`);
}

// ============ 成就 API ============

export interface AchievementResponse {
    success: boolean;
    achievements?: any[];
    achievement?: any;
    stats?: any;
    newlyUnlocked?: any[];
    message?: string;
}

/**
 * 获取所有成就
 */
export async function getAchievements(category?: string): Promise<AchievementResponse> {
    const query = category ? `?category=${category}` : '';
    return request<AchievementResponse>(`/api/achievements${query}`);
}

/**
 * 获取我的成就
 */
export async function getMyAchievements(): Promise<AchievementResponse> {
    return request<AchievementResponse>('/api/achievements/my');
}

/**
 * 获取成就详情
 */
export async function getAchievementDetail(achievementId: string): Promise<AchievementResponse> {
    return request<AchievementResponse>(`/api/achievements/${achievementId}`);
}

/**
 * 检查并解锁成就
 */
export async function checkAchievements(): Promise<AchievementResponse> {
    return request<AchievementResponse>('/api/achievements/check', {
        method: 'POST',
    });
}

