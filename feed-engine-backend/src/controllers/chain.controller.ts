/**
 * 链上交互控制�?�?Feed Engine
 * 
 * 提供后端�?BSC 链上合约的桥�?API�?
 * - 质押/NFT 同步
 * - 价格 Commit/Reveal
 * - 喂价员链上信息查�?
 * - 待领取奖励查�?
 * - 合约状态概�?
 * 
 * @module controllers/chain.controller
 */

import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import {
    verifyNFTOwnership,
    getUserNFTLicenses,
    getOnChainStake,
    submitPriceHashOnChain,
    revealPriceOnChain,
    getFeederOnChainInfo,
    getPendingRewards,
    getFeedBalance,
    getUsdtBalance,
    getNativeBalance,
    isFeederBanned,
    CONTRACT_ADDRESSES,
} from '../services/blockchain.service';
import { requireAuth, optionalAuth } from '../middlewares/auth.middleware';
import { io } from '../index';

const router = Router();

// ============ 质押 & NFT 同步 ============

/**
 * POST /api/chain/sync-stake
 * 同步链上质押状态到数据�?
 */
router.post('/sync-stake', requireAuth, async (req: Request, res: Response) => {
    try {
        const address = req.user!.address;

        // 获取链上质押金额
        const onChainStake = await getOnChainStake(address);

        // 更新数据�?
        const feeder = await prisma.feeder.upsert({
            where: { address },
            create: { address, stakedAmount: onChainStake },
            update: { stakedAmount: onChainStake },
        });

        res.json({
            success: true,
            feeder: {
                id: feeder.id,
                address: feeder.address,
                stakedAmount: feeder.stakedAmount,
                onChainStake,
            },
        });
    } catch (error) {
        console.error('Sync stake error:', error);
        res.status(500).json({ error: 'Failed to sync stake' });
    }
});

/**
 * POST /api/chain/sync-nfts
 * 同步 NFT 执照所有权
 */
router.post('/sync-nfts', requireAuth, async (req: Request, res: Response) => {
    try {
        const address = req.user!.address;

        // 获取链上 NFT 列表
        const tokenIds = await getUserNFTLicenses(address);

        // 更新数据库中�?NFT 所有权
        for (const tokenId of tokenIds) {
            await prisma.feederLicense.updateMany({
                where: { tokenId },
                data: { ownerAddress: address },
            });
        }

        // 获取该用户所有的执照
        const licenses = await prisma.feederLicense.findMany({
            where: { ownerAddress: address },
        });

        res.json({
            success: true,
            licenses,
            onChainTokenIds: tokenIds,
        });
    } catch (error) {
        console.error('Sync NFTs error:', error);
        res.status(500).json({ error: 'Failed to sync NFTs' });
    }
});

/**
 * POST /api/chain/verify-nft
 * 验证 NFT 所有权
 */
router.post('/verify-nft', requireAuth, async (req: Request, res: Response) => {
    try {
        const { tokenId } = req.body;
        const address = req.user!.address;

        if (!tokenId) {
            return res.status(400).json({ error: 'Token ID required' });
        }

        const isOwner = await verifyNFTOwnership(tokenId, address);
        res.json({ success: true, tokenId, address, isOwner });
    } catch (error) {
        console.error('Verify NFT error:', error);
        res.status(500).json({ error: 'Failed to verify NFT' });
    }
});

// ============ 价格 Commit / Reveal ============

/**
 * POST /api/chain/submit-price
 * 提交价格哈希到链�?(Commit 阶段)
 */
