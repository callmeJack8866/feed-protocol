import { ethers } from 'ethers';

/**
 * 区块链服�?- �?BSC 链上 Feed Engine 合约交互
 *
 * 已部署合约地址 (BSC Testnet 97 �?2026-02-10):
 * - FEEDToken:      0xD07a137450EA3CB3f8133bf01550d1B1F1e71471
 * - FeederLicense:  0x4E42539570aEB80D402a782CF1eD8a9ba6B9F08E
 * - FeedConsensus:  0x7fd163c3E3aACFa9c80C68194535DFC8A6604703
 * - RewardPenalty:  0x02D83c59E2348C70FAE6BbD96dDB67d0A46BbabA
 * - FeedEngine:     0x4E5b9EB72419e7B49F9E6Ab67311fC7705c92420
 */

// ============ 合约地址 ============
export const CONTRACT_ADDRESSES = {
    FEED_TOKEN: process.env.FEED_TOKEN_CONTRACT || '0xD07a137450EA3CB3f8133bf01550d1B1F1e71471',
    FEEDER_LICENSE: process.env.FEEDER_LICENSE_NFT_CONTRACT || '0x4E42539570aEB80D402a782CF1eD8a9ba6B9F08E',
    FEED_CONSENSUS: process.env.FEED_CONSENSUS_CONTRACT || '0x7fd163c3E3aACFa9c80C68194535DFC8A6604703',
    REWARD_PENALTY: process.env.REWARD_PENALTY_CONTRACT || '0x02D83c59E2348C70FAE6BbD96dDB67d0A46BbabA',
    FEED_ENGINE: process.env.FEED_ENGINE_CONTRACT || '0x4E5b9EB72419e7B49F9E6Ab67311fC7705c92420',
    USDT_TOKEN: process.env.USDT_TOKEN_CONTRACT || '',
    // NST Options 协议合约（外部客户协议）
    NST_OPTIONS_CORE: process.env.NST_OPTIONS_CORE_CONTRACT || '',
    // NST FeedProtocol 合约（喂价请求来源）
    NST_FEED_PROTOCOL: process.env.NST_FEED_PROTOCOL_CONTRACT || '',
};

// ============ ABI 定义 ============

/** FEEDToken (UUPS ERC-20) */
const FEED_TOKEN_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function burn(uint256 amount)',
    'function burnFrom(address account, uint256 amount)',
    'function MAX_SUPPLY() view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

/** FeederLicense (UUPS ERC-721 Enumerable) */
const FEEDER_LICENSE_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function balanceOf(address owner) view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function nextTokenId() view returns (uint256)',
    'function licenseTypes(uint256 tokenId) view returns (uint8)',
    'function getTokensByOwner(address owner) view returns (uint256[])',
    'function mint(address to, string uri, uint8 licenseType)',
    'function burn(uint256 tokenId)',
    'function setMinter(address minter, bool authorized)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    'event LicenseMinted(uint256 indexed tokenId, address indexed to, uint8 licenseType)',
];

/** FeedConsensus (UUPS Commit-Reveal 共识引擎) */
const FEED_CONSENSUS_ABI = [
    // 读取
    'function getOrderPhase(bytes32 orderId) view returns (uint8)',
    'function getConsensusPrice(bytes32 orderId) view returns (uint256)',
    'function getCommit(bytes32 orderId, address feeder) view returns (bytes32 priceHash, uint256 revealedPrice, bool committed)',
    'function commitWindow() view returns (uint256)',
    'function revealWindow() view returns (uint256)',
    'function maxDeviationBps() view returns (uint256)',
    'function computePriceHash(uint256 price, bytes32 salt) pure returns (bytes32)',
    // 写入
    'function createOrder(bytes32 orderId, string symbol, uint256 notionalAmount, uint256 quorum)',
    'function submitPriceHash(bytes32 orderId, bytes32 priceHash)',
    'function revealPrice(bytes32 orderId, uint256 price, bytes32 salt)',
    'function batchSubmitPriceHash(bytes32[] orderIds, bytes32[] priceHashes)',
    'function submitConsensus(bytes32 orderId, uint256 consensusPrice)',
    'function settleOrder(bytes32 orderId)',
    'function setOperator(address operator, bool authorized)',
    // 事件
    'event OrderCreated(bytes32 indexed orderId, string symbol, uint256 notionalAmount, uint256 quorum)',
    'event PriceCommitted(bytes32 indexed orderId, address indexed feeder)',
    'event PriceRevealed(bytes32 indexed orderId, address indexed feeder, uint256 price)',
    'event ConsensusSubmitted(bytes32 indexed orderId, uint256 consensusPrice)',
    'event OrderSettled(bytes32 indexed orderId)',
];

