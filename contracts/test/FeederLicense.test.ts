import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FeederLicense } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FeederLicense", function () {
    let license: FeederLicense;
    let owner: SignerWithAddress;
    let minter: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    beforeEach(async function () {
        [owner, minter, user1, user2] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("FeederLicense");
        license = (await upgrades.deployProxy(Factory, [owner.address], {
            initializer: "initialize",
            kind: "uups",
        })) as unknown as FeederLicense;

        // 授权 minter
        await license.setMinter(minter.address, true);
    });

    describe("初始化", function () {
        it("应设置正确的名称和符号", async function () {
            expect(await license.name()).to.equal("Feeder License");
            expect(await license.symbol()).to.equal("FLNFT");
        });

        it("nextTokenId 应从 1 开始", async function () {
            expect(await license.nextTokenId()).to.equal(1);
        });
    });

    describe("铸造权限", function () {
        it("授权 minter 可以铸造", async function () {
            await license.connect(minter).mint(user1.address, "ipfs://test", 0);
            expect(await license.balanceOf(user1.address)).to.equal(1);
        });

        it("非授权地址不能铸造", async function () {
            await expect(
                license.connect(user1).mint(user2.address, "ipfs://test", 0)
            ).to.be.revertedWith("FeederLicense: not authorized minter");
        });

        it("owner 可以铸造", async function () {
            await license.mint(user1.address, "ipfs://test", 0);
            expect(await license.balanceOf(user1.address)).to.equal(1);
        });
    });

    describe("执照类型", function () {
        it("应记录正确的执照类型", async function () {
            await license.connect(minter).mint(user1.address, "ipfs://basic", 0);    // BASIC
            await license.connect(minter).mint(user2.address, "ipfs://premium", 2);  // PREMIUM

            expect(await license.licenseTypes(1)).to.equal(0); // BASIC
            expect(await license.licenseTypes(2)).to.equal(2); // PREMIUM
        });
    });

    describe("按 owner 查询", function () {
        it("应返回用户的所有 tokenId", async function () {
            await license.connect(minter).mint(user1.address, "ipfs://1", 0);
            await license.connect(minter).mint(user1.address, "ipfs://2", 1);
            await license.connect(minter).mint(user2.address, "ipfs://3", 0);

            const tokens = await license.getTokensByOwner(user1.address);
            expect(tokens.length).to.equal(2);
            expect(tokens[0]).to.equal(1);
            expect(tokens[1]).to.equal(2);
        });
    });

    describe("销毁", function () {
        it("owner 可以销毁", async function () {
            await license.connect(minter).mint(user1.address, "ipfs://1", 0);
            await license.connect(user1).burn(1);
            expect(await license.balanceOf(user1.address)).to.equal(0);
        });

        it("非授权者不能销毁", async function () {
            await license.connect(minter).mint(user1.address, "ipfs://1", 0);
            await expect(
                license.connect(user2).burn(1)
            ).to.be.revertedWith("FeederLicense: not authorized to burn");
        });
    });

    describe("tokenURI", function () {
        it("应返回正确的 URI", async function () {
            await license.connect(minter).mint(user1.address, "ipfs://QmTestHash", 0);
            expect(await license.tokenURI(1)).to.equal("ipfs://QmTestHash");
        });
    });
});
