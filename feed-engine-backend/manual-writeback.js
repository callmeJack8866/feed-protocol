/**
 * 手动触发 NST 链上回写 — FeedProtocol.submitFeed(requestId, price)
 */
const { ethers } = require('ethers');
require('dotenv').config();

const feedProtocolAddress = process.env.NST_FEED_PROTOCOL_CONTRACT;
const submitterKey = process.env.NST_FEED_SUBMITTER_PRIVATE_KEY;
const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com';

const FEED_PROTOCOL_ABI = [
    'function submitFeed(uint256 requestId, uint256 price) external',
    'function getFeedRequest(uint256 requestId) external view returns (tuple(uint256 orderId, address requester, uint8 feedType, uint8 status, uint256 requestedAt, uint256 completedAt, uint256 price))',
];

async function main() {
    console.log('feedProtocolAddress:', feedProtocolAddress);
    console.log('rpcUrl:', rpcUrl);
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(submitterKey, provider);
    console.log('submitter address:', wallet.address);
    
    const feedProtocol = new ethers.Contract(feedProtocolAddress, FEED_PROTOCOL_ABI, wallet);
    
    // 先查看 requestId=2 的状态
    try {
        const req = await feedProtocol.getFeedRequest(2);
        console.log('Feed request #2:', {
            orderId: req[0].toString(),
            requester: req[1],
            feedType: req[2].toString(),
            status: req[3].toString(),
            price: req[6].toString(),
        });
    } catch (e) {
        console.warn('getFeedRequest failed:', e.reason || e.message);
    }

    // 提交喂价 requestId=2, price=100 USDT
    const priceWei = ethers.parseUnits('100', 18);
    console.log(`\nSubmitting: requestId=2, price=100 USDT (${priceWei.toString()} wei)`);
    
    try {
        const tx = await feedProtocol.submitFeed(2n, priceWei);
        console.log('TX sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('TX confirmed! Block:', receipt.blockNumber);
    } catch (e) {
        console.error('submitFeed FAILED:', e.reason || e.message || e);
    }
}

main().catch(console.error);
