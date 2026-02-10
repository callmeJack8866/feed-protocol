import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FEEDToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FEEDToken", function () {
    let token: FEEDToken;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        const FEEDTokenFactory = await ethers.getContractFactory("FEEDToken");
        token = (await upgrades.deployProxy(FEEDTokenFactory, [owner.address], {
            initializer: "initialize",
            kind: "uups",
        })) as unknown as FEEDToken;
    });

    describe("部署与初始化", function () {
        it("应设置正确的名称和符号", async function () {
            expect(await token.name()).to.equal("FEED Token");
            expect(await token.symbol()).to.equal("FEED");
        });

        it("应将全部总量铸造给 owner", async function () {
            const maxSupply = await token.MAX_SUPPLY();
            expect(await token.balanceOf(owner.address)).to.equal(maxSupply);
        });

        it("总量应为 10,000,000 * 10^18", async function () {
            const expected = ethers.parseUnits("10000000", 18);
            expect(await token.MAX_SUPPLY()).to.equal(expected);
        });

        it("initialMintDone 应为 true", async function () {
            expect(await token.initialMintDone()).to.be.true;
        });
    });

    describe("转账", function () {
        it("应允许正常转账", async function () {
            const amount = ethers.parseUnits("1000", 18);
            await token.transfer(user1.address, amount);
            expect(await token.balanceOf(user1.address)).to.equal(amount);
        });

        it("余额不足应 revert", async function () {
            const amount = ethers.parseUnits("1", 18);
            await expect(
                token.connect(user1).transfer(user2.address, amount)
            ).to.be.reverted;
        });
    });

    describe("销毁", function () {
        it("应允许用户销毁自己的代币", async function () {
            const amount = ethers.parseUnits("100", 18);
            await token.transfer(user1.address, amount);

            await token.connect(user1).burn(ethers.parseUnits("50", 18));
            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseUnits("50", 18));
        });

        it("burnFrom 需要 allowance", async function () {
            const amount = ethers.parseUnits("100", 18);
            await token.transfer(user1.address, amount);

            // 未授权应 revert
            await expect(
                token.connect(user2).burnFrom(user1.address, amount)
            ).to.be.reverted;

            // 授权后应成功
            await token.connect(user1).approve(user2.address, amount);
            await token.connect(user2).burnFrom(user1.address, amount);
            expect(await token.balanceOf(user1.address)).to.equal(0);
        });
    });

    describe("UUPS 升级", function () {
        it("非 owner 不能升级", async function () {
            const FEEDTokenV2 = await ethers.getContractFactory("FEEDToken", user1);
            await expect(
                upgrades.upgradeProxy(await token.getAddress(), FEEDTokenV2, { kind: "uups" })
            ).to.be.reverted;
        });
    });
});
