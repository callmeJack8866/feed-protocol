import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * 合约升级脚本 (UUPS 代理模式)
 * 
 * 用法: npx hardhat run scripts/upgrade.ts --network bscTestnet
 * 
 * 环境变量:
 *   UPGRADE_CONTRACT: 要升级的合约名（FEEDToken / FeederLicense / FeedConsensus / RewardPenalty / FeedEngine）
 *   
 * 示例:
 *   UPGRADE_CONTRACT=FeedEngine npx hardhat run scripts/upgrade.ts --network bscTestnet
 */

/** 合约名 → 代理地址映射 */
const PROXY_ADDRESSES: Record<string, string | undefined> = {
    FEEDToken: process.env.FEED_TOKEN_CONTRACT,
    FeederLicense: process.env.FEEDER_LICENSE_NFT_CONTRACT,
    FeedConsensus: process.env.FEED_CONSENSUS_CONTRACT,
    RewardPenalty: process.env.REWARD_PENALTY_CONTRACT,
    FeedEngine: process.env.FEED_ENGINE_CONTRACT,
};

async function main() {
    const contractName = process.env.UPGRADE_CONTRACT;

    if (!contractName) {
        console.log("📋 可升级合约列表:");
        for (const [name, addr] of Object.entries(PROXY_ADDRESSES)) {
            console.log(`   ${name}: ${addr || '未配置'}`);
        }
        console.error("\n❌ 请设置 UPGRADE_CONTRACT 环境变量，例如:");
        console.error("   UPGRADE_CONTRACT=FeedEngine npx hardhat run scripts/upgrade.ts --network bscTestnet");
        process.exit(1);
    }

    const proxyAddress = PROXY_ADDRESSES[contractName];
    if (!proxyAddress) {
        console.error(`❌ 合约 ${contractName} 的代理地址未配置`);
        process.exit(1);
    }

    const [deployer] = await ethers.getSigners();
    console.log(`🚀 升级 ${contractName}`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Proxy: ${proxyAddress}`);

    // 获取旧实现地址
    const oldImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log(`   旧 Implementation: ${oldImpl}`);

    // 编译并部署新实现
    const Factory = await ethers.getContractFactory(contractName);

    console.log("\n⏳ 正在升级...");
    const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory, {
        kind: "uups",
    });
    await upgraded.waitForDeployment();

    // 获取新实现地址
    const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log(`\n✅ ${contractName} 升级成功!`);
    console.log(`   旧 Implementation: ${oldImpl}`);
    console.log(`   新 Implementation: ${newImpl}`);
    console.log(`   Proxy (不变): ${proxyAddress}`);

    if (oldImpl === newImpl) {
        console.log("\n⚠️  Implementation 地址未变化，可能合约代码没有修改");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 升级失败:", error);
        process.exit(1);
    });