router.post('/submit-price', requireAuth, async (req: Request, res: Response) => {
    try {
        const { orderId, priceHash } = req.body;
        const address = req.user!.address;

        if (!orderId || !priceHash) {
            return res.status(400).json({ error: 'orderId and priceHash required' });
        }

        // 验证用户是该订单的喂价员
        const feeder = await prisma.feeder.findUnique({
            where: { address },
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const submission = await prisma.priceSubmission.findFirst({
            where: { orderId, feederId: feeder.id },
        });

        if (!submission) {
            return res.status(403).json({ error: 'Not authorized to submit for this order' });
        }

        // 提交到链�?
        const txHash = await submitPriceHashOnChain(orderId, priceHash);

        if (txHash) {
            await prisma.priceSubmission.update({
                where: { id: submission.id },
                data: {
                    priceHash,
                    commitTxHash: txHash,
                    committedAt: new Date(),
                },
            });
            io.emit('order:committed', { orderId, feederId: feeder.id, txHash });
        }

        res.json({
            success: true,
            txHash,
            message: txHash
                ? 'Price hash submitted on-chain'
                : 'On-chain submission skipped (contract not configured)',
        });
    } catch (error) {
        console.error('Submit price error:', error);
        res.status(500).json({ error: 'Failed to submit price' });
    }
});

/**
 * POST /api/chain/reveal-price
 * 揭示价格到链�?(Reveal 阶段)
 */
router.post('/reveal-price', requireAuth, async (req: Request, res: Response) => {
    try {
        const { orderId, price, salt } = req.body;
        const address = req.user!.address;

        if (!orderId || !price || !salt) {
            return res.status(400).json({ error: 'orderId, price, and salt required' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address },
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 揭示到链�?
        const txHash = await revealPriceOnChain(orderId, parseFloat(price), salt);

        if (txHash) {
            await prisma.priceSubmission.updateMany({
                where: { orderId, feederId: feeder.id },
                data: {
                    revealedPrice: parseFloat(price),
                    salt,
                    revealTxHash: txHash,
                    revealedAt: new Date(),
                },
            });
            io.emit('order:revealed', { orderId, feederId: feeder.id, txHash });
        }

        res.json({
            success: true,
            txHash,
            message: txHash
                ? 'Price revealed on-chain'
                : 'On-chain reveal skipped (contract not configured)',
        });
    } catch (error) {
        console.error('Reveal price error:', error);
        res.status(500).json({ error: 'Failed to reveal price' });
    }
});

// ============ 链上信息查询 ============

/**
 * GET /api/chain/feeder-info
 * 获取喂价员完整链上信�?(注册状�?等级/质押/XP/NFT)
 */
router.get('/feeder-info', requireAuth, async (req: Request, res: Response) => {
    try {
        const address = req.user!.address;

        // 并行查询链上信息
        const [onChainInfo, pendingReward, feedBalance, usdtBalance, nativeBalance, banned] = await Promise.all([
            getFeederOnChainInfo(address),
            getPendingRewards(address),
            getFeedBalance(address),
            getUsdtBalance(address),
            getNativeBalance(address),
            isFeederBanned(address),
        ]);

        res.json({
            success: true,
            chainData: {
                ...onChainInfo,
                pendingRewards: pendingReward,
                feedBalance,
                usdtBalance,
                nativeBalance,
                isBanned: banned,
            },
        });
    } catch (error) {
        console.error('Get feeder chain info error:', error);
        res.status(500).json({ error: 'Failed to get chain info' });
    }
});

/**
 * GET /api/chain/pending-rewards
 * 查询待领取奖�?
 */
router.get('/pending-rewards', requireAuth, async (req: Request, res: Response) => {
    try {
        const address = req.user!.address;
        const [pendingRewards, feedBalance, usdtBalance, nativeBalance] = await Promise.all([
            getPendingRewards(address),
            getFeedBalance(address),
            getUsdtBalance(address),
            getNativeBalance(address),
        ]);

        res.json({
            success: true,
            pendingRewards,
            feedBalance,
            usdtBalance,
            nativeBalance,
        });
    } catch (error) {
        console.error('Get pending rewards error:', error);
        res.status(500).json({ error: 'Failed to get pending rewards' });
    }
});

// ============ 合约状�?============

/**
 * GET /api/chain/status
 * 获取链上同步状态和合约地址
 */
router.get('/status', optionalAuth, async (req: Request, res: Response) => {
    try {
        res.json({
            success: true,
            status: {
                network: process.env.NODE_ENV === 'production' ? 'bsc-mainnet' : 'bsc-testnet',
                chainId: process.env.NODE_ENV === 'production' ? 56 : 97,
                rpcUrl: process.env.NODE_ENV === 'production'
                    ? process.env.BSC_RPC_URL
                    : process.env.BSC_TESTNET_RPC_URL,
                environment: process.env.NODE_ENV,
            },
        });
    } catch (error) {
        console.error('Get chain status error:', error);
        res.status(500).json({ error: 'Failed to get chain status' });
    }
});

/**
 * GET /api/chain/contracts
 * 获取所有合约地址（公开接口，前端用于配置）
 */
router.get('/contracts', (req: Request, res: Response) => {
    res.json({
        success: true,
        contracts: {
            FEED_TOKEN: CONTRACT_ADDRESSES.FEED_TOKEN,
            FEEDER_LICENSE: CONTRACT_ADDRESSES.FEEDER_LICENSE,
            FEED_CONSENSUS: CONTRACT_ADDRESSES.FEED_CONSENSUS,
            REWARD_PENALTY: CONTRACT_ADDRESSES.REWARD_PENALTY,
            FEED_ENGINE: CONTRACT_ADDRESSES.FEED_ENGINE,
            USDT_TOKEN: CONTRACT_ADDRESSES.USDT_TOKEN,
        },
        network: process.env.NODE_ENV === 'production' ? 'bsc-mainnet' : 'bsc-testnet',
    });
});

export default router;