/** RewardPenalty (UUPS 奖惩系统) */
const REWARD_PENALTY_ABI = [
    // 读取
    'function pendingRewards(address feeder) view returns (uint256)',
    'function permanentlyBanned(address feeder) view returns (bool)',
    'function canGrabOrder(address feeder) view returns (bool)',
    'function getPenaltyCount(address feeder) view returns (uint256)',
    'function rewardSplit() view returns (uint256 feederBps, uint256 platformBps, uint256 daoBps, uint256 burnBps)',
    // 写入
    'function distributeRewards(bytes32 orderId, address[] feeders, uint256 totalReward)',
    'function claimRewards()',
    'function applyPenalty(address feeder, uint8 level, string reason, uint256 stakeAmount) returns (uint256 slashAmount)',
    'function setOperator(address operator, bool authorized)',
    // 事件
    'event RewardsDistributed(bytes32 indexed orderId, uint256 totalReward)',
    'event RewardsClaimed(address indexed feeder, uint256 amount)',
    'event PenaltyApplied(address indexed feeder, uint8 level, string reason, uint256 slashAmount)',
    'event FeederBanned(address indexed feeder)',
];

/** FeedEngine (UUPS 门面主合�? */
const FEED_ENGINE_ABI = [
    // 喂价员管�?
    'function registerFeeder(uint256 stakeAmount)',
    'function getFeederInfo(address feeder) view returns (bool registered, uint8 rank, uint256 stakedAmount, uint256 xp, uint256 licenseTokenId)',
    'function isRegistered(address feeder) view returns (bool)',
    // 质押
    'function stake(uint256 amount)',
    'function requestUnstake()',
    'function withdraw()',
    'function minimumStake() view returns (uint256)',
    'function unstakeCooldown() view returns (uint256)',
    // 抢单
    'function grabOrder(bytes32 orderId)',
    'function getOrderFeeders(bytes32 orderId) view returns (address[])',
    // XP 与等�?
    'function awardXP(address feeder, uint256 amount, string reason)',
    // 管理
    'function setMinimumStake(uint256 amount)',
    'function setUnstakeCooldown(uint256 seconds)',
    // 事件
    'event FeederRegistered(address indexed feeder, uint256 stakeAmount, uint256 licenseTokenId)',
    'event Staked(address indexed feeder, uint256 amount)',
    'event UnstakeRequested(address indexed feeder, uint256 unlockTime)',
    'event Withdrawn(address indexed feeder, uint256 amount)',
    'event OrderGrabbed(bytes32 indexed orderId, address indexed feeder)',
    'event XPAwarded(address indexed feeder, uint256 amount, string reason)',
    'event RankUpgraded(address indexed feeder, uint8 newRank)',
];

/** NST OptionsCore（外部客户协�?- 仅事件监�?+ 回调�?*/
const NST_OPTIONS_CORE_ABI = [
    // 回调写入
    'function processFeedCallback(uint256 orderId, uint8 feedType, uint256 finalPrice)',
    // 查询
    'function getOrder(uint256 orderId) view returns (tuple(uint256 orderId, address buyer, address seller, string underlyingName, string underlyingCode, string market, string country, string refPrice, uint8 direction, uint256 notionalUSDT, uint256 strikePrice, uint256 expiryTimestamp, uint256 premiumRate, uint256 premiumAmount, uint256 initialMargin, uint256 currentMargin, uint256 minMarginRate, uint8 liquidationRule, uint8 consecutiveDays, uint8 dailyLimitPercent, uint8 exerciseDelay, uint8 sellerType, address designatedSeller, uint256 arbitrationWindow, uint256 marginCallDeadline, bool dividendAdjustment, uint8 feedRule, uint8 status, uint256 createdAt, uint256 matchedAt, uint256 settledAt, uint256 lastFeedPrice, uint256 dividendAmount))',
    // 事件
    'event FeedRequestEmitted(uint256 indexed orderId, string underlyingCode, string market, string country, uint8 feedType, uint8 tier, address indexed requester, uint256 notionalAmount, uint256 timestamp)',
];

// ============ Provider & Wallet ============
let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;

/**
 * 初始化区块链连接
 */
