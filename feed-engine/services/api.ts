import { ethers } from 'ethers';



/**

 * API 服务 — Feed Engine 后端对接

 * 

 * 认证方式:

 * 1. SIWE (EIP-4361): getNonce() ?verifySIWE() ?JWT

 * 2. JWT Bearer token (自动注入所有请求

 * 3. x-wallet-address (向后兼容降级)

 * 

 * @module services/api

 */



const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';



// ============ Token 管理 ============



/** 内存缓存（Zustand persist 提供持久化） */

let _jwtToken: string | null = null;

let _walletAddress: string | null = null;



/**

 * 设置 JWT token（由 AuthStore 调用）

 */

export function setAuthToken(token: string | null) {

    _jwtToken = token;

}



/**

 * 获取当前 JWT token

 */

export function getAuthToken(): string | null {

    return _jwtToken;

}



/**

 * 设置当前钱包地址（向后兼容）

 */

export function setWalletAddress(address: string | null) {

    _walletAddress = address;

}



/**

 * 获取当前钱包地址

 */

export function getWalletAddress(): string | null {

    return _walletAddress;

}



// ============ 通用请求 ============



/**

 * 通用请求方法 — 自动注入 JWT Bearer token

 * @param endpoint API 路径

 * @param options fetch 选项

 */

async function request<T>(

    endpoint: string,

    options: RequestInit = {}

): Promise<T> {

    const headers: Record<string, string> = {

        'Content-Type': 'application/json',

        ...(options.headers as Record<string, string>),

    };



    // 优先使用 JWT Bearer token

    if (_jwtToken) {

        headers['Authorization'] = `Bearer ${_jwtToken}`;

    }



    // 向后兼容: x-wallet-address

    if (_walletAddress) {

        headers['x-wallet-address'] = _walletAddress;

    }



    const response = await fetch(`${API_BASE_URL}${endpoint}`, {

        ...options,

        headers,

    });



    if (!response.ok) {

        const error = await response.json().catch(() => ({ error: 'Request failed' }));



        // JWT 过期 → 自动清除

        if (response.status === 401 && _jwtToken) {

            _jwtToken = null;

            console.warn('⚠️ JWT 过期，已清除');

        }



        throw new Error(error.error || `HTTP ${response.status}`);

    }



    return response.json();

}



// ============ SIWE 认证 API ============



export interface AuthResponse {

    success: boolean;

    feeder?: any;

    token?: string;

    message?: string;

}



export interface NonceResponse {

    success: boolean;

    nonce: string;

    expiresIn?: number;

    /** 后端预构造的 EIP-4361 SIWE 消息，前端可直接用于签名 */

    message?: string;

}



/**

 * 获取 SIWE nonce（EIP-4361 步骤 1）

 * @param address 钱包地址（后端要求必传）

 */

export async function getNonce(address: string): Promise<NonceResponse> {

    return request<NonceResponse>(`/api/auth/nonce?address=${encodeURIComponent(address)}`);

}



/**

 * SIWE 签名验证（EIP-4361 步骤 2）→ 返回 JWT

 * @param message EIP-4361 格式消息

 * @param signature 钱包签名

 */

export async function verifySIWE(message: string, signature: string): Promise<AuthResponse> {

    const res = await request<AuthResponse>('/api/auth/verify', {

        method: 'POST',

        body: JSON.stringify({ message, signature }),

    });

    if (res.success && res.token) {

        setAuthToken(res.token);

    }

    return res;

}



/**

 * 钱包登录（向后兼容 /connect 端点）

 */

export async function connectWallet(address: string, signature: string, message: string): Promise<AuthResponse> {

    const res = await request<AuthResponse>('/api/auth/connect', {

        method: 'POST',

        body: JSON.stringify({ address, signature, message }),

    });

    if (res.success) {

        setWalletAddress(address);

        if (res.token) {

            setAuthToken(res.token);

        }

    }

    return res;

}



/**

 * 刷新 JWT token

 */

export async function refreshToken(): Promise<AuthResponse> {

    const res = await request<AuthResponse>('/api/auth/refresh', {

        method: 'POST',

    });

    if (res.success && res.token) {

        setAuthToken(res.token);

    }

    return res;

}



/**

 * 登出

 */

