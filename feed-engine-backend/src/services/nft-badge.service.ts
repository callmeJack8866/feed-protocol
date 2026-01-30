/**
 * NFT 徽章铸造服务
 * 处理成就徽章和特殊 NFT 的铸造
 */

import { ethers } from 'ethers';

// NFT 合约 ABI (简化版)
const BADGE_NFT_ABI = [
    'function mint(address to, uint256 tokenId, string memory uri) external',
    'function mintBatch(address to, uint256[] memory tokenIds, string[] memory uris) external',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'function balanceOf(address owner) view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

// 徽章元数据模板
interface BadgeMetadata {
    name: string;
    description: string;
    image: string;
    attributes: {
        trait_type: string;
        value: string | number;
    }[];
}

// 合约地址 (从环境变量读取)
const BADGE_CONTRACT_ADDRESS = process.env.BADGE_NFT_CONTRACT || '';
const MINTER_PRIVATE_KEY = process.env.MINTER_PRIVATE_KEY || '';
const RPC_URL = process.env.CHAIN_RPC_URL || 'https://bsc-dataseed.binance.org/';

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let badgeContract: ethers.Contract | null = null;

/**
 * 初始化 NFT 服务
 */
export function initNFTService(): boolean {
    if (!BADGE_CONTRACT_ADDRESS || !MINTER_PRIVATE_KEY) {
        console.log('⚠️ NFT service not configured (missing contract address or minter key)');
        return false;
    }

    try {
        provider = new ethers.JsonRpcProvider(RPC_URL);
        signer = new ethers.Wallet(MINTER_PRIVATE_KEY, provider);
        badgeContract = new ethers.Contract(BADGE_CONTRACT_ADDRESS, BADGE_NFT_ABI, signer);

        console.log('✅ NFT Badge service initialized');
        console.log(`   Contract: ${BADGE_CONTRACT_ADDRESS}`);
        console.log(`   Minter: ${signer.address}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize NFT service:', error);
        return false;
    }
}

/**
 * 生成徽章 Token ID
 * 格式: [类型2位][稀有度1位][唯一ID5位]
 */
export function generateBadgeTokenId(
    category: string,
    rarity: string,
    uniqueId: number
): bigint {
    const categoryMap: Record<string, number> = {
        'MILESTONE': 10,
        'PRECISION': 20,
        'SPEED': 30,
        'SPECIAL': 40
    };

    const rarityMap: Record<string, number> = {
        'COMMON': 1,
        'RARE': 2,
        'EPIC': 3,
        'LEGENDARY': 4
    };

    const categoryCode = categoryMap[category] || 99;
    const rarityCode = rarityMap[rarity] || 0;
    const idPart = uniqueId % 100000;

    return BigInt(`${categoryCode}${rarityCode}${String(idPart).padStart(5, '0')}`);
}

/**
 * 生成徽章元数据
 */
export function generateBadgeMetadata(
    achievement: {
        code: string;
        name: string;
        description: string;
        icon: string;
        category: string;
        rarity: string;
    },
    unlockedBy: string,
    unlockedAt: Date
): BadgeMetadata {
    return {
        name: `Feed Engine Badge: ${achievement.name}`,
        description: achievement.description,
        image: `https://feed-engine.io/badges/${achievement.code}.png`, // 需要实际上传图片
        attributes: [
            { trait_type: 'Achievement', value: achievement.name },
            { trait_type: 'Category', value: achievement.category },
            { trait_type: 'Rarity', value: achievement.rarity },
            { trait_type: 'Icon', value: achievement.icon },
            { trait_type: 'Unlocked By', value: unlockedBy },
            { trait_type: 'Unlocked Date', value: unlockedAt.toISOString().split('T')[0] }
        ]
    };
}

/**
 * 铸造成就徽章
 */
export async function mintAchievementBadge(
    recipientAddress: string,
    achievement: {
        id: string;
        code: string;
        name: string;
        description: string;
        icon: string;
        category: string;
        rarity: string;
    },
    unlockedAt: Date
): Promise<{ success: boolean; txHash?: string; tokenId?: string; error?: string }> {
    if (!badgeContract || !signer) {
        return {
            success: false,
            error: 'NFT service not initialized. Set BADGE_NFT_CONTRACT and MINTER_PRIVATE_KEY in .env'
        };
    }

    try {
        // 生成唯一 Token ID
        const uniqueId = Date.now() % 100000;
        const tokenId = generateBadgeTokenId(achievement.category, achievement.rarity, uniqueId);

        // 生成元数据
        const metadata = generateBadgeMetadata(achievement, recipientAddress, unlockedAt);

        // 在生产环境中，应该将元数据上传到 IPFS
        // const metadataUri = await uploadToIPFS(metadata);
        const metadataUri = `https://api.feed-engine.io/badges/${tokenId}/metadata`;

        console.log(`🎨 Minting badge for ${recipientAddress}...`);
        console.log(`   Achievement: ${achievement.name}`);
        console.log(`   Token ID: ${tokenId}`);

        // 发送铸造交易
        const tx = await badgeContract.mint(recipientAddress, tokenId, metadataUri);
        console.log(`   TX Hash: ${tx.hash}`);

        // 等待确认
        const receipt = await tx.wait();
        console.log(`✅ Badge minted! Block: ${receipt?.blockNumber}`);

        return {
            success: true,
            txHash: tx.hash,
            tokenId: tokenId.toString()
        };

    } catch (error: any) {
        console.error('❌ Badge minting failed:', error.message);
        return {
            success: false,
            error: error.message || 'Minting failed'
        };
    }
}

/**
 * 铸造赛季冠军 NFT
 */
export async function mintSeasonChampionNFT(
    recipientAddress: string,
    seasonCode: string,
    rank: number,
    stats: { xp: number; feeds: number; accuracy: number }
): Promise<{ success: boolean; txHash?: string; tokenId?: string; error?: string }> {
    if (!badgeContract || !signer) {
        return {
            success: false,
            error: 'NFT service not initialized'
        };
    }

    try {
        // 只为前3名铸造
        if (rank > 3) {
            return { success: false, error: 'Champion NFT only for top 3' };
        }

        const rankNames = ['Champion', 'Runner-up', 'Third Place'];
        const tokenId = generateBadgeTokenId('SPECIAL', 'LEGENDARY', parseInt(seasonCode.replace('-', '')) * 10 + rank);

        const metadata: BadgeMetadata = {
            name: `Feed Engine Season ${rankNames[rank - 1]} - ${seasonCode}`,
            description: `Awarded to the #${rank} feeder of season ${seasonCode}`,
            image: `https://feed-engine.io/champions/${seasonCode}-${rank}.png`,
            attributes: [
                { trait_type: 'Season', value: seasonCode },
                { trait_type: 'Rank', value: rank },
                { trait_type: 'Title', value: rankNames[rank - 1] },
                { trait_type: 'Total XP', value: stats.xp },
                { trait_type: 'Total Feeds', value: stats.feeds },
                { trait_type: 'Accuracy', value: `${stats.accuracy}%` }
            ]
        };

        const metadataUri = `https://api.feed-engine.io/champions/${seasonCode}/${rank}/metadata`;

        console.log(`🏆 Minting champion NFT for ${recipientAddress}...`);
        console.log(`   Season: ${seasonCode}, Rank: #${rank}`);

        const tx = await badgeContract.mint(recipientAddress, tokenId, metadataUri);
        const receipt = await tx.wait();

        console.log(`✅ Champion NFT minted! TX: ${tx.hash}`);

        return {
            success: true,
            txHash: tx.hash,
            tokenId: tokenId.toString()
        };

    } catch (error: any) {
        console.error('❌ Champion NFT minting failed:', error.message);
        return {
            success: false,
            error: error.message || 'Minting failed'
        };
    }
}

/**
 * 检查地址是否拥有某徽章
 */
export async function checkBadgeOwnership(
    address: string,
    tokenId: bigint
): Promise<boolean> {
    if (!badgeContract) return false;

    try {
        const owner = await badgeContract.ownerOf(tokenId);
        return owner.toLowerCase() === address.toLowerCase();
    } catch {
        return false;
    }
}

/**
 * 获取地址的徽章数量
 */
export async function getBadgeCount(address: string): Promise<number> {
    if (!badgeContract) return 0;

    try {
        const balance = await badgeContract.balanceOf(address);
        return Number(balance);
    } catch {
        return 0;
    }
}

export default {
    initNFTService,
    generateBadgeTokenId,
    generateBadgeMetadata,
    mintAchievementBadge,
    mintSeasonChampionNFT,
    checkBadgeOwnership,
    getBadgeCount
};
