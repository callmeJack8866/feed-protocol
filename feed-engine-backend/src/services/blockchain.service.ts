import { ethers } from 'ethers';
import prisma from '../config/database';

/**
 * 区块链服务 - 与 BSC 链交互
 */

// RPC 提供者
let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;

// 合约 ABI（简化版，实际需要完整 ABI）
const FEED_ENGINE_ABI = [
    // 事件
    'event OrderCreated(bytes32 indexed orderId, string symbol, uint256 notionalAmount)',
    'event PriceSubmitted(bytes32 indexed orderId, address indexed feeder, bytes32 priceHash)',
    'event PriceRevealed(bytes32 indexed orderId, address indexed feeder, uint256 price)',
    'event ConsensusReached(bytes32 indexed orderId, uint256 consensusPrice)',
    'event OrderSettled(bytes32 indexed orderId, uint256 finalPrice)',

    // 函数
    'function submitPriceHash(bytes32 orderId, bytes32 priceHash) external',
    'function revealPrice(bytes32 orderId, uint256 price, bytes32 salt) external',
    'function batchSubmitPriceHash(bytes32[] orderIds, bytes32[] priceHashes) external',
    'function getOrderStatus(bytes32 orderId) external view returns (uint8)',
    'function getConsensusPrice(bytes32 orderId) external view returns (uint256)',
];

const STAKING_ABI = [
    'event Staked(address indexed user, uint256 amount, uint8 stakeType)',
    'event Unstaked(address indexed user, uint256 amount)',
    'event Slashed(address indexed user, uint256 amount, string reason)',

    'function stake(uint256 amount, uint8 stakeType) external',
    'function requestUnstake() external',
    'function withdraw() external',
    'function getStakedAmount(address user) external view returns (uint256)',
];

const NFT_LICENSE_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',

    'function ownerOf(uint256 tokenId) external view returns (address)',
    'function balanceOf(address owner) external view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
];

/**
 * 初始化区块链连接
 */
export function initBlockchain(): void {
    const rpcUrl = process.env.NODE_ENV === 'production'
        ? process.env.BSC_RPC_URL
        : process.env.BSC_TESTNET_RPC_URL;

    if (!rpcUrl) {
        console.warn('⚠️ Blockchain RPC URL not configured');
        return;
    }

    provider = new ethers.JsonRpcProvider(rpcUrl);

    // 如果有私钥，创建钱包用于发送交易
    const privateKey = process.env.BACKEND_PRIVATE_KEY;
    if (privateKey) {
        wallet = new ethers.Wallet(privateKey, provider);
        console.log(`🔑 Wallet initialized: ${wallet.address}`);
    }

    console.log(`⛓️ Connected to blockchain: ${rpcUrl}`);
}

/**
 * 获取合约实例
 */
export function getFeedEngineContract(): ethers.Contract | null {
    const address = process.env.FEED_ENGINE_CONTRACT;
    if (!address || !provider) return null;

    const signer = wallet || provider;
    return new ethers.Contract(address, FEED_ENGINE_ABI, signer);
}

export function getStakingContract(): ethers.Contract | null {
    const address = process.env.STAKING_CONTRACT;
    if (!address || !provider) return null;

    const signer = wallet || provider;
    return new ethers.Contract(address, STAKING_ABI, signer);
}

export function getNFTLicenseContract(): ethers.Contract | null {
    const address = process.env.FEEDER_LICENSE_NFT_CONTRACT;
    if (!address || !provider) return null;

    return new ethers.Contract(address, NFT_LICENSE_ABI, provider);
}

/**
 * 链上提交价格哈希
 */
export async function submitPriceHashOnChain(
    orderId: string,
    priceHash: string
): Promise<string | null> {
    const contract = getFeedEngineContract();
    if (!contract || !wallet) {
        console.warn('Contract or wallet not available');
        return null;
    }

    try {
        const tx = await contract.submitPriceHash(
            ethers.id(orderId), // 将 UUID 转为 bytes32
            priceHash
        );

        const receipt = await tx.wait();
        console.log(`✅ Price hash submitted on-chain: ${receipt.hash}`);

        return receipt.hash;
    } catch (error) {
        console.error('Failed to submit price hash on-chain:', error);
        return null;
    }
}

/**
 * 链上揭示价格
 */
export async function revealPriceOnChain(
    orderId: string,
    price: number,
    salt: string
): Promise<string | null> {
    const contract = getFeedEngineContract();
    if (!contract || !wallet) {
        console.warn('Contract or wallet not available');
        return null;
    }

    try {
        // 价格转换为链上格式（8位小数）
        const priceWei = ethers.parseUnits(price.toFixed(8), 8);

        const tx = await contract.revealPrice(
            ethers.id(orderId),
            priceWei,
            ethers.id(salt)
        );

        const receipt = await tx.wait();
        console.log(`✅ Price revealed on-chain: ${receipt.hash}`);

        return receipt.hash;
    } catch (error) {
        console.error('Failed to reveal price on-chain:', error);
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
    const contract = getNFTLicenseContract();
    if (!contract) {
        console.warn('NFT contract not available');
        return false;
    }

    try {
        const owner = await contract.ownerOf(tokenId);
        return owner.toLowerCase() === expectedOwner.toLowerCase();
    } catch (error) {
        console.error('Failed to verify NFT ownership:', error);
        return false;
    }
}

/**
 * 获取用户的 NFT 执照列表
 */
export async function getUserNFTLicenses(userAddress: string): Promise<string[]> {
    const contract = getNFTLicenseContract();
    if (!contract) return [];

    try {
        const balance = await contract.balanceOf(userAddress);
        const tokenIds: string[] = [];

        for (let i = 0; i < balance; i++) {
            const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
            tokenIds.push(tokenId.toString());
        }

        return tokenIds;
    } catch (error) {
        console.error('Failed to get user NFT licenses:', error);
        return [];
    }
}

/**
 * 获取链上质押金额
 */
export async function getOnChainStake(userAddress: string): Promise<number> {
    const contract = getStakingContract();
    if (!contract) return 0;

    try {
        const amount = await contract.getStakedAmount(userAddress);
        return parseFloat(ethers.formatUnits(amount, 18));
    } catch (error) {
        console.error('Failed to get on-chain stake:', error);
        return 0;
    }
}

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
        console.error('Signature verification failed:', error);
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
