import { ethers, upgrades } from "hardhat";

/**
 * Feed Engine 全套合约部署脚本 (UUPS 代理模式)
 *
 * 部署顺序：
 * 1. FEEDToken (ERC-20)
 * 2. FeederLicense (ERC-721)
 * 3. FeedConsensus (共识引擎)
 * 4. RewardPenalty (奖惩系统)
 * 5. FeedEngine (主合约)
 * 6. 设置跨合约权限
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying with account:", deployer.address);
    console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

    // ============ 1. FEEDToken ============
    console.log("\n📦 Deploying FEEDToken...");
    const TokenFactory = await ethers.getContractFactory("FEEDToken");
    const feedToken = await upgrades.deployProxy(TokenFactory, [deployer.address], {
        initializer: "initialize",
        kind: "uups",
    });
    await feedToken.waitForDeployment();
    const tokenAddr = await feedToken.getAddress();
    console.log("✅ FEEDToken deployed to:", tokenAddr);

    // ============ 2. FeederLicense ============
    console.log("\n📦 Deploying FeederLicense...");
    const LicenseFactory = await ethers.getContractFactory("FeederLicense");
    const license = await upgrades.deployProxy(LicenseFactory, [deployer.address], {
        initializer: "initialize",
        kind: "uups",
    });
    await license.waitForDeployment();
    const licenseAddr = await license.getAddress();
    console.log("✅ FeederLicense deployed to:", licenseAddr);

    // ============ 3. FeedConsensus ============
    console.log("\n📦 Deploying FeedConsensus...");
    const ConsensusFactory = await ethers.getContractFactory("FeedConsensus");
    const consensus = await upgrades.deployProxy(
        ConsensusFactory,
        [deployer.address, 3600, 1800], // commit: 1h, reveal: 30min
        { initializer: "initialize", kind: "uups" }
    );
    await consensus.waitForDeployment();
    const consensusAddr = await consensus.getAddress();
    console.log("✅ FeedConsensus deployed to:", consensusAddr);

    // ============ 4. RewardPenalty ============
    console.log("\n📦 Deploying RewardPenalty...");
    const platformTreasury = deployer.address; // 暂用部署者地址
    const daoTreasury = deployer.address;      // 暂用部署者地址
    const RPFactory = await ethers.getContractFactory("RewardPenalty");
    const rewardPenalty = await upgrades.deployProxy(
        RPFactory,
        [deployer.address, tokenAddr, platformTreasury, daoTreasury],
        { initializer: "initialize", kind: "uups" }
    );
    await rewardPenalty.waitForDeployment();
    const rpAddr = await rewardPenalty.getAddress();
    console.log("✅ RewardPenalty deployed to:", rpAddr);

    // ============ 5. FeedEngine ============
    console.log("\n📦 Deploying FeedEngine...");
    const EngineFactory = await ethers.getContractFactory("FeedEngine");
    const feedEngine = await upgrades.deployProxy(
        EngineFactory,
        [deployer.address, tokenAddr, consensusAddr, rpAddr, licenseAddr],
        { initializer: "initialize", kind: "uups" }
    );
    await feedEngine.waitForDeployment();
    const engineAddr = await feedEngine.getAddress();
    console.log("✅ FeedEngine deployed to:", engineAddr);

    // ============ 6. 设置权限 ============
    console.log("\n🔑 Setting up cross-contract permissions...");

    // FeedEngine → FeedConsensus 操作者
    await (consensus as any).setOperator(engineAddr, true);
    console.log("  ✓ FeedEngine authorized as FeedConsensus operator");

    // FeedEngine → RewardPenalty 操作者
    await (rewardPenalty as any).setOperator(engineAddr, true);
    console.log("  ✓ FeedEngine authorized as RewardPenalty operator");

    // FeedEngine → FeederLicense 铸造者
    await (license as any).setMinter(engineAddr, true);
    console.log("  ✓ FeedEngine authorized as FeederLicense minter");

    // 给 RewardPenalty 初始 FEED 代币（用于奖励分配）
    const rewardPool = ethers.parseUnits("1000000", 18);
    await (feedToken as any).transfer(rpAddr, rewardPool);
    console.log("  ✓ Transferred 1,000,000 FEED to RewardPenalty");

    // ============ 总结 ============
    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL CONTRACTS DEPLOYED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log(`FEEDToken:      ${tokenAddr}`);
    console.log(`FeederLicense:  ${licenseAddr}`);
    console.log(`FeedConsensus:  ${consensusAddr}`);
    console.log(`RewardPenalty:  ${rpAddr}`);
    console.log(`FeedEngine:     ${engineAddr}`);
    console.log("=".repeat(60));

    // 输出 .env 格式
    console.log("\n📋 Copy to .env:");
    console.log(`FEED_TOKEN_CONTRACT=${tokenAddr}`);
    console.log(`FEEDER_LICENSE_NFT_CONTRACT=${licenseAddr}`);
    console.log(`FEED_CONSENSUS_CONTRACT=${consensusAddr}`);
    console.log(`REWARD_PENALTY_CONTRACT=${rpAddr}`);
    console.log(`FEED_ENGINE_CONTRACT=${engineAddr}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
