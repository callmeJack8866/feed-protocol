import axios from 'axios';
import { createHash } from 'crypto';

/**
 * IPFS 存储服务 (使用 Pinata)
 */

const PINATA_API_URL = 'https://api.pinata.cloud';
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

interface PinataResponse {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
}

/**
 * 上传 JSON 数据到 IPFS
 */
export async function uploadToIPFS(data: object): Promise<string> {
    const apiKey = process.env.PINATA_API_KEY;
    const secretKey = process.env.PINATA_SECRET_KEY;

    if (!apiKey || !secretKey) {
        console.warn('IPFS: Pinata keys not configured, using mock hash');
        // 开发模式：返回模拟哈希
        return `Qm${createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 44)}`;
    }

    try {
        const response = await axios.post<PinataResponse>(
            `${PINATA_API_URL}/pinning/pinJSONToIPFS`,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'pinata_api_key': apiKey,
                    'pinata_secret_api_key': secretKey
                }
            }
        );

        return response.data.IpfsHash;
    } catch (error) {
        console.error('IPFS upload error:', error);
        throw new Error('Failed to upload to IPFS');
    }
}

/**
 * 上传订单详情到 IPFS
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
        uploadedAt: new Date().toISOString()
    };

    return uploadToIPFS(orderData);
}

/**
 * 上传价格证据到 IPFS
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
        uploadedAt: new Date().toISOString()
    };

    return uploadToIPFS(evidenceData);
}

/**
 * 从 IPFS 获取数据
 */
export async function getFromIPFS<T>(hash: string): Promise<T> {
    try {
        const response = await axios.get<T>(`${PINATA_GATEWAY}/${hash}`);
        return response.data;
    } catch (error) {
        console.error('IPFS fetch error:', error);
        throw new Error('Failed to fetch from IPFS');
    }
}

/**
 * 生成价格哈希 (用于 Commit-Reveal)
 */
export function generatePriceHash(price: number, salt: string): string {
    const data = `${price.toFixed(8)}:${salt}`;
    return '0x' + createHash('sha256').update(data).digest('hex');
}

/**
 * 验证价格哈希
 */
export function verifyPriceHash(price: number, salt: string, expectedHash: string): boolean {
    const actualHash = generatePriceHash(price, salt);
    return actualHash.toLowerCase() === expectedHash.toLowerCase();
}