export function initBlockchain(): void {
    const rpcUrl = process.env.NODE_ENV === 'production'
        ? process.env.BSC_RPC_URL
        : (process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com');

    if (!rpcUrl) {
        console.warn('⚠️ Blockchain RPC URL not configured');
        return;
    }

    provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.BACKEND_PRIVATE_KEY;
    if (privateKey) {
        wallet = new ethers.Wallet(privateKey, provider);
        console.log(`🔑 Wallet initialized: ${wallet.address}`);
    }

    console.log(`⛓️ Connected to blockchain: ${rpcUrl}`);
    console.log(`📋 Contract addresses:`);
    Object.entries(CONTRACT_ADDRESSES).forEach(([name, addr]) => {
        console.log(`   ${name}: ${addr}`);
    });
}

// ============ 合约实例获取 ============

/** 获取 FEEDToken 合约 */
export function getFeedTokenContract(): ethers.Contract | null {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.FEED_TOKEN, FEED_TOKEN_ABI, wallet || provider);
}

/** 获取 USDT 合约 */
export function getUsdtTokenContract(): ethers.Contract | null {
    if (!provider || !CONTRACT_ADDRESSES.USDT_TOKEN) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.USDT_TOKEN, FEED_TOKEN_ABI, wallet || provider);
}

/** 获取 FeederLicense NFT 合约 */
export function getFeederLicenseContract(): ethers.Contract | null {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.FEEDER_LICENSE, FEEDER_LICENSE_ABI, wallet || provider);
}

/** 获取 FeedConsensus 合约 */
export function getFeedConsensusContract(): ethers.Contract | null {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.FEED_CONSENSUS, FEED_CONSENSUS_ABI, wallet || provider);
}

/** 获取 RewardPenalty 合约 */
export function getRewardPenaltyContract(): ethers.Contract | null {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.REWARD_PENALTY, REWARD_PENALTY_ABI, wallet || provider);
}

/** 获取 FeedEngine 主合�?*/
export function getFeedEngineContract(): ethers.Contract | null {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.FEED_ENGINE, FEED_ENGINE_ABI, wallet || provider);
}

/** 获取 NST OptionsCore 合约（外部客户协议） */
export function getNstOptionsCoreContract(): ethers.Contract | null {
    if (!provider || !CONTRACT_ADDRESSES.NST_OPTIONS_CORE) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.NST_OPTIONS_CORE, NST_OPTIONS_CORE_ABI, wallet || provider);
}

// ============ 链上操作 ============

/**
 * 链上提交价格哈希 (Commit 阶段)
 * @param orderId - 订单 UUID
 * @param priceHash - 价格哈希 (keccak256(abi.encodePacked(price, salt)))
 */
export async function submitPriceHashOnChain(
    orderId: string,
    priceHash: string
): Promise<string | null> {
    const contract = getFeedConsensusContract();
    if (!contract || !wallet) {
        console.warn('�?FeedConsensus contract or wallet not available');
        return null;
    }

    try {
        const tx = await contract.submitPriceHash(
            ethers.id(orderId),
            priceHash
        );
        const receipt = await tx.wait();
        console.log(`�?Price hash committed on-chain: ${receipt.hash}`);
        return receipt.hash;
    } catch (error) {
        console.error('�?Failed to submit price hash on-chain:', error);
        return null;
    }
}

/**
 * 链上揭示价格 (Reveal 阶段)
 * @param orderId - 订单 UUID
 * @param price - 实际价格 (浮点�?
 * @param salt - 盐�?(字符�?
 */
export async function revealPriceOnChain(
    orderId: string,
    price: number,
    salt: string
): Promise<string | null> {
    const contract = getFeedConsensusContract();
    if (!contract || !wallet) {
        console.warn('�?FeedConsensus contract or wallet not available');
        return null;
    }

    try {
        const priceWei = ethers.parseUnits(price.toFixed(8), 8);
        const tx = await contract.revealPrice(
            ethers.id(orderId),
            priceWei,
            ethers.id(salt)
        );
        const receipt = await tx.wait();
        console.log(`�?Price revealed on-chain: ${receipt.hash}`);
        return receipt.hash;
    } catch (error) {
        console.error('�?Failed to reveal price on-chain:', error);
        return null;
    }
}

/**
 * 批量提交价格哈希
 */
export async function batchSubmitPriceHashOnChain(
    orderIds: string[],
    priceHashes: string[]
): Promise<string | null> {
    const contract = getFeedConsensusContract();
    if (!contract || !wallet) {
        console.warn('�?FeedConsensus contract or wallet not available');
        return null;
    }

    try {
        const bytes32OrderIds = orderIds.map(id => ethers.id(id));
        const tx = await contract.batchSubmitPriceHash(bytes32OrderIds, priceHashes);
        const receipt = await tx.wait();
        console.log(`�?Batch price hash committed: ${receipt.hash}`);
        return receipt.hash;
    } catch (error) {
        console.error('�?Failed to batch submit price hash:', error);
        return null;
    }
}