export async function logout(): Promise<void> {

    try {

        await request('/api/auth/logout', { method: 'POST' });

    } catch {

        // 忽略网络错误

    }

    setAuthToken(null);

    setWalletAddress(null);

}



/**

 * 注册喂价员

 */

export async function registerFeeder(data: {

    address: string;

    nickname?: string;

    countries?: string[];

    exchanges?: string[];

    assetTypes?: string[];

}): Promise<AuthResponse> {

    return request<AuthResponse>('/api/auth/register', {

        method: 'POST',

        body: JSON.stringify(data),

    });

}



// ============ 订单 API ============



export async function getOrders(params?: {

    status?: string;

    market?: string;

    zone?: string;

}): Promise<{ success: boolean; orders: any[] }> {

    const query = new URLSearchParams();

    if (params?.status) query.set('status', params.status);

    if (params?.market) query.set('market', params.market);

    if (params?.zone) query.set('zone', params.zone);

    const qs = query.toString();

    return request(`/api/orders${qs ? `?${qs}` : ''}`);

}



export async function getOrderDetail(id: string): Promise<{ success: boolean; order: any }> {

    return request(`/api/orders/${id}`);

}



export async function grabOrder(id: string): Promise<{ success: boolean; submission?: any; newStatus?: string }> {

    return request(`/api/orders/${id}/grab`, { method: 'POST' });

}



export async function submitPriceHash(

    orderId: string,

    priceHash: string,

    screenshot?: string

): Promise<{ success: boolean; submission?: any }> {

    return request(`/api/orders/${orderId}/submit`, {

        method: 'POST',

        body: JSON.stringify({ priceHash, screenshot }),

    });

}



export async function revealPrice(

    orderId: string,

    price: number,

    salt: string,

    evidenceUrl?: string

): Promise<{ success: boolean; submission?: any }> {

    return request(`/api/orders/${orderId}/reveal`, {

        method: 'POST',

        body: JSON.stringify({ price, salt, evidenceUrl }),

    });

}



export async function reportUnableToFeed(

    orderId: string,

    reason: string,

    description?: string,

    evidence?: string

): Promise<{ success: boolean }> {

    return request(`/api/orders/${orderId}/unable-to-feed`, {

        method: 'POST',

        body: JSON.stringify({ reason, description, evidence }),

    });

}



export async function batchSubmitPriceHash(

    submissions: Array<{ orderId: string; priceHash: string }>

): Promise<{ success: boolean; results: any[] }> {

    return request('/api/orders/batch/submit', {

        method: 'POST',

        body: JSON.stringify({ submissions }),

    });

}



export async function getOrderObservers(orderId: string): Promise<{ success: boolean; order: any }> {

    return request(`/api/orders/${orderId}/observers`);

}



// ============ 喂价员 API ============



export async function getFeederProfile(): Promise<{ success: boolean; feeder?: any; history?: any[] }> {

    return request('/api/feeders/me');

}



export async function updatePreferences(prefs: {

    countries?: string[];

    exchanges?: string[];

    assetTypes?: string[];

}): Promise<{ success: boolean }> {

    return request('/api/feeders/preferences', {

        method: 'PUT',

        body: JSON.stringify(prefs),

    });

}



export async function getHistory(limit = 50): Promise<{ success: boolean; history: any[] }> {

    return request(`/api/feeders/history?limit=${limit}`);

}



export async function getLeaderboard(limit = 50): Promise<{ success: boolean; leaderboard: any[] }> {

    return request(`/api/feeders/leaderboard?limit=${limit}`);

}



// ============ 质押 API ============



function generateClientTxHash(): string {

    const bytes = crypto.getRandomValues(new Uint8Array(32));

    return '0x' + Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');

}



export async function getStakingInfo(): Promise<{ success: boolean; staking?: any }> {

    return request('/api/staking/info');

}



export async function stakeTokens(

    amount: number,

    stakeType: 'FEED' | 'USDT' | 'NFT' = 'USDT',

    txHash: string = generateClientTxHash(),

    nftTokenId?: string,

): Promise<{ success: boolean; record?: any }> {

    return request('/api/staking/stake', {

        method: 'POST',

        body: JSON.stringify({ amount, stakeType, txHash, nftTokenId }),

    });

}



