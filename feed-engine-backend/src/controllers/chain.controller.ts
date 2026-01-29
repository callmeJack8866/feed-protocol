import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import {
    verifyNFTOwnership,
    getUserNFTLicenses,
    getOnChainStake,
    submitPriceHashOnChain,
    revealPriceOnChain
} from '../services/blockchain.service';
import { io } from '../index';

const router = Router();

/**
 * POST /api/chain/sync-stake
 * 同步链上质押状态到数据库
 */
router.post('/sync-stake', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // 获取链上质押金额
        const onChainStake = await getOnChainStake(address);

        // 更新数据库
        const feeder = await prisma.feeder.upsert({
            where: { address: address.toLowerCase() },
            create: {
                address: address.toLowerCase(),
                stakedAmount: onChainStake
            },
            update: {
                stakedAmount: onChainStake
            }
        });

        res.json({
            success: true,
            feeder: {
                id: feeder.id,
                address: feeder.address,
                stakedAmount: feeder.stakedAmount,
                onChainStake
            }
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
router.post('/sync-nfts', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // 获取链上 NFT 列表
        const tokenIds = await getUserNFTLicenses(address);

        // 更新数据库中的 NFT 所有权
        for (const tokenId of tokenIds) {
            await prisma.feederLicense.updateMany({
                where: { tokenId },
                data: {
                    ownerAddress: address.toLowerCase()
                }
            });
        }

        // 获取该用户所有的执照
        const licenses = await prisma.feederLicense.findMany({
            where: { ownerAddress: address.toLowerCase() }
        });

        res.json({
            success: true,
            licenses,
            onChainTokenIds: tokenIds
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
router.post('/verify-nft', async (req: Request, res: Response) => {
    try {
        const { tokenId } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !tokenId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const isOwner = await verifyNFTOwnership(tokenId, address);

        res.json({
            success: true,
            tokenId,
            address,
            isOwner
        });
    } catch (error) {
        console.error('Verify NFT error:', error);
        res.status(500).json({ error: 'Failed to verify NFT' });
    }
});

/**
 * POST /api/chain/submit-price
 * 提交价格哈希到链上
 */
router.post('/submit-price', async (req: Request, res: Response) => {
    try {
        const { orderId, priceHash } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !orderId || !priceHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 验证用户是该订单的喂价员
        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        const submission = await prisma.priceSubmission.findFirst({
            where: {
                orderId,
                feederId: feeder.id
            }
        });

        if (!submission) {
            return res.status(403).json({ error: 'Not authorized to submit for this order' });
        }

        // 提交到链上
        const txHash = await submitPriceHashOnChain(orderId, priceHash);

        if (txHash) {
            // 更新数据库
            await prisma.priceSubmission.update({
                where: { id: submission.id },
                data: {
                    priceHash,
                    commitTxHash: txHash,
                    committedAt: new Date()
                }
            });

            io.emit('order:committed', { orderId, feederId: feeder.id, txHash });
        }

        res.json({
            success: true,
            txHash,
            message: txHash ? 'Price hash submitted on-chain' : 'On-chain submission skipped (contract not configured)'
        });
    } catch (error) {
        console.error('Submit price error:', error);
        res.status(500).json({ error: 'Failed to submit price' });
    }
});

/**
 * POST /api/chain/reveal-price
 * 揭示价格到链上
 */
router.post('/reveal-price', async (req: Request, res: Response) => {
    try {
        const { orderId, price, salt } = req.body;
        const address = req.headers['x-wallet-address'] as string;

        if (!address || !orderId || !price || !salt) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 揭示到链上
        const txHash = await revealPriceOnChain(orderId, parseFloat(price), salt);

        if (txHash) {
            await prisma.priceSubmission.updateMany({
                where: {
                    orderId,
                    feederId: feeder.id
                },
                data: {
                    revealedPrice: parseFloat(price),
                    salt,
                    revealTxHash: txHash,
                    revealedAt: new Date()
                }
            });

            io.emit('order:revealed', { orderId, feederId: feeder.id, txHash });
        }

        res.json({
            success: true,
            txHash,
            message: txHash ? 'Price revealed on-chain' : 'On-chain reveal skipped (contract not configured)'
        });
    } catch (error) {
        console.error('Reveal price error:', error);
        res.status(500).json({ error: 'Failed to reveal price' });
    }
});

/**
 * GET /api/chain/status
 * 获取链上同步状态
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const feedEngineContract = process.env.FEED_ENGINE_CONTRACT;
        const stakingContract = process.env.STAKING_CONTRACT;
        const nftContract = process.env.FEEDER_LICENSE_NFT_CONTRACT;

        res.json({
            success: true,
            status: {
                feedEngineContract: feedEngineContract || 'Not configured',
                stakingContract: stakingContract || 'Not configured',
                nftContract: nftContract || 'Not configured',
                rpcUrl: process.env.NODE_ENV === 'production'
                    ? process.env.BSC_RPC_URL
                    : process.env.BSC_TESTNET_RPC_URL,
                environment: process.env.NODE_ENV
            }
        });
    } catch (error) {
        console.error('Get chain status error:', error);
        res.status(500).json({ error: 'Failed to get chain status' });
    }
});

export default router;