/**
 * 验证 NFT 执照所有权
 */
export async function verifyNFTOwnership(
    tokenId: string,
    expectedOwner: string
): Promise<boolean> {
    const contract = getFeederLicenseContract();
    if (!contract) {
        console.warn('�?FeederLicense contract not available');
        return false;
    }

    try {
        const owner = await contract.ownerOf(tokenId);
        return owner.toLowerCase() === expectedOwner.toLowerCase();
    } catch (error) {
        console.error('�?Failed to verify NFT ownership:', error);
        return false;
    }
}

/**
 * 获取用户�?NFT 执照列表
 */
export async function getUserNFTLicenses(userAddress: string): Promise<string[]> {
    const contract = getFeederLicenseContract();
    if (!contract) return [];

    try {
        const tokenIds = await contract.getTokensByOwner(userAddress);
        return tokenIds.map((id: bigint) => id.toString());
    } catch (error) {
        console.error('�?Failed to get user NFT licenses:', error);
        return [];
    }
}

/**
 * 获取喂价员链上信�?
 */
export async function getFeederOnChainInfo(feederAddress: string) {
    const engine = getFeedEngineContract();
    if (!engine) return null;

    try {
        const info = await engine.getFeederInfo(feederAddress);
        return {
            registered: info.registered,
            rank: Number(info.rank),
            stakedAmount: ethers.formatUnits(info.stakedAmount, 18),
            xp: Number(info.xp),
            licenseTokenId: info.licenseTokenId.toString(),
        };
    } catch (error) {
        console.error('�?Failed to get feeder on-chain info:', error);
        return null;
    }
}

/**
 * 获取链上质押金额
 */
export async function getOnChainStake(userAddress: string): Promise<number> {
    const engine = getFeedEngineContract();
    if (!engine) return 0;

    try {
        const info = await engine.getFeederInfo(userAddress);
        return parseFloat(ethers.formatUnits(info.stakedAmount, 18));
    } catch (error) {
        console.error('�?Failed to get on-chain stake:', error);
        return 0;
    }
}

/**
 * 查询待领取奖�?
 */
export async function getPendingRewards(feederAddress: string): Promise<string> {
    const rp = getRewardPenaltyContract();
    if (!rp) return '0';

    try {
        const amount = await rp.pendingRewards(feederAddress);
        return ethers.formatUnits(amount, 18);
    } catch (error) {
        console.error('�?Failed to get pending rewards:', error);
        return '0';
    }
}

/**
 * 查询是否被永久封�?
 */
export async function isFeederBanned(feederAddress: string): Promise<boolean> {
    const rp = getRewardPenaltyContract();
    if (!rp) return false;

    try {
        return await rp.permanentlyBanned(feederAddress);
    } catch (error) {
        console.error('�?Failed to check ban status:', error);
        return false;
    }
}

/**
 * 获取 FEED 代币余额
 */
export async function getFeedBalance(userAddress: string): Promise<string> {
    const token = getFeedTokenContract();
    if (!token) return '0';

    try {
        const balance = await token.balanceOf(userAddress);
        return ethers.formatUnits(balance, 18);
    } catch (error) {
        console.error('�?Failed to get FEED balance:', error);
        return '0';
    }
}

export async function getUsdtBalance(userAddress: string): Promise<string> {
    const token = getUsdtTokenContract();
    if (!token) return '0';

    try {
        const balance = await token.balanceOf(userAddress);
        return ethers.formatUnits(balance, 18);
    } catch (error) {
        console.error('�?Failed to get USDT balance:', error);
        return '0';
    }
}

export async function getNativeBalance(userAddress: string): Promise<string> {
    if (!provider) return '0';

    try {
        const balance = await provider.getBalance(userAddress);
        return ethers.formatUnits(balance, 18);
    } catch (error) {
        console.error('�?Failed to get native balance:', error);
        return '0';
    }
}

// ============ 签名验证 ============

/**
 * 验证钱包签名
 */
export function verifySignature(
    message: string,
    signature: string,
    expectedAddress: string
): boolean {
    try {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
        console.error('�?Signature verification failed:', error);
        return false;
    }
}

/**
 * 生成签名消息
 */
export function generateSignMessage(nonce: string): string {
    return `Welcome to Feed Engine!\n\nSign this message to authenticate.\n\nNonce: ${nonce}`;
}

/**
 * 生成随机 nonce
 */
export function generateNonce(): string {
    return ethers.hexlify(ethers.randomBytes(16));
}



