import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FeedConsensus } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("FeedConsensus", function () {
    let consensus: FeedConsensus;
    let owner: SignerWithAddress;
    let operator: SignerWithAddress;
    let feeder1: SignerWithAddress;
    let feeder2: SignerWithAddress;
    let feeder3: SignerWithAddress;

    const COMMIT_WINDOW = 3600;  // 1 小时
    const REVEAL_WINDOW = 1800;  // 30 分钟
    const ORDER_ID = ethers.id("order-001");

    beforeEach(async function () {
        [owner, operator, feeder1, feeder2, feeder3] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("FeedConsensus");
        consensus = (await upgrades.deployProxy(
            Factory,
            [owner.address, COMMIT_WINDOW, REVEAL_WINDOW],
            { initializer: "initialize", kind: "uups" }
        )) as unknown as FeedConsensus;

        await consensus.setOperator(operator.address, true);
    });

    describe("初始化", function () {
        it("应设置正确的时间窗口", async function () {
            expect(await consensus.commitWindow()).to.equal(COMMIT_WINDOW);
            expect(await consensus.revealWindow()).to.equal(REVEAL_WINDOW);
        });

        it("默认偏差阈值为 500 (5%)", async function () {
            expect(await consensus.maxDeviationBps()).to.equal(500);
        });
    });

    describe("订单创建", function () {
        it("operator 可以创建订单", async function () {
            await expect(
                consensus.connect(operator).createOrder(ORDER_ID, "BTC/USDT", ethers.parseUnits("10000", 18), 3)
            ).to.emit(consensus, "OrderCreated");

            expect(await consensus.getOrderPhase(ORDER_ID)).to.equal(1); // COMMIT
        });

        it("法定人数低于 3 应 revert", async function () {
            await expect(
                consensus.connect(operator).createOrder(ORDER_ID, "BTC/USDT", ethers.parseUnits("10000", 18), 2)
            ).to.be.revertedWith("Quorum too low");
        });

        it("非 operator 不能创建", async function () {
            await expect(
                consensus.connect(feeder1).createOrder(ORDER_ID, "BTC/USDT", ethers.parseUnits("10000", 18), 3)
            ).to.be.revertedWith("FeedConsensus: not operator");
        });
    });

    describe("Commit-Reveal 完整流程", function () {
        const price1 = ethers.parseUnits("50000", 8);
        const price2 = ethers.parseUnits("50100", 8);
        const price3 = ethers.parseUnits("49900", 8);
        const salt1 = ethers.id("salt1");
        const salt2 = ethers.id("salt2");
        const salt3 = ethers.id("salt3");

        beforeEach(async function () {
            await consensus.connect(operator).createOrder(
                ORDER_ID, "BTC/USDT",
                ethers.parseUnits("10000", 18),
                3
            );
        });

        it("喂价员可以提交哈希", async function () {
            const hash = await consensus.computePriceHash(price1, salt1);
            await expect(
                consensus.connect(feeder1).submitPriceHash(ORDER_ID, hash)
            ).to.emit(consensus, "PriceCommitted");
        });

        it("同一喂价员不能重复提交", async function () {
            const hash = await consensus.computePriceHash(price1, salt1);
            await consensus.connect(feeder1).submitPriceHash(ORDER_ID, hash);

            await expect(
                consensus.connect(feeder1).submitPriceHash(ORDER_ID, hash)
            ).to.be.revertedWith("Already committed");
        });

        it("达到法定人数后进入 REVEAL 阶段", async function () {
            const h1 = await consensus.computePriceHash(price1, salt1);
            const h2 = await consensus.computePriceHash(price2, salt2);
            const h3 = await consensus.computePriceHash(price3, salt3);

            await consensus.connect(feeder1).submitPriceHash(ORDER_ID, h1);
            await consensus.connect(feeder2).submitPriceHash(ORDER_ID, h2);
            await consensus.connect(feeder3).submitPriceHash(ORDER_ID, h3);

            expect(await consensus.getOrderPhase(ORDER_ID)).to.equal(2); // REVEAL
        });

        it("揭示价格 — 哈希匹配应成功", async function () {
            const h1 = await consensus.computePriceHash(price1, salt1);
            const h2 = await consensus.computePriceHash(price2, salt2);
            const h3 = await consensus.computePriceHash(price3, salt3);

            await consensus.connect(feeder1).submitPriceHash(ORDER_ID, h1);
            await consensus.connect(feeder2).submitPriceHash(ORDER_ID, h2);
            await consensus.connect(feeder3).submitPriceHash(ORDER_ID, h3);

            await expect(
                consensus.connect(feeder1).revealPrice(ORDER_ID, price1, salt1)
            ).to.emit(consensus, "PriceRevealed").withArgs(ORDER_ID, feeder1.address, price1);
        });

        it("揭示价格 — 哈希不匹配应 revert", async function () {
            const h1 = await consensus.computePriceHash(price1, salt1);
            await consensus.connect(feeder1).submitPriceHash(ORDER_ID, h1);

            // 使用错误的 salt
            await expect(
                consensus.connect(feeder1).revealPrice(ORDER_ID, price1, salt2)
            ).to.be.revertedWith("Hash mismatch");
        });

        it("完整流程: Commit → Reveal → Consensus → Settle", async function () {
            const h1 = await consensus.computePriceHash(price1, salt1);
            const h2 = await consensus.computePriceHash(price2, salt2);
            const h3 = await consensus.computePriceHash(price3, salt3);

            // Commit
            await consensus.connect(feeder1).submitPriceHash(ORDER_ID, h1);
            await consensus.connect(feeder2).submitPriceHash(ORDER_ID, h2);
            await consensus.connect(feeder3).submitPriceHash(ORDER_ID, h3);

            // Reveal
            await consensus.connect(feeder1).revealPrice(ORDER_ID, price1, salt1);
            await consensus.connect(feeder2).revealPrice(ORDER_ID, price2, salt2);
            await consensus.connect(feeder3).revealPrice(ORDER_ID, price3, salt3);

            // Consensus (中位数)
            const consensusPrice = price1; // 50000
            await consensus.connect(operator).submitConsensus(ORDER_ID, consensusPrice);
            expect(await consensus.getOrderPhase(ORDER_ID)).to.equal(3); // CONSENSUS
            expect(await consensus.getConsensusPrice(ORDER_ID)).to.equal(consensusPrice);

            // Settle
            await consensus.connect(operator).settleOrder(ORDER_ID);
            expect(await consensus.getOrderPhase(ORDER_ID)).to.equal(4); // SETTLED
        });
    });

    describe("批量提交", function () {
        it("应支持批量 commit", async function () {
            const orderId2 = ethers.id("order-002");
            await consensus.connect(operator).createOrder(ORDER_ID, "BTC/USDT", ethers.parseUnits("10000", 18), 3);
            await consensus.connect(operator).createOrder(orderId2, "ETH/USDT", ethers.parseUnits("5000", 18), 3);

            const price1 = ethers.parseUnits("50000", 8);
            const price2 = ethers.parseUnits("3000", 8);
            const salt1 = ethers.id("salt1");
            const salt2 = ethers.id("salt2");

            const h1 = await consensus.computePriceHash(price1, salt1);
            const h2 = await consensus.computePriceHash(price2, salt2);

            await consensus.connect(feeder1).batchSubmitPriceHash(
                [ORDER_ID, orderId2],
                [h1, h2]
            );

            // 验证两个订单都有记录
            const [, , committed1] = await consensus.getCommit(ORDER_ID, feeder1.address);
            const [, , committed2] = await consensus.getCommit(orderId2, feeder1.address);
            expect(committed1).to.be.true;
            expect(committed2).to.be.true;
        });
    });

    describe("超时检查", function () {
        it("commit 超时后不能提交", async function () {
            await consensus.connect(operator).createOrder(
                ORDER_ID, "BTC/USDT",
                ethers.parseUnits("10000", 18),
                3
            );

            // 快进超过 commit 窗口
            await time.increase(COMMIT_WINDOW + 1);

            const hash = await consensus.computePriceHash(ethers.parseUnits("50000", 8), ethers.id("salt"));
            await expect(
                consensus.connect(feeder1).submitPriceHash(ORDER_ID, hash)
            ).to.be.revertedWith("Commit deadline passed");
        });
    });
});
