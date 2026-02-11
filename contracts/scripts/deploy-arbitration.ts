import { ethers } from "hardhat";

/**
 * ArbitrationDAO 单独部署脚本
 * 
 * ArbitrationDAO 非 UUPS 代理模式，直接部署
 * 构造函数参数: _feedToken (已部署的 FEEDToken 地址)
 * 
 * 用法: npx hardhat run scripts/deploy-arbitration.ts --network bscTestnet
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying ArbitrationDAO with account:", deployer.address);
    console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

    // 已部署的 FEEDToken 地址 (BSC Testnet)
    const FEED_TOKEN_ADDRESS = "0xD07a137450EA3CB3f8133bf01550d1B1F1e71471";

    console.log("\n📦 Deploying ArbitrationDAO...");
    console.log("  feedToken:", FEED_TOKEN_ADDRESS);

    const ArbitrationDAOFactory = await ethers.getContractFactory("ArbitrationDAO");
    const arbitrationDAO = await ArbitrationDAOFactory.deploy(FEED_TOKEN_ADDRESS);
    await arbitrationDAO.waitForDeployment();
    const daoAddr = await arbitrationDAO.getAddress();

    console.log("✅ ArbitrationDAO deployed to:", daoAddr);

    // ============ 总结 ============
    console.log("\n" + "=".repeat(60));
    console.log("🎉 ARBITRATION DAO DEPLOYED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log(`ArbitrationDAO: ${daoAddr}`);
    console.log(`FEEDToken:      ${FEED_TOKEN_ADDRESS}`);
    console.log("=".repeat(60));

    // 输出 .env 格式
    console.log("\n📋 Add to .env:");
    console.log(`ARBITRATION_DAO_CONTRACT=${daoAddr}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
