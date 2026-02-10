import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FeedEngine, FEEDToken, FeedConsensus, RewardPenalty, FeederLicense } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FeedEngine (集成测试)", function () {
    let feedEngine: FeedEngine;
    let feedToken: FEEDToken;
    let consensus: FeedConsensus;
    let rewardPenalty: RewardPenalty;
    let feederLicense: FeederLicense;
    let owner: SignerWithAddress;
    let feeder1: SignerWithAddress;
    let feeder2: SignerWithAddress;
    let feeder3: SignerWithAddress;
    let platform: SignerWithAddress;
    let dao: SignerWithAddress;

    beforeEach(async function () {
        [owner, feeder1, feeder2, feeder3, platform, dao] = await ethers.getSigners();

        // 1. 部署 FEEDToken
        const TokenFactory = await ethers.getContractFactory("FEEDToken");
        feedToken = (await upgrades.deployProxy(TokenFactory, [owner.address], {
            initializer: "initialize", kind: "uups"
        })) as unknown as FEEDToken;

        // 2. 部署 FeedConsensus
        const ConsensusFactory = await ethers.getContractFactory("FeedConsensus");
        consensus = (await upgrades.deployProxy(ConsensusFactory, [owner.address, 3600, 1800], {
            initializer: "initialize", kind: "uups"
        })) as unknown as FeedConsensus;

        // 3. 部署 FeederLicense
        const LicenseFactory = await ethers.getContractFactory("FeederLicense");
        feederLicense = (await upgrades.deployProxy(LicenseFactory, [owner.address], {
            initializer: "initialize", kind: "uups"
        })) as unknown as FeederLicense;

        // 4. 部署 RewardPenalty
        const RPFactory = await ethers.getContractFactory("RewardPenalty");
        rewardPenalty = (await upgrades.deployProxy(
            RPFactory,
            [owner.address, await feedToken.getAddress(), platform.address, dao.address],
            { initializer: "initialize", kind: "uups" }
        )) as unknown as RewardPenalty;

        // 5. 部署 FeedEngine
        const EngineFactory = await ethers.getContractFactory("FeedEngine");
        feedEngine = (await upgrades.deployProxy(
            EngineFactory,
            [
                owner.address,
                await feedToken.getAddress(),
                await consensus.getAddress(),
                await rewardPenalty.getAddress(),
                await feederLicense.getAddress(),
            ],
            { initializer: "initialize", kind: "uups" }
        )) as unknown as FeedEngine;

        // 6. 设置权限
        const engineAddr = await feedEngine.getAddress();
        await consensus.setOperator(engineAddr, true);
        await rewardPenalty.setOperator(engineAddr, true);
        await feederLicense.setMinter(engineAddr, true);

        // 7. 给 feeders FEED 代币用于质押
        const stakeAmount = ethers.parseUnits("200", 18);
        await feedToken.transfer(feeder1.address, stakeAmount);
        await feedToken.transfer(feeder2.address, stakeAmount);
        await feedToken.transfer(feeder3.address, stakeAmount);

        // 8. 给 RewardPenalty 合约代币用于分配奖励
        await feedToken.transfer(
            await rewardPenalty.getAddress(),
            ethers.parseUnits("50000", 18)
        );
    });

    describe("喂价员注册", function () {
        it("应成功注册并获得 NFT 执照", async function () {
            const stakeAmount = ethers.parseUnits("100", 18);
            await feedToken.connect(feeder1).approve(await feedEngine.getAddress(), stakeAmount);

            await expect(feedEngine.connect(feeder1).registerFeeder(stakeAmount))
                .to.emit(feedEngine, "FeederRegistered");

            const info = await feedEngine.getFeederInfo(feeder1.address);
            expect(info.registered).to.be.true;
            expect(info.rank).to.equal(0); // F 级
            expect(info.stakedAmount).to.equal(stakeAmount);

            // 应拥有 1 个 NFT
            expect(await feederLicense.balanceOf(feeder1.address)).to.equal(1);
        });

        it("质押不足应 revert", async function () {
            const tooLow = ethers.parseUnits("50", 18);
            await feedToken.connect(feeder1).approve(await feedEngine.getAddress(), tooLow);

            await expect(
                feedEngine.connect(feeder1).registerFeeder(tooLow)
            ).to.be.revertedWith("Insufficient stake");
        });

        it("不能重复注册", async function () {
            const stakeAmount = ethers.parseUnits("100", 18);
            await feedToken.connect(feeder1).approve(await feedEngine.getAddress(), stakeAmount);
            await feedEngine.connect(feeder1).registerFeeder(stakeAmount);

            await expect(
                feedEngine.connect(feeder1).registerFeeder(stakeAmount)
            ).to.be.revertedWith("Already registered");
        });
    });

    describe("质押管理", function () {
        beforeEach(async function () {
            const stakeAmount = ethers.parseUnits("100", 18);
            await feedToken.connect(feeder1).approve(await feedEngine.getAddress(), stakeAmount);
            await feedEngine.connect(feeder1).registerFeeder(stakeAmount);
        });

        it("应允许追加质押", async function () {
            const extra = ethers.parseUnits("50", 18);
            await feedToken.connect(feeder1).approve(await feedEngine.getAddress(), extra);
            await feedEngine.connect(feeder1).stake(extra);

            const info = await feedEngine.getFeederInfo(feeder1.address);
            expect(info.stakedAmount).to.equal(ethers.parseUnits("150", 18));
        });

        it("解锁有冷却期", async function () {
            await feedEngine.connect(feeder1).requestUnstake();

            // 立即提取应 revert
            await expect(
                feedEngine.connect(feeder1).withdraw()
            ).to.be.revertedWith("Cooldown not met");
        });
    });

    describe("抢单", function () {
        beforeEach(async function () {
            // 注册 3 个喂价员
            const stakeAmount = ethers.parseUnits("100", 18);
            for (const f of [feeder1, feeder2, feeder3]) {
                await feedToken.connect(f).approve(await feedEngine.getAddress(), stakeAmount);
                await feedEngine.connect(f).registerFeeder(stakeAmount);
            }
        });

        it("注册喂价员可以抢单", async function () {
            const orderId = ethers.id("order-001");

            // 先在 consensus 中创建订单
            await consensus.connect(owner).setOperator(owner.address, true);
            await consensus.createOrder(orderId, "BTC/USDT", ethers.parseUnits("10000", 18), 3);

            await expect(
                feedEngine.connect(feeder1).grabOrder(orderId)
            ).to.emit(feedEngine, "OrderGrabbed");

            const assignedFeeders = await feedEngine.getOrderFeeders(orderId);
            expect(assignedFeeders).to.include(feeder1.address);
        });

        it("未注册用户不能抢单", async function () {
            const orderId = ethers.id("order-002");
            const [, , , , , , unregistered] = await ethers.getSigners();

            await expect(
                feedEngine.connect(unregistered).grabOrder(orderId)
            ).to.be.revertedWith("Not registered");
        });
    });

    describe("XP 与等级升级", function () {
        it("owner 发放 XP 应触发升级检查", async function () {
            const stakeAmount = ethers.parseUnits("200", 18);
            await feedToken.connect(feeder1).approve(await feedEngine.getAddress(), stakeAmount);
            await feedEngine.connect(feeder1).registerFeeder(stakeAmount);

            // 发放足够 XP 从 F→E (需要 1000 XP + 200 质押)
            await feedEngine.awardXP(feeder1.address, 1000, "manual_test");

            const info = await feedEngine.getFeederInfo(feeder1.address);
            expect(info.rank).to.equal(1); // E 级
            expect(info.xp).to.equal(1000);
        });
    });
});
