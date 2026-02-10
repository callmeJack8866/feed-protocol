// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title FeedConsensus
 * @dev 共识引擎 — Commit-Reveal 两阶段价格提交 — UUPS 可升级
 *
 * 流程：
 * 1. Commit 阶段：喂价员提交 priceHash = keccak256(price, salt)
 * 2. Reveal 阶段：喂价员揭示 price + salt，合约验证哈希
 * 3. 共识计算：去极值中位数（链下计算，链上验证签名）
 * 4. 结算：根据共识价格结算订单
 */
contract FeedConsensus is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============ 数据结构 ============

    /// @notice 订单阶段
    enum OrderPhase { NONE, COMMIT, REVEAL, CONSENSUS, SETTLED, DISPUTED }

    /// @notice 价格提交记录
    struct PriceCommit {
        bytes32 priceHash;    // keccak256(abi.encodePacked(price, salt))
        uint256 revealedPrice; // 揭示后的价格 (8 decimals)
        bool committed;
        bool revealed;
        uint256 commitTime;
    }

    /// @notice 订单信息
    struct OrderInfo {
        bytes32 orderId;
        string symbol;
        uint256 notionalAmount;
        OrderPhase phase;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 consensusPrice;
        uint256 requiredQuorum;
        uint256 commitCount;
        uint256 revealCount;
        address creator;
    }

    // ============ 状态变量 ============

    /// @notice orderId → 订单信息
    mapping(bytes32 => OrderInfo) public orders;

    /// @notice orderId → feeder → 提交记录
    mapping(bytes32 => mapping(address => PriceCommit)) public commits;

    /// @notice orderId → 揭示地址列表
    mapping(bytes32 => address[]) public revealedFeeders;

    /// @notice 授权操作者（FeedEngine 主合约）
    mapping(address => bool) public authorizedOperators;

    /// @notice Commit 阶段时长（秒）
    uint256 public commitWindow;

    /// @notice Reveal 阶段时长（秒）
    uint256 public revealWindow;

    /// @notice 最大偏差阈值（basis points，如 500 = 5%）
    uint256 public maxDeviationBps;

    // ============ 事件 ============

    event OrderCreated(bytes32 indexed orderId, string symbol, uint256 notionalAmount, uint256 quorum);
    event PriceCommitted(bytes32 indexed orderId, address indexed feeder, bytes32 priceHash);
    event PriceRevealed(bytes32 indexed orderId, address indexed feeder, uint256 price);
    event ConsensusReached(bytes32 indexed orderId, uint256 consensusPrice, uint256 participantCount);
    event OrderDisputed(bytes32 indexed orderId, string reason);
    event OperatorUpdated(address indexed operator, bool authorized);

    // ============ Modifiers ============

    modifier onlyOperator() {
        require(authorizedOperators[msg.sender] || msg.sender == owner(), "FeedConsensus: not operator");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 初始化
     * @param owner_ 合约所有者
     * @param commitWindow_ Commit 阶段时长（秒）
     * @param revealWindow_ Reveal 阶段时长（秒）
     */
    function initialize(
        address owner_,
        uint256 commitWindow_,
        uint256 revealWindow_
    ) public initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        commitWindow = commitWindow_;
        revealWindow = revealWindow_;
        maxDeviationBps = 500; // 默认 5%
    }

    // ============ 管理函数 ============

    /**
     * @notice 设置授权操作者
     */
    function setOperator(address operator, bool authorized) external onlyOwner {
        authorizedOperators[operator] = authorized;
        emit OperatorUpdated(operator, authorized);
    }

    /**
     * @notice 更新时间窗口
     */
    function updateWindows(uint256 commitWindow_, uint256 revealWindow_) external onlyOwner {
        require(commitWindow_ >= 60 && revealWindow_ >= 60, "Window too short");
        commitWindow = commitWindow_;
        revealWindow = revealWindow_;
    }

    /**
     * @notice 更新最大偏差阈值
     */
    function updateMaxDeviation(uint256 bps) external onlyOwner {
        require(bps >= 10 && bps <= 5000, "Invalid deviation");
        maxDeviationBps = bps;
    }

    // ============ 核心函数 ============

    /**
     * @notice 创建喂价订单
     * @param orderId 订单唯一标识
     * @param symbol 标的代码
     * @param notionalAmount 名义本金
     * @param quorum 法定人数
     */
    function createOrder(
        bytes32 orderId,
        string calldata symbol,
        uint256 notionalAmount,
        uint256 quorum
    ) external onlyOperator {
        require(orders[orderId].phase == OrderPhase.NONE, "Order exists");
        require(quorum >= 3, "Quorum too low");

        orders[orderId] = OrderInfo({
            orderId: orderId,
            symbol: symbol,
            notionalAmount: notionalAmount,
            phase: OrderPhase.COMMIT,
            commitDeadline: block.timestamp + commitWindow,
            revealDeadline: block.timestamp + commitWindow + revealWindow,
            consensusPrice: 0,
            requiredQuorum: quorum,
            commitCount: 0,
            revealCount: 0,
            creator: msg.sender
        });

        emit OrderCreated(orderId, symbol, notionalAmount, quorum);
    }

    /**
     * @notice 提交价格哈希（Commit 阶段）
     * @param orderId 订单 ID
     * @param priceHash keccak256(abi.encodePacked(price, salt))
     */
    function submitPriceHash(bytes32 orderId, bytes32 priceHash) external {
        OrderInfo storage order = orders[orderId];
        require(order.phase == OrderPhase.COMMIT, "Not in commit phase");
        require(block.timestamp <= order.commitDeadline, "Commit deadline passed");
        require(!commits[orderId][msg.sender].committed, "Already committed");

        commits[orderId][msg.sender] = PriceCommit({
            priceHash: priceHash,
            revealedPrice: 0,
            committed: true,
            revealed: false,
            commitTime: block.timestamp
        });

        order.commitCount++;

        // 达到法定人数后自动切换到 Reveal 阶段
        if (order.commitCount >= order.requiredQuorum) {
            order.phase = OrderPhase.REVEAL;
        }

        emit PriceCommitted(orderId, msg.sender, priceHash);
    }

    /**
     * @notice 批量提交价格哈希
     * @param orderIds 订单 ID 数组
     * @param priceHashes 对应的价格哈希数组
     */
    function batchSubmitPriceHash(
        bytes32[] calldata orderIds,
        bytes32[] calldata priceHashes
    ) external {
        require(orderIds.length == priceHashes.length, "Length mismatch");
        require(orderIds.length <= 20, "Batch too large");

        for (uint256 i = 0; i < orderIds.length; i++) {
            OrderInfo storage order = orders[orderIds[i]];
            if (
                order.phase == OrderPhase.COMMIT &&
                block.timestamp <= order.commitDeadline &&
                !commits[orderIds[i]][msg.sender].committed
            ) {
                commits[orderIds[i]][msg.sender] = PriceCommit({
                    priceHash: priceHashes[i],
                    revealedPrice: 0,
                    committed: true,
                    revealed: false,
                    commitTime: block.timestamp
                });
                order.commitCount++;

                if (order.commitCount >= order.requiredQuorum) {
                    order.phase = OrderPhase.REVEAL;
                }

                emit PriceCommitted(orderIds[i], msg.sender, priceHashes[i]);
            }
        }
    }

    /**
     * @notice 揭示价格（Reveal 阶段）
     * @param orderId 订单 ID
     * @param price 实际价格 (8 decimals)
     * @param salt 随机盐值
     */
    function revealPrice(
        bytes32 orderId,
        uint256 price,
        bytes32 salt
    ) external {
        OrderInfo storage order = orders[orderId];
        require(
            order.phase == OrderPhase.REVEAL ||
            (order.phase == OrderPhase.COMMIT && order.commitCount >= order.requiredQuorum),
            "Not in reveal phase"
        );
        require(block.timestamp <= order.revealDeadline, "Reveal deadline passed");

        PriceCommit storage commit = commits[orderId][msg.sender];
        require(commit.committed, "Not committed");
        require(!commit.revealed, "Already revealed");

        // 核心验证：哈希匹配
        bytes32 computedHash = keccak256(abi.encodePacked(price, salt));
        require(computedHash == commit.priceHash, "Hash mismatch");

        commit.revealedPrice = price;
        commit.revealed = true;
        order.revealCount++;
        revealedFeeders[orderId].push(msg.sender);

        // 确保进入 REVEAL 阶段
        if (order.phase == OrderPhase.COMMIT) {
            order.phase = OrderPhase.REVEAL;
        }

        emit PriceRevealed(orderId, msg.sender, price);
    }

    /**
     * @notice 提交共识价格（由 operator 在链下计算后提交）
     * @param orderId 订单 ID
     * @param consensusPrice 共识价格 (8 decimals)
     */
    function submitConsensus(
        bytes32 orderId,
        uint256 consensusPrice
    ) external onlyOperator {
        OrderInfo storage order = orders[orderId];
        require(order.phase == OrderPhase.REVEAL, "Not in reveal phase");
        require(order.revealCount >= order.requiredQuorum, "Quorum not met");

        order.consensusPrice = consensusPrice;
        order.phase = OrderPhase.CONSENSUS;

        emit ConsensusReached(orderId, consensusPrice, order.revealCount);
    }

    /**
     * @notice 结算订单
     * @param orderId 订单 ID
     */
    function settleOrder(bytes32 orderId) external onlyOperator {
        OrderInfo storage order = orders[orderId];
        require(order.phase == OrderPhase.CONSENSUS, "Not in consensus phase");

        order.phase = OrderPhase.SETTLED;
    }

    /**
     * @notice 标记订单争议
     * @param orderId 订单 ID
     * @param reason 争议原因
     */
    function disputeOrder(bytes32 orderId, string calldata reason) external onlyOperator {
        OrderInfo storage order = orders[orderId];
        require(
            order.phase == OrderPhase.REVEAL || order.phase == OrderPhase.CONSENSUS,
            "Cannot dispute in this phase"
        );

        order.phase = OrderPhase.DISPUTED;
        emit OrderDisputed(orderId, reason);
    }

    // ============ 查询函数 ============

    /**
     * @notice 获取订单状态
     */
    function getOrderPhase(bytes32 orderId) external view returns (OrderPhase) {
        return orders[orderId].phase;
    }

    /**
     * @notice 获取共识价格
     */
    function getConsensusPrice(bytes32 orderId) external view returns (uint256) {
        return orders[orderId].consensusPrice;
    }

    /**
     * @notice 获取订单的揭示喂价员列表
     */
    function getRevealedFeeders(bytes32 orderId) external view returns (address[] memory) {
        return revealedFeeders[orderId];
    }

    /**
     * @notice 获取喂价员对某订单的提交记录
     */
    function getCommit(bytes32 orderId, address feeder)
        external
        view
        returns (bytes32 priceHash, uint256 revealedPrice, bool committed, bool revealed)
    {
        PriceCommit storage c = commits[orderId][feeder];
        return (c.priceHash, c.revealedPrice, c.committed, c.revealed);
    }

    /**
     * @notice 计算价格哈希（辅助函数，前端可用）
     * @param price 价格 (8 decimals)
     * @param salt 随机盐值
     */
    function computePriceHash(uint256 price, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(price, salt));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
