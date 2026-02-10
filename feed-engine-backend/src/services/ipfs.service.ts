/**
 * IPFS 存储服务 — Pinata 集成
 * 
 * 支持两种认证方式:
 * 1. Pinata JWT (推荐，PINATA_JWT 环境变量)
 * 2. Pinata API Key + Secret (PINATA_API_KEY + PINATA_SECRET_KEY)
 * 
 * 开发模式下如无配置，自动降级为模拟哈希。
 * 
 * @module services/ipfs.service
 */

import axios from 'axios';
import { createHash } from 'crypto';
import { ethers } from 'ethers';

const PINATA_API_URL = 'https://api.pinata.cloud';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

interface PinataResponse {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
}

// ============ 认证 Headers 构造 ============

/**
 * 获取 Pinata 认证 Headers
 * 优先使用 JWT，其次 API Key + Secret
 * @returns 认证 headers 或 null（无配置时）
 */
function getPinataAuthHeaders(): Record<string, string> | null {
    const jwt = process.env.PINATA_JWT;
    if (jwt) {
        return { Authorization: `Bearer ${jwt}` };
    }

    const apiKey = process.env.PINATA_API_KEY;
    const secretKey = process.env.PINATA_SECRET_KEY;
    if (apiKey && secretKey) {
        return {
            pinata_api_key: apiKey,
            pinata_secret_api_key: secretKey,
        };
    }

    return null;
}

// ============ 上传 ============

/**
 * 上传 JSON 数据到 IPFS (Pinata)
 * @param data 任意 JSON 对象
 * @param name 可选文件名（用于 Pinata 标记）
 * @returns IPFS CID 哈希
 */
export async function uploadToIPFS(data: object, name?: string): Promise<string> {
    const authHeaders = getPinataAuthHeaders();

    if (!authHeaders) {
        console.warn('⚠️ IPFS: Pinata 未配置，使用模拟哈希');
        return `Qm${createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 44)}`;
    }

    try {
        const response = await axios.post<PinataResponse>(
            `${PINATA_API_URL}/pinning/pinJSONToIPFS`,
            {
                pinataContent: data,
                pinataMetadata: {
                    name: name || `feed-engine-${Date.now()}`,
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                },
                timeout: 30000, // 30 秒超时
            }
        );

        return response.data.IpfsHash;
    } catch (error: any) {
        console.error('❌ IPFS upload error:', error.response?.data || error.message);
        throw new Error('Failed to upload to IPFS');
    }
}

/**
 * 上传订单详情到 IPFS
 * @param order 订单数据
 * @returns IPFS CID
 */
export async function uploadOrderToIPFS(order: {
    id: string;
    symbol: string;
    market: string;
    feedType: string;
    notionalAmount: number;
    specialConditions: any[];
    createdAt: Date;
}): Promise<string> {
    const orderData = {
        version: '1.0',
        type: 'feed_order',
        ...order,
        uploadedAt: new Date().toISOString(),
    };
    return uploadToIPFS(orderData, `order-${order.id}`);
}

/**
 * 上传价格证据到 IPFS
 * @param evidence 价格证据数据
 * @returns IPFS CID
 */
export async function uploadEvidenceToIPFS(evidence: {
    orderId: string;
    feederId: string;
    price: number;
    source: string;
    screenshotBase64?: string;
    timestamp: Date;
}): Promise<string> {
    const evidenceData = {
        version: '1.0',
        type: 'price_evidence',
        ...evidence,
        uploadedAt: new Date().toISOString(),
    };
    return uploadToIPFS(evidenceData, `evidence-${evidence.orderId}`);
}

/**
 * 上传 NFT 元数据到 IPFS
 * @param metadata ERC-721 标准元数据
 * @returns IPFS CID
 */
export async function uploadNFTMetadataToIPFS(metadata: {
    name: string;
    description: string;
    image: string;
    attributes: Array<{ trait_type: string; value: string | number }>;
}): Promise<string> {
    return uploadToIPFS(metadata, `nft-metadata-${Date.now()}`);
}

// ============ 读取 ============

/**
 * 从 IPFS 获取数据
 * @param hash IPFS CID
 * @returns 解析后的 JSON 数据
 */
export async function getFromIPFS<T>(hash: string): Promise<T> {
    try {
        const response = await axios.get<T>(`${PINATA_GATEWAY}/${hash}`, {
            timeout: 15000,
        });
        return response.data;
    } catch (error: any) {
        console.error('❌ IPFS fetch error:', error.message);
        throw new Error('Failed to fetch from IPFS');
    }
}

/**
 * 检查 Pinata 连接状态
 * @returns 是否可用
 */
export async function checkIPFSHealth(): Promise<{ available: boolean; gateway: string }> {
    const authHeaders = getPinataAuthHeaders();
    if (!authHeaders) {
        return { available: false, gateway: PINATA_GATEWAY };
    }

    try {
        await axios.get(`${PINATA_API_URL}/data/testAuthentication`, {
            headers: authHeaders,
            timeout: 5000,
        });
        return { available: true, gateway: PINATA_GATEWAY };
    } catch {
        return { available: false, gateway: PINATA_GATEWAY };
    }
}

// ============ 哈希工具（Commit-Reveal） ============

/**
 * 生成 keccak256 价格哈希（与链上合约一致）
 * 算法: keccak256(abi.encodePacked(price_in_wei, salt))
 * 
 * @param price 价格（浮点数）
 * @param salt 盐值（bytes32 格式）
 * @returns keccak256 哈希
 */
export function generatePriceHash(price: number, salt: string): string {
    const priceWei = BigInt(Math.round(price * 1e18));
    return ethers.solidityPackedKeccak256(
        ['uint256', 'bytes32'],
        [priceWei, salt]
    );
}

/**
 * 验证价格哈希
 * @param price 价格
 * @param salt 盐值
 * @param expectedHash 期望的哈希
 * @returns 是否匹配
 */
export function verifyPriceHash(price: number, salt: string, expectedHash: string): boolean {
    const actualHash = generatePriceHash(price, salt);
    return actualHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * 生成随机盐值（bytes32 格式）
 * @returns bytes32 格式随机盐值
 */
export function generateSalt(): string {
    return ethers.hexlify(ethers.randomBytes(32));
}
