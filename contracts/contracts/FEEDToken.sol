// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title FEEDToken
 * @dev BEP-20 代币 — UUPS 可升级
 *
 * 功能：
 * - 固定总量 10,000,000 枚 (18 decimals)
 * - 部署时一次性 mint 全部给 owner
 * - 支持销毁 (burn) 用于奖惩系统
 * - UUPS 代理模式可升级
 */
contract FEEDToken is
    Initializable,
    ERC20Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    /// @notice 固定总量: 10,000,000 * 10^18
    uint256 public constant MAX_SUPPLY = 10_000_000 * 1e18;

    /// @notice 是否已完成初始铸造
    bool public initialMintDone;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 初始化函数（替代 constructor）
     * @param owner_ 合约所有者，接收全部初始代币
     */
    function initialize(address owner_) public initializer {
        __ERC20_init("FEED Token", "FEED");
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();

        _mint(owner_, MAX_SUPPLY);
        initialMintDone = true;
    }

    /**
     * @notice 销毁代币（用于奖惩系统的 10% 销毁）
     * @param amount 销毁数量
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @notice 授权第三方销毁代币
     * @param account 被销毁地址
     * @param amount 销毁数量
     */
    function burnFrom(address account, uint256 amount) external {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    /**
     * @dev UUPS 升级授权 — 仅 owner
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
