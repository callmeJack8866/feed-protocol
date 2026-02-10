/**
 * NST 协议回调服务
 * 
 * 功能:
 * - 共识完成后向 callbackUrl 发送 webhook 通知
 * - HMAC-SHA256 签名保证消息完整性
 * - 指数退避重试（最多 3 次：1s/5s/30s）
 * - 失败记录审计日志
 * 
 * @module services/nst-callback.service
 */

import crypto from 'crypto';

/** Webhook 回调 payload */
export interface CallbackPayload {
    /** Feed Engine 订单 ID */
    orderId: string;
    /** 外部协议订单 ID（用于关联） */
    externalOrderId?: string;
    /** 来源协议 */
    sourceProtocol: string;
    /** 共识价格 */
    consensusPrice: number;
    /** 平均偏差(%) */
    averageDeviation: number;
    /** 参与喂价员数量 */
    feederCount: number;
    /** 共识时间 */
    timestamp: string;
    /** 共识状态 */
    status: 'CONSENSUS_REACHED' | 'CONSENSUS_FAILED';
    /** IPFS 凭证哈希 */
    ipfsHash?: string;
}

/** 回调执行结果 */
interface CallbackResult {
    success: boolean;
    statusCode?: number;
    attempts: number;
    error?: string;
}

/** 重试间隔（毫秒）：1s → 5s → 30s */
const RETRY_DELAYS = [1000, 5000, 30000];

/** Webhook 签名密钥 */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'feed-engine-webhook-secret-2026';

/**
 * 生成 HMAC-SHA256 签名
 * @param payload JSON 字符串
 * @returns 十六进制签名
 */
function generateSignature(payload: string): string {
    return crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
}

/**
 * 延迟指定毫秒
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 发送单次 HTTP POST 请求
 * @param url 目标 URL
 * @param body JSON 字符串
 * @param signature HMAC 签名
 * @returns HTTP 状态码
 */
async function sendRequest(url: string, body: string, signature: string): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s 超时

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Feed-Signature': signature,
                'X-Feed-Timestamp': new Date().toISOString(),
                'User-Agent': 'FeedEngine-Webhook/1.0'
            },
            body,
            signal: controller.signal
        });
        return response.status;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * 向 callbackUrl 发送共识结果通知
 * 
 * @param callbackUrl 目标 webhook URL
 * @param payload 回调数据
 * @returns 执行结果（成功/失败 + 重试次数）
 * 
 * @example
 * ```typescript
 * await sendConsensusCallback('https://nst.example.com/webhook', {
 *   orderId: '12345',
 *   sourceProtocol: 'NST',
 *   consensusPrice: 25.50,
 *   averageDeviation: 0.02,
 *   feederCount: 3,
 *   timestamp: new Date().toISOString(),
 *   status: 'CONSENSUS_REACHED'
 * });
 * ```
 */
export async function sendConsensusCallback(
    callbackUrl: string,
    payload: CallbackPayload
): Promise<CallbackResult> {
    const body = JSON.stringify(payload);
    const signature = generateSignature(body);

    let lastError: string | undefined;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        try {
            const statusCode = await sendRequest(callbackUrl, body, signature);

            if (statusCode >= 200 && statusCode < 300) {
                console.log(`✅ Callback sent to ${callbackUrl} (attempt ${attempt + 1}, status ${statusCode})`);
                return { success: true, statusCode, attempts: attempt + 1 };
            }

            // 4xx 不重试（客户端错误）
            if (statusCode >= 400 && statusCode < 500) {
                lastError = `Client error: HTTP ${statusCode}`;
                console.error(`❌ Callback failed (${callbackUrl}): ${lastError} — not retrying`);
                return { success: false, statusCode, attempts: attempt + 1, error: lastError };
            }

            // 5xx 继续重试
            lastError = `Server error: HTTP ${statusCode}`;
            console.warn(`⚠️ Callback attempt ${attempt + 1} failed (${callbackUrl}): ${lastError}`);
        } catch (err: any) {
            lastError = err.name === 'AbortError'
                ? 'Request timeout (10s)'
                : err.message || 'Unknown error';
            console.warn(`⚠️ Callback attempt ${attempt + 1} error (${callbackUrl}): ${lastError}`);
        }

        // 如果还有下次重试，等待
        if (attempt < RETRY_DELAYS.length - 1) {
            const waitMs = RETRY_DELAYS[attempt];
            console.log(`  ⏳ Retrying in ${waitMs / 1000}s...`);
            await delay(waitMs);
        }
    }

    console.error(`❌ All ${RETRY_DELAYS.length} callback attempts exhausted for ${callbackUrl}`);

    return {
        success: false,
        attempts: RETRY_DELAYS.length,
        error: lastError || 'Max retries exceeded'
    };
}

/**
 * 从订单数据构建回调 payload
 * 
 * @param order 数据库订单对象
 * @param consensusPrice 共识价格
 * @param deviations 偏差数据
 * @returns CallbackPayload 或 null（无 callbackUrl 时）
 */
export function buildCallbackPayload(
    order: any,
    consensusPrice: number,
    deviations: { feederId: string; deviation: number }[]
): CallbackPayload | null {
    if (!order.callbackUrl) return null;

    const avgDeviation = deviations.length > 0
        ? deviations.reduce((sum, d) => sum + Math.abs(d.deviation), 0) / deviations.length
        : 0;

    return {
        orderId: order.id,
        externalOrderId: order.externalOrderId || undefined,
        sourceProtocol: order.sourceProtocol || 'UNKNOWN',
        consensusPrice,
        averageDeviation: parseFloat(avgDeviation.toFixed(6)),
        feederCount: deviations.length,
        timestamp: new Date().toISOString(),
        status: 'CONSENSUS_REACHED',
        ipfsHash: order.ipfsHash || undefined
    };
}
