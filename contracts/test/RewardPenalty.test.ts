import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { RewardPenalty, FEEDToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RewardPenalty", function () {
    let rewardPenalty: RewardPenalty;
    let feedToken: FEEDToken;
    let owner: SignerWithAddress;
    let operator: SignerWithAddress;
    let platform: SignerWithAddress;
    let dao: SignerWithAddress;
    let feeder1: SignerWithAddress;
    let feeder2: SignerWithAddress;

    beforeEach(async function () {
        [owner, operator, platform, dao, feeder1, feeder2] = await ethers.getSigners();

        // 部署 FEED Token
        const TokenFactory = await ethers.getContractFactory("FEEDToken");
        feedToken = (await upgrades.deployProxy(TokenFactory, [owner.address], {
            initializer: "initialize",
            kind: "uups",
        })) as unknown as FEEDToken;

        // 部署 RewardPenalty
        const RPFactory = await ethers.getContractFactory("RewardPenalty");
        rewardPenalty = (await upgrades.deployProxy(
            RPFactory,
            [owner.address, await feedToken.getAddress(), platform.address, dao.address],
            { initializer: "initialize", kind: "uups" }
        )) as unknown as RewardPenalty;

        await rewardPenalty.setOperator(operator.address, true);

        // 转代币给 RewardPenalty 合约用于分配
        await feedToken.transfer(
            await rewardPenalty.getAddress(),
            ethers.parseUnits("100000", 18)
        );
    });

    describe("初始化", function () {
        it("应设置正确的分配比例 70/10/10/10", async function () {
            const split = await rewardPenalty.rewardSplit();
            expect(split.feederBps).to.equal(7000);
            expect(split.platformBps).to.equal(1000);
            expect(split.daoBps).to.equal(1000);
            expect(split.burnBps).to.equal(1000);
        });
    });

    describe("奖励分配", function () {
        it("应按比例分配奖励", async function () {
            const totalReward = ethers.parseUnits("1000", 18);
            const orderId = ethers.id("order-001");

            await rewardPenalty.connect(operator).distributeRewards(
                orderId,
                [feeder1.address, feeder2.address],
                totalReward
            );

            // 每个 feeder 应得 700 / 2 = 350
            const perFeeder = ethers.parseUnits("350", 18);
            expect(await rewardPenalty.pendingRewards(feeder1.address)).to.equal(perFeeder);
            expect(await rewardPenalty.pendingRewards(feeder2.address)).to.equal(perFeeder);

            // 平台应得 100
            expect(await feedToken.balanceOf(platform.address)).to.equal(ethers.parseUnits("100", 18));

            // DAO 应得 100
            expect(await feedToken.balanceOf(dao.address)).to.equal(ethers.parseUnits("100", 18));
        });

        it("喂价员可以领取奖励", async function () {
            const totalReward = ethers.parseUnits("1000", 18);
            await rewardPenalty.connect(operator).distributeRewards(
                ethers.id("order-001"),
                [feeder1.address],
                totalReward
            );

            // 领取
            await rewardPenalty.connect(feeder1).claimRewards();
            expect(await feedToken.balanceOf(feeder1.address)).to.equal(ethers.parseUnits("700", 18));
            expect(await rewardPenalty.pendingRewards(feeder1.address)).to.equal(0);
        });
    });

    describe("惩罚系统", function () {
        it("WARNING 不扣除质押", async function () {
            const result = await rewardPenalty.connect(operator).applyPenalty.staticCall(
                feeder1.address, 0, "test warning", ethers.parseUnits("1000", 18)
            );
            expect(result).to.equal(0);
        });

        it("MINOR 扣除 5%", async function () {
            const result = await rewardPenalty.connect(operator).applyPenalty.staticCall(
                feeder1.address, 1, "minor offense", ethers.parseUnits("1000", 18)
            );
            expect(result).to.equal(ethers.parseUnits("50", 18));
        });

        it("MAJOR 扣除 20%", async function () {
            const result = await rewardPenalty.connect(operator).applyPenalty.staticCall(
                feeder1.address, 2, "major offense", ethers.parseUnits("1000", 18)
            );
            expect(result).to.equal(ethers.parseUnits("200", 18));
        });

        it("CRITICAL 永久封禁", async function () {
            await rewardPenalty.connect(operator).applyPenalty(
                feeder1.address, 3, "critical offense", ethers.parseUnits("1000", 18)
            );
            expect(await rewardPenalty.permanentlyBanned(feeder1.address)).to.be.true;
            expect(await rewardPenalty.canGrabOrder(feeder1.address)).to.be.false;
        });

        it("惩罚记录应正确保存", async function () {
            await rewardPenalty.connect(operator).applyPenalty(
                feeder1.address, 1, "minor offense", ethers.parseUnits("1000", 18)
            );
            expect(await rewardPenalty.getPenaltyCount(feeder1.address)).to.equal(1);
        });
    });

    describe("抢单检查", function () {
        it("正常用户可以抢单", async function () {
            expect(await rewardPenalty.canGrabOrder(feeder1.address)).to.be.true;
        });

        it("被封禁用户不能抢单", async function () {
            await rewardPenalty.connect(operator).applyPenalty(
                feeder1.address, 3, "critical", ethers.parseUnits("1000", 18)
            );
            expect(await rewardPenalty.canGrabOrder(feeder1.address)).to.be.false;
        });
    });
});
