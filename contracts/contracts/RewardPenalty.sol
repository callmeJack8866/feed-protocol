// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title RewardPenalty
 * @dev 奖惩系统 — UUPS 可升级
 *
 * 奖励分配比例（方案要求）：
 * - 70% 喂价员
 * - 10% 平台金库
 * - 10% DAO 金库
 * - 10% 销毁
 *
 * 惩罚等级：
 * - WARNING  (0)：口头警告，无实际扣减
 * - MINOR    (1)：扣除质押 5%
 * - MAJOR    (2)：扣除质押 20% + 禁止抢单 7 天
 * - CRITICAL (3)：扣除质押 50% + 永久封禁
 */
contract RewardPenalty is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============ 数据结构 ============

    /// @notice 惩罚等级
    enum PenaltyLevel { WARNING, MINOR, MAJOR, CRITICAL }

    /// @notice 惩罚记录
    struct PenaltyRecord {
        PenaltyLevel level;
        string reason;
        uint256 slashedAmount;
        uint256 timestamp;
        uint256 banUntil;     // 禁止抢单截止时间 (0=无限期)
    }

    /// @notice 奖励分配比例 (basis points)
    struct RewardSplit {
        uint256 feederBps;    // 喂价员比例
        uint256 platformBps;  // 平台比例
        uint256 daoBps;       // DAO 比例
        uint256 burnBps;      // 销毁比例
    }

    // ============ 状态变量 ============

    /// @notice FEED 代币地址
    IERC20 public feedToken;

    /// @notice 平台金库地址
    address public platformTreasury;

    /// @notice DAO 金库地址
    address public daoTreasury;

    /// @notice 奖励分配比例
    RewardSplit public rewardSplit;

    /// @notice 各惩罚等级的质押扣除比例 (basis points)
    mapping(PenaltyLevel => uint256) public penaltySlashBps;

    /// @notice 各惩罚等级的禁止抢单天数
    mapping(PenaltyLevel => uint256) public penaltyBanDays;

    /// @notice 用户的惩罚记录
    mapping(address => PenaltyRecord[]) public penaltyHistory;

    /// @notice 用户是否被永久封禁
    mapping(address => bool) public permanentlyBanned;

    /// @notice 用户的禁止抢单截止时间
    mapping(address => uint256) public banUntil;

    /// @notice 授权操作者
    mapping(address => bool) public authorizedOperators;

    /// @notice 各用户累计获得的奖励
    mapping(address => uint256) public totalRewardsEarned;

    /// @notice 待领取奖励
    mapping(address => uint256) public pendingRewards;

    // ============ 事件 ============

    event RewardDistributed(
        bytes32 indexed orderId,
        uint256 totalAmount,
        uint256 feederAmount,
        uint256 platformAmount,
        uint256 daoAmount,
        uint256 burnAmount
    );
    event RewardClaimed(address indexed feeder, uint256 amount);
    event PenaltyApplied(address indexed feeder, PenaltyLevel level, uint256 slashedAmount, string reason);
    event FeederBanned(address indexed feeder, uint256 until);
    event FeederPermanentlyBanned(address indexed feeder);
    event OperatorUpdated(address indexed operator, bool authorized);

    modifier onlyOperator() {
        require(authorizedOperators[msg.sender] || msg.sender == owner(), "RewardPenalty: not operator");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 初始化
     * @param owner_ 所有者
     * @param feedToken_ FEED 代币地址
     * @param platformTreasury_ 平台金库
     * @param daoTreasury_ DAO 金库
     */
    function initialize(
        address owner_,
        address feedToken_,
        address platformTreasury_,
        address daoTreasury_
    ) public initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        feedToken = IERC20(feedToken_);
        platformTreasury = platformTreasury_;
        daoTreasury = daoTreasury_;

        // 默认分配比例: 70/10/10/10
        rewardSplit = RewardSplit({
            feederBps: 7000,
            platformBps: 1000,
            daoBps: 1000,
            burnBps: 1000
        });

        // 默认惩罚扣除比例
        penaltySlashBps[PenaltyLevel.WARNING] = 0;
        penaltySlashBps[PenaltyLevel.MINOR] = 500;     // 5%
        penaltySlashBps[PenaltyLevel.MAJOR] = 2000;    // 20%
        penaltySlashBps[PenaltyLevel.CRITICAL] = 5000; // 50%

        // 默认禁止天数
        penaltyBanDays[PenaltyLevel.WARNING] = 0;
        penaltyBanDays[PenaltyLevel.MINOR] = 1;
        penaltyBanDays[PenaltyLevel.MAJOR] = 7;
        penaltyBanDays[PenaltyLevel.CRITICAL] = 0; // 永久
    }

    // ============ 管理函数 ============

    function setOperator(address operator, bool authorized) external onlyOwner {
        authorizedOperators[operator] = authorized;
        emit OperatorUpdated(operator, authorized);
    }

    function updateRewardSplit(
        uint256 feederBps,
        uint256 platformBps,
        uint256 daoBps,
        uint256 burnBps
    ) external onlyOwner {
        require(feederBps + platformBps + daoBps + burnBps == 10000, "Must total 10000 bps");
        rewardSplit = RewardSplit(feederBps, platformBps, daoBps, burnBps);
    }

    function updateTreasuries(address platform, address dao) external onlyOwner {
        if (platform != address(0)) platformTreasury = platform;
        if (dao != address(0)) daoTreasury = dao;
    }

    // ============ 奖励分配 ============

    /**
     * @notice 分配订单奖励给多个喂价员
     * @param orderId 订单ID
     * @param feeders 喂价员地址数组
     * @param totalReward 总奖励金额
     */
    function distributeRewards(
        bytes32 orderId,
        address[] calldata feeders,
        uint256 totalReward
    ) external onlyOperator nonReentrant {
        require(feeders.length > 0, "No feeders");
        require(totalReward > 0, "Zero reward");

        // 计算各部分
        uint256 feederTotal = (totalReward * rewardSplit.feederBps) / 10000;
        uint256 platformAmount = (totalReward * rewardSplit.platformBps) / 10000;
        uint256 daoAmount = (totalReward * rewardSplit.daoBps) / 10000;
        uint256 burnAmount = totalReward - feederTotal - platformAmount - daoAmount;

        // 每个喂价员平均分
        uint256 perFeeder = feederTotal / feeders.length;

        // 记录待领取奖励
        for (uint256 i = 0; i < feeders.length; i++) {
            if (!permanentlyBanned[feeders[i]]) {
                pendingRewards[feeders[i]] += perFeeder;
                totalRewardsEarned[feeders[i]] += perFeeder;
            }
        }

        // 转账给平台和 DAO 金库
        if (platformAmount > 0 && platformTreasury != address(0)) {
            feedToken.transfer(platformTreasury, platformAmount);
        }
        if (daoAmount > 0 && daoTreasury != address(0)) {
            feedToken.transfer(daoTreasury, daoAmount);
        }

        // 销毁部分：转到 address(0xdead) 模拟销毁
        if (burnAmount > 0) {
            feedToken.transfer(address(0xdead), burnAmount);
        }

        emit RewardDistributed(orderId, totalReward, feederTotal, platformAmount, daoAmount, burnAmount);
    }

    /**
     * @notice 喂价员领取待领取奖励
     */
    function claimRewards() external nonReentrant {
        require(!permanentlyBanned[msg.sender], "Permanently banned");
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No pending rewards");

        pendingRewards[msg.sender] = 0;
        feedToken.transfer(msg.sender, amount);

        emit RewardClaimed(msg.sender, amount);
    }

    // ============ 惩罚系统 ============

    /**
     * @notice 对喂价员施加惩罚
     * @param feeder 喂价员地址
     * @param level 惩罚等级
     * @param reason 惩罚原因
     * @param stakedAmount 该喂价员当前质押金额（用于计算扣除）
     * @return slashedAmount 实际扣除金额
     */
    function applyPenalty(
        address feeder,
        PenaltyLevel level,
        string calldata reason,
        uint256 stakedAmount
    ) external onlyOperator returns (uint256 slashedAmount) {
        require(!permanentlyBanned[feeder], "Already banned");

        // 计算扣除金额
        slashedAmount = (stakedAmount * penaltySlashBps[level]) / 10000;

        // 计算禁止截止时间
        uint256 banEnd = 0;
        if (level == PenaltyLevel.CRITICAL) {
            permanentlyBanned[feeder] = true;
            emit FeederPermanentlyBanned(feeder);
        } else if (penaltyBanDays[level] > 0) {
            banEnd = block.timestamp + (penaltyBanDays[level] * 1 days);
            if (banEnd > banUntil[feeder]) {
                banUntil[feeder] = banEnd;
            }
            emit FeederBanned(feeder, banEnd);
        }

        // 记录惩罚
        penaltyHistory[feeder].push(PenaltyRecord({
            level: level,
            reason: reason,
            slashedAmount: slashedAmount,
            timestamp: block.timestamp,
            banUntil: banEnd
        }));

        emit PenaltyApplied(feeder, level, slashedAmount, reason);
    }

    // ============ 查询函数 ============

    /**
     * @notice 检查喂价员是否可以抢单
     */
    function canGrabOrder(address feeder) external view returns (bool) {
        if (permanentlyBanned[feeder]) return false;
        if (banUntil[feeder] > block.timestamp) return false;
        return true;
    }

    /**
     * @notice 获取喂价员惩罚记录数量
     */
    function getPenaltyCount(address feeder) external view returns (uint256) {
        return penaltyHistory[feeder].length;
    }

    /**
     * @notice 获取单条惩罚记录
     */
    function getPenaltyRecord(address feeder, uint256 index)
        external
        view
        returns (PenaltyLevel level, string memory reason, uint256 slashedAmount, uint256 timestamp)
    {
        PenaltyRecord storage record = penaltyHistory[feeder][index];
        return (record.level, record.reason, record.slashedAmount, record.timestamp);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
