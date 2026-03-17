/**
 * 在 FeedProtocol 上注册 FeedEngine submitter 为活跃喂价员
 * 1. USDT.approve(FeedProtocol, stakeAmount)
 * 2. FeedProtocol.registerFeeder(stakeAmount)
 */
const { ethers } = require('ethers');
require('dotenv').config();

const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com';
const submitterKey = process.env.NST_FEED_SUBMITTER_PRIVATE_KEY;
const feedProtocolAddr = process.env.NST_FEED_PROTOCOL_CONTRACT;

// NST Config 里 minFeederStake = 100 USDT (需要确认)
const USDT_ADDRESS = '0x6ae0833E637D1d99F3FCB6204860386f6a6713C0'; // NST Testnet USDT

async function main() {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(submitterKey, provider);
    console.log('Submitter:', wallet.address);
    
    const usdt = new ethers.Contract(USDT_ADDRESS, [
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function balanceOf(address) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
    ], wallet);
    
    const feedProtocol = new ethers.Contract(feedProtocolAddr, [
        'function registerFeeder(uint256 stakeAmount) external',
        'function feeders(address) view returns (address feederAddress, uint256 stakedAmount, uint256 completedFeeds, uint256 rejectedFeeds, uint256 registeredAt, bool isActive, bool isBlacklisted)',
    ], wallet);
    
    // 检查是否已注册
    const feeder = await feedProtocol.feeders(wallet.address);
    console.log('Already registered?', feeder.feederAddress !== ethers.ZeroAddress);
    console.log('isActive?', feeder.isActive);
    
    if (feeder.feederAddress !== ethers.ZeroAddress) {
        console.log('Already registered! stakedAmount:', ethers.formatUnits(feeder.stakedAmount, 18));
        return;
    }
    
    // 检查 USDT 余额
    const balance = await usdt.balanceOf(wallet.address);
    console.log('USDT balance:', ethers.formatUnits(balance, 18));
    
    const stakeAmount = ethers.parseUnits('100', 18); // 100 USDT
    
    if (balance < stakeAmount) {
        console.error('USDT 余额不足 100U，需要先转入 USDT');
        return;
    }
    
    // Approve
    console.log('Approving USDT...');
    const approveTx = await usdt.approve(feedProtocolAddr, stakeAmount);
    await approveTx.wait();
    console.log('Approved!');
    
    // Register
    console.log('Registering feeder with 100 USDT stake...');
    const regTx = await feedProtocol.registerFeeder(stakeAmount);
    await regTx.wait();
    console.log('✅ Feeder registered successfully!');
}

main().catch(e => console.error('ERROR:', e.reason || e.message || e));
