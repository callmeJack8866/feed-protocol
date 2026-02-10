// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./FeedConsensus.sol";
import "./RewardPenalty.sol";
import "./FeederLicense.sol";

/**
 * @title FeedEngine
 * @dev 主合约（门面模式） — UUPS 可升级
 *
 * 整合子合约功能：
 * - 喂价员注册 + 等级管理
 * - 订单创建 + 抢单 + 结算
 * - 质押 (stake/unstake/withdraw)
 * - 调用 FeedConsensus 进行共识
 * - 调用 RewardPenalty 进行奖惩
 */
contract FeedEngine is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============ 数据结构 ============

    /// @notice 喂价员等级
    enum FeederRank { F, E, D, C, B, A, S }

    /// @notice 喂价员信息
    struct FeederInfo {
        bool registered;
        FeederRank rank;
        uint256 xp;
        uint256 totalFeeds;
        uint256 stakedAmount;
        uint256 unstakeRequestTime; // 解锁请求时间
        uint256 dailyGrabCount;     // 当日抢单数
        uint256 lastGrabDate;       // 上次抢单日期
    }

    /// @notice 内部订单记录
    struct EngineOrder {
        bytes32 orderId;
        address[] assignedFeeders;
        uint256 rewardAmount;       // FEED 奖励
        bool settled;
    }

    /// @notice 外部协议喂价请求记录
    struct FeedRequest {
        address requester;          // 请求方合约/地址
        uint256 requiredFeeders;    // 所需喂价员数量
        uint256 rewardAmount;       // FEED 奖励
        uint256 timestamp;          // 请求时间
        bool exists;                // 是否存在
    }

    // ============ 子合约引用 ============

    /// @notice FEED 代币
    IERC20 public feedToken;

    /// @notice 共识引擎
    FeedConsensus public consensus;

    /// @notice 奖惩系统
    RewardPenalty public rewardPenalty;

    /// @notice NFT 执照
    FeederLicense public feederLicense;

    // ============ 状态变量 ============

    /// @notice 喂价员信息
    mapping(address => FeederInfo) public feeders;

    /// @notice 内部订单记录
    mapping(bytes32 => EngineOrder) public engineOrders;

    /// @notice 外部协议喂价请求
    mapping(bytes32 => FeedRequest) public feedRequests;

    /// @notice 已授权的协议合约（白名单）
    mapping(address => bool) public authorizedProtocols;

    /// @notice 各等级最低质押要求 (USDT, 18 decimals)
    mapping(FeederRank => uint256) public minStakeByRank;

    /// @notice 各等级每日最大抢单数
    mapping(FeederRank => uint256) public maxDailyGrabByRank;

    /// @notice 解锁等待期（秒）
    uint256 public unstakeCooldown;

    /// @notice 各等级升级所需 XP
    mapping(FeederRank => uint256) public xpThresholds;

    /// @notice 注册喂价员总数
    uint256 public totalFeeders;

    // ============ 事件 ============

    event FeederRegistered(address indexed feeder, uint256 licenseTokenId);
    event FeederRankUpdated(address indexed feeder, FeederRank oldRank, FeederRank newRank);
    event Staked(address indexed feeder, uint256 amount);
    event UnstakeRequested(address indexed feeder, uint256 amount);
    event Withdrawn(address indexed feeder, uint256 amount);
    event OrderGrabbed(bytes32 indexed orderId, address indexed feeder);
    event OrderSettled(bytes32 indexed orderId, uint256 consensusPrice, uint256 reward);
    event XPAwarded(address indexed feeder, uint256 amount, string reason);
    event FeedRequested(bytes32 indexed orderId, address indexed requester, uint256 requiredFeeders, uint256 rewardAmount);
    event ProtocolAuthorized(address indexed protocol, bool authorized);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 初始化
     */
    function initialize(
        address owner_,
        address feedToken_,
        address consensus_,
        address rewardPenalty_,
        address feederLicense_
    ) public initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        feedToken = IERC20(feedToken_);
        consensus = FeedConsensus(consensus_);
        rewardPenalty = RewardPenalty(rewardPenalty_);
        feederLicense = FeederLicense(feederLicense_);

        unstakeCooldown = 7 days;

        // 默认最低质押 (18 decimals)
        minStakeByRank[FeederRank.F] = 100 * 1e18;
        minStakeByRank[FeederRank.E] = 200 * 1e18;
        minStakeByRank[FeederRank.D] = 500 * 1e18;
        minStakeByRank[FeederRank.C] = 1_000 * 1e18;
        minStakeByRank[FeederRank.B] = 2_500 * 1e18;
        minStakeByRank[FeederRank.A] = 5_000 * 1e18;
        minStakeByRank[FeederRank.S] = 25_000 * 1e18;

        // 每日最大抢单数
        maxDailyGrabByRank[FeederRank.F] = 10;
        maxDailyGrabByRank[FeederRank.E] = 15;
        maxDailyGrabByRank[FeederRank.D] = 20;
        maxDailyGrabByRank[FeederRank.C] = 30;
        maxDailyGrabByRank[FeederRank.B] = 50;
        maxDailyGrabByRank[FeederRank.A] = 100;
        maxDailyGrabByRank[FeederRank.S] = type(uint256).max; // 无限

        // XP 升级阈值
        xpThresholds[FeederRank.F] = 0;
        xpThresholds[FeederRank.E] = 1_000;
        xpThresholds[FeederRank.D] = 3_000;
        xpThresholds[FeederRank.C] = 8_000;
        xpThresholds[FeederRank.B] = 20_000;
        xpThresholds[FeederRank.A] = 50_000;
        xpThresholds[FeederRank.S] = 100_000;
    }

    // ============ 喂价员注册 ============

    /**
     * @notice 注册为喂价员
     * @dev 需先 approve FEED 代币用于质押
     * @param stakeAmount 初始质押金额
     */
    function registerFeeder(uint256 stakeAmount) external nonReentrant {
        require(!feeders[msg.sender].registered, "Already registered");
        require(stakeAmount >= minStakeByRank[FeederRank.F], "Insufficient stake");

        // 转入质押
        feedToken.transferFrom(msg.sender, address(this), stakeAmount);

        // 注册
        feeders[msg.sender] = FeederInfo({
            registered: true,
            rank: FeederRank.F,
            xp: 0,
            totalFeeds: 0,
            stakedAmount: stakeAmount,
            unstakeRequestTime: 0,
            dailyGrabCount: 0,
            lastGrabDate: 0
        });

        totalFeeders++;

        // 铸造基础执照 NFT
        uint256 tokenId = feederLicense.mint(
            msg.sender,
            "ipfs://QmDefault",
            FeederLicense.LicenseType.BASIC
        );

        emit FeederRegistered(msg.sender, tokenId);
    }

    // ============ 质押管理 ============

    /**
     * @notice 追加质押
     */
    function stake(uint256 amount) external nonReentrant {
        require(feeders[msg.sender].registered, "Not registered");
        require(amount > 0, "Zero amount");

        feedToken.transferFrom(msg.sender, address(this), amount);
        feeders[msg.sender].stakedAmount += amount;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice 请求解除质押
     */
    function requestUnstake() external {
        FeederInfo storage feeder = feeders[msg.sender];
        require(feeder.registered, "Not registered");
        require(feeder.unstakeRequestTime == 0, "Already requested");

        feeder.unstakeRequestTime = block.timestamp;
        emit UnstakeRequested(msg.sender, feeder.stakedAmount);
    }

    /**
     * @notice 提取已解锁的质押
     */
    function withdraw() external nonReentrant {
        FeederInfo storage feeder = feeders[msg.sender];
        require(feeder.registered, "Not registered");
        require(feeder.unstakeRequestTime > 0, "No unstake request");
        require(
            block.timestamp >= feeder.unstakeRequestTime + unstakeCooldown,
            "Cooldown not met"
        );

        uint256 amount = feeder.stakedAmount;
        require(amount > 0, "Zero balance");

        feeder.stakedAmount = 0;
        feeder.unstakeRequestTime = 0;

        feedToken.transfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ============ 订单管理 ============

    /**
     * @notice 抢单
     * @param orderId 订单 ID
     */
    function grabOrder(bytes32 orderId) external {
        FeederInfo storage feeder = feeders[msg.sender];
        require(feeder.registered, "Not registered");
        require(feeder.stakedAmount >= minStakeByRank[feeder.rank], "Insufficient stake for rank");
        require(rewardPenalty.canGrabOrder(msg.sender), "Banned from grabbing");

        // 每日抢单数限制
        uint256 today = block.timestamp / 1 days;
        if (feeder.lastGrabDate != today) {
            feeder.dailyGrabCount = 0;
            feeder.lastGrabDate = today;
        }
        require(feeder.dailyGrabCount < maxDailyGrabByRank[feeder.rank], "Daily grab limit reached");

        // 记录
        engineOrders[orderId].assignedFeeders.push(msg.sender);
        feeder.dailyGrabCount++;

        emit OrderGrabbed(orderId, msg.sender);
    }

    /**
     * @notice 结算订单（由 operator/owner 调用）
     * @param orderId 订单 ID
     * @param rewardAmount 奖励总额
     */
    function settleOrder(bytes32 orderId, uint256 rewardAmount) external onlyOwner nonReentrant {
        EngineOrder storage eo = engineOrders[orderId];
        require(!eo.settled, "Already settled");
        require(eo.assignedFeeders.length > 0, "No feeders assigned");

        eo.settled = true;
        eo.rewardAmount = rewardAmount;

        // 获取共识价格
        uint256 cPrice = consensus.getConsensusPrice(orderId);

        // 结算共识合约中的订单
        consensus.settleOrder(orderId);

        // 分配奖励
        if (rewardAmount > 0) {
            rewardPenalty.distributeRewards(orderId, eo.assignedFeeders, rewardAmount);
        }

        // 给参与者加 XP
        for (uint256 i = 0; i < eo.assignedFeeders.length; i++) {
            _awardXP(eo.assignedFeeders[i], 50, "feed_completed");
        }

        emit OrderSettled(orderId, cPrice, rewardAmount);
    }

    // ============ 等级系统 ============

    /**
     * @notice 发放 XP 并检查升级
     */
    function _awardXP(address feederAddr, uint256 amount, string memory reason) internal {
        FeederInfo storage feeder = feeders[feederAddr];
        if (!feeder.registered) return;

        feeder.xp += amount;
        feeder.totalFeeds++;

        emit XPAwarded(feederAddr, amount, reason);

        // 检查升级
        _checkRankUp(feederAddr);
    }

    /**
     * @notice 检查并执行等级升级
     */
    function _checkRankUp(address feederAddr) internal {
        FeederInfo storage feeder = feeders[feederAddr];
        FeederRank currentRank = feeder.rank;

        // 逐级检查
        if (currentRank < FeederRank.S) {
            FeederRank nextRank = FeederRank(uint8(currentRank) + 1);
            if (
                feeder.xp >= xpThresholds[nextRank] &&
                feeder.stakedAmount >= minStakeByRank[nextRank]
            ) {
                feeder.rank = nextRank;
                emit FeederRankUpdated(feederAddr, currentRank, nextRank);

                // 递归检查是否可以跳级
                _checkRankUp(feederAddr);
            }
        }
    }

    /**
     * @notice 手动发放 XP（管理员用）
     */
    function awardXP(address feederAddr, uint256 amount, string calldata reason) external onlyOwner {
        _awardXP(feederAddr, amount, reason);
    }

    // ============ 管理函数 ============

    /**
     * @notice 更新最低质押要求
     */
    function updateMinStake(FeederRank rank, uint256 amount) external onlyOwner {
        minStakeByRank[rank] = amount;
    }

    /**
     * @notice 更新解锁等待期
     */
    function updateUnstakeCooldown(uint256 cooldown) external onlyOwner {
        require(cooldown >= 1 days, "Too short");
        unstakeCooldown = cooldown;
    }

    /**
     * @notice 更新子合约地址
     */
    function updateSubContracts(
        address consensus_,
        address rewardPenalty_,
        address feederLicense_
    ) external onlyOwner {
        if (consensus_ != address(0)) consensus = FeedConsensus(consensus_);
        if (rewardPenalty_ != address(0)) rewardPenalty = RewardPenalty(rewardPenalty_);
        if (feederLicense_ != address(0)) feederLicense = FeederLicense(feederLicense_);
    }

    // ============ 查询函数 ============

    /**
     * @notice 获取喂价员完整信息
     */
    function getFeederInfo(address feederAddr)
        external
        view
        returns (
            bool registered,
            FeederRank rank,
            uint256 xp,
            uint256 totalFeeds,
            uint256 stakedAmount,
            uint256 pendingRewards
        )
    {
        FeederInfo storage f = feeders[feederAddr];
        return (
            f.registered,
            f.rank,
            f.xp,
            f.totalFeeds,
            f.stakedAmount,
            rewardPenalty.pendingRewards(feederAddr)
        );
    }

    /**
     * @notice 获取订单已分配的喂价员
     */
    function getOrderFeeders(bytes32 orderId) external view returns (address[] memory) {
        return engineOrders[orderId].assignedFeeders;
    }

    // ============ 外部协议集成接口 ============

    /**
     * @notice 外部协议发起喂价请求（NST 等链上协议调用）
     * @dev 需先将 FEED 代币 approve 给本合约作为奖励
     * @param orderId 订单 ID（由调用方生成 keccak256 哈希）
     * @param requiredFeeders 所需喂价员数量
     * @param rewardAmount 奖励金额（FEED 代币，18 decimals）
     */
    function requestFeed(
        bytes32 orderId,
        uint256 requiredFeeders,
        uint256 rewardAmount
    ) external nonReentrant {
        require(authorizedProtocols[msg.sender] || msg.sender == owner(), "Not authorized protocol");
        require(!feedRequests[orderId].exists, "Request already exists");
        require(requiredFeeders >= 3, "Minimum 3 feeders");
        require(rewardAmount > 0, "Zero reward");

        // 转入奖励代币
        feedToken.transferFrom(msg.sender, address(this), rewardAmount);

        // 记录请求
        feedRequests[orderId] = FeedRequest({
            requester: msg.sender,
            requiredFeeders: requiredFeeders,
            rewardAmount: rewardAmount,
            timestamp: block.timestamp,
            exists: true
        });

        // 设置 engineOrder（复用现有抢单逻辑）
        engineOrders[orderId].orderId = orderId;
        engineOrders[orderId].rewardAmount = rewardAmount;

        emit FeedRequested(orderId, msg.sender, requiredFeeders, rewardAmount);
    }

    /**
     * @notice 获取共识价格（供外部协议查询）
     * @param orderId 订单 ID
     * @return price 共识价格
     * @return timestamp 共识时间戳
     * @return finalized 是否已完成结算
     */
    function getConsensusPrice(bytes32 orderId) external view returns (
        uint256 price,
        uint256 timestamp,
        bool finalized
    ) {
        price = consensus.getConsensusPrice(orderId);
        timestamp = feedRequests[orderId].timestamp;
        finalized = engineOrders[orderId].settled;
    }

    /**
     * @notice 授权/取消授权外部协议合约
     * @param protocol 协议合约地址
     * @param authorized 是否授权
     */
    function setAuthorizedProtocol(address protocol, bool authorized) external onlyOwner {
        require(protocol != address(0), "Zero address");
        authorizedProtocols[protocol] = authorized;
        emit ProtocolAuthorized(protocol, authorized);
    }

    /**
     * @notice 检查协议是否已授权
     */
    function isProtocolAuthorized(address protocol) external view returns (bool) {
        return authorizedProtocols[protocol];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
