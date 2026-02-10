import { ethers, run, upgrades } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * 合约验证脚本 — 在 BSCScan 上验证所有已部署的代理合约
 * 
 * 用法: npx hardhat run scripts/verify.ts --network bscTestnet
 * 
 * 注意: UUPS 代理合约的 implementation 地址需要从 .openzeppelin 文件中获取
 */
async function main() {
    console.log("🔍 开始验证合约...\n");

    const contracts = [
        { name: "FEEDToken", address: process.env.FEED_TOKEN_CONTRACT },
        { name: "FeederLicense", address: process.env.FEEDER_LICENSE_NFT_CONTRACT },
        { name: "FeedConsensus", address: process.env.FEED_CONSENSUS_CONTRACT },
        { name: "RewardPenalty", address: process.env.REWARD_PENALTY_CONTRACT },
        { name: "FeedEngine", address: process.env.FEED_ENGINE_CONTRACT },
    ];

    let verified = 0;
    let failed = 0;

    for (const contract of contracts) {
        if (!contract.address) {
            console.log(`⚠️  ${contract.name}: 地址未配置，跳过`);
            continue;
        }

        try {
            console.log(`📋 验证 ${contract.name} (${contract.address})...`);

            // 获取实现合约地址（UUPS 代理模式）
            const implAddress = await upgrades.erc1967.getImplementationAddress(contract.address);
            console.log(`   Implementation: ${implAddress}`);

            await run("verify:verify", {
                address: implAddress,
                constructorArguments: [],
            });

            console.log(`✅ ${contract.name} 验证成功\n`);
            verified++;
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                console.log(`✅ ${contract.name} 已验证过\n`);
                verified++;
            } else {
                console.error(`❌ ${contract.name} 验证失败:`, error.message, "\n");
                failed++;
            }
        }
    }

    console.log("=".repeat(50));
    console.log(`🏁 验证完成: ${verified} 成功, ${failed} 失败`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 验证脚本失败:", error);
        process.exit(1);
    });