export async function requestUnlockStake(recordId: string): Promise<{ success: boolean; record?: any; message?: string }> {

    return request('/api/staking/request-unlock', {

        method: 'POST',

        body: JSON.stringify({ recordId }),

    });

}



export async function withdrawStake(

    recordId: string,

    txHash: string = generateClientTxHash(),

): Promise<{ success: boolean; record?: any }> {

    return request('/api/staking/withdraw', {

        method: 'POST',

        body: JSON.stringify({ recordId, txHash }),

    });

}



export async function getLicenseInfo(): Promise<{ success: boolean; licenses?: any[] }> {

    return request('/api/staking/licenses');

}



export async function getStakingRequirements(): Promise<{ success: boolean; requirements?: any; unlockCooldownDays?: number }> {

    return request('/api/staking/requirements');

}

// ============ 仲裁 API ============



export type ArbitrationVoteOption = 'SUPPORT_INITIATOR' | 'REJECT_INITIATOR' | 'ABSTAIN';

export type DAOVoteOption = 'SUPPORT' | 'REJECT';



export async function getArbitrationCases(status?: string): Promise<{ success: boolean; cases: any[] }> {

    const qs = status ? `?status=${status}` : '';

    return request(`/api/arbitration/cases${qs}`);

}



export async function getArbitrationCase(id: string): Promise<{ success: boolean; case: any }> {

    return request(`/api/arbitration/cases/${id}`);

}



export async function createArbitrationCase(data: {

    orderId: string;

    disputeReason: string;

    description?: string;

    evidenceUrls?: string[];

    disputedFeederId?: string;

}): Promise<{ success: boolean; case?: any }> {

    return request('/api/arbitration/cases', {

        method: 'POST',

        body: JSON.stringify(data),

    });

}



export async function payArbitrationDeposit(

    caseId: string,

    txHash: string = generateClientTxHash(),

): Promise<{ success: boolean; case?: any }> {

    return request(`/api/arbitration/cases/${caseId}/pay-deposit`, {

        method: 'POST',

        body: JSON.stringify({ txHash }),

    });

}



export async function voteArbitration(

    caseId: string,

    vote: ArbitrationVoteOption,

    reason?: string,

    evidenceUrls?: string[],

): Promise<{ success: boolean; vote?: any }> {

    return request(`/api/arbitration/cases/${caseId}/vote`, {

        method: 'POST',

        body: JSON.stringify({ vote, reason, evidenceUrls }),

    });

}



export async function submitDAOAppeal(

    caseId: string,

    reason: string,

    evidenceUrls?: string[],

): Promise<{ success: boolean; appeal?: any }> {

    return request(`/api/arbitration/cases/${caseId}/appeal`, {

        method: 'POST',

        body: JSON.stringify({ reason, evidenceUrls }),

    });

}



export async function voteDAOAppeal(

    appealId: string,

    vote: DAOVoteOption,

    feedAmount: number,

): Promise<{ success: boolean; vote?: any }> {

    return request(`/api/arbitration/appeals/${appealId}/vote`, {

        method: 'POST',

        body: JSON.stringify({ vote, feedAmount }),

    });

}

// ============ 培训 API ============



export async function getCourses(): Promise<{ success: boolean; courses: any[] }> {

    return request('/api/training/courses');

}



export async function getCourseDetail(id: string): Promise<{ success: boolean; course: any }> {

    return request(`/api/training/courses/${id}`);

}



export async function startCourse(courseId: string): Promise<{ success: boolean }> {

    return request(`/api/training/progress/${courseId}`, {

        method: 'POST',

        body: JSON.stringify({ progress: 0 }),

    });

}



export async function submitExam(examId: string, answers: number[] | Record<string, number>, examStartTime?: Date): Promise<{ success: boolean; score?: number; passed?: boolean; result?: any }> {

    return request(`/api/training/exams/${examId}/submit`, {

        method: 'POST',

        body: JSON.stringify({ answers, startedAt: examStartTime?.toISOString() }),

    });

}



export async function getExam(examId: string): Promise<{ success: boolean; exam: any }> {

    return request(`/api/training/exams/${examId}`);

}



export async function getTrainingProgress(): Promise<{ success: boolean; progress: any; stats?: any }> {

    return request('/api/training/progress');

}



// ============ 赛季 API ============



export async function getSeasons(): Promise<{ success: boolean; seasons: any[] }> {

    return request('/api/seasons');

}



export async function getCurrentSeason(): Promise<{ success: boolean; season: any }> {

    return request('/api/seasons/current');

}



export async function getSeasonLeaderboard(seasonId: string, type?: string, limit = 50): Promise<{ success: boolean; leaderboard: any[] }> {

    const query = new URLSearchParams();

    if (type) query.set('type', type);

    query.set('limit', String(limit));

    return request(`/api/seasons/${seasonId}/leaderboard?${query.toString()}`);

}



export async function getMySeasonRank(seasonId: string): Promise<{ success: boolean; rank: any; ranks?: any }> {

    return request(`/api/seasons/${seasonId}/my-rank`);

}



export async function getSeasonRewards(seasonId: string): Promise<{ success: boolean; rewards: any[] }> {

    return request(`/api/seasons/${seasonId}/rewards`);

}



export async function claimSeasonRewards(seasonId: string): Promise<{ success: boolean }> {

    return request(`/api/seasons/${seasonId}/claim`, { method: 'POST' });

}



// ============ 成就 API ============



export async function getAchievements(): Promise<{ success: boolean; achievements: any[] }> {

    return request('/api/achievements');

}



export async function getAchievementDetail(code: string): Promise<{ success: boolean; achievement: any }> {

    return request(`/api/achievements/${code}`);

}



export async function getMyAchievements(): Promise<{ success: boolean; achievements: any[]; stats?: any }> {

    return request('/api/achievements/my');

}



export async function checkAchievements(): Promise<{ success: boolean; newAchievements: any[]; newlyUnlocked?: any[] }> {

    return request('/api/achievements/check', { method: 'POST' });

}



// ============ 链上 API ============



export async function getChainStatus(): Promise<{ success: boolean; data: any }> {

    const res = await request('/api/chain/status');

    return {

        ...res,

        data: res.data ?? res.status ?? null,

    };

}



export async function getContractAddresses(): Promise<{ success: boolean; data: any }> {

    const res = await request('/api/chain/contracts');

    return {

        ...res,

        data: res.data ?? res.contracts ?? null,

    };

}



export async function getFeederOnChainInfo(): Promise<{ success: boolean; data: any }> {

    const res = await request('/api/chain/feeder-info');

    return {

        ...res,

        data: res.data ?? res.chainData ?? null,

    };

}



export async function getPendingRewards(): Promise<{ success: boolean; data: any }> {

    const res = await request('/api/chain/pending-rewards');

    return {

        ...res,

        data: res.data ?? {

            pendingRewards: res.pendingRewards ?? 0,

            feedBalance: res.feedBalance ?? 0,

            usdtBalance: res.usdtBalance ?? 0,

            nativeBalance: res.nativeBalance ?? 0,

        },

    };

}



export async function syncStake(): Promise<{ success: boolean }> {

    return request('/api/chain/sync-stake', { method: 'POST' });

}



export async function syncNFTs(): Promise<{ success: boolean }> {

    return request('/api/chain/sync-nfts', { method: 'POST' });

}



// ============ 哈希工具 ============



/**

 * 生成随机盐值（hex）

 */

export function generateSalt(): string {

    const bytes = new Uint8Array(32);

    crypto.getRandomValues(bytes);

    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

}



/**

 * 生成价格哈希（Commit-Reveal）

 * 注意：这是一个简化实现，生产中应使用 ethers.solidityPackedKeccak256

 */

export function generatePriceHash(price: number, salt: string): string {

    const normalizedPrice = ethers.parseUnits(price.toString(), 18);

    return ethers.solidityPackedKeccak256(

        ['uint256', 'string'],

        [normalizedPrice, salt]

    );

}



/**

 * 构建 EIP-4361 SIWE 消息

 * @param address 钱包地址

 * @param nonce 后端返回的 nonce

 * @param chainId 链 ID

 */

export function buildSIWEMessage(address: string, nonce: string, chainId: number = 56): string {

    const domain = window.location.host;

    const origin = window.location.origin;

    const now = new Date().toISOString();



    return `${domain} wants you to sign in with your Ethereum account:

${address}



Sign in to Feed Engine Oracle Network



URI: ${origin}

Version: 1

Chain ID: ${chainId}

Nonce: ${nonce}

Issued At: ${now}`;

}







