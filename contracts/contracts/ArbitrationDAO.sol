// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ArbitrationDAO
 * @notice DAO治理仲裁合约 — 方案 §11
 * @dev 支持案件创建、质押投票、申诉、奖励分发
 *
 * 核心机制:
 * - 案件提交者需缴纳押金 (caseDeposit)
 * - 仲裁员通过质押 FEED 代币投票
 * - 投票分为 SUPPORT / OPPOSE / ABSTAIN
 * - 多数票方获胜，少数票方质押被没收并分给多数票方
 * - 案件可申诉 (一次)，进入 DAO 全体投票
 */
contract ArbitrationDAO is Ownable, ReentrancyGuard {

    // ============================================
    // 状态变量
    // ============================================

    IERC20 public feedToken;

    uint256 public caseDeposit = 100 * 1e18;      // 案件押金 100 FEED
    uint256 public minVoteStake = 10 * 1e18;       // 最低投票质押 10 FEED
    uint256 public votingPeriod = 3 days;           // 投票时长
    uint256 public appealPeriod = 2 days;           // 申诉窗口
    uint256 public daoVotingPeriod = 5 days;        // DAO 全体投票时长
    uint256 public quorumPercent = 51;              // 法定票数百分比

    uint256 public caseCount;

    // ============================================
    // 数据结构
    // ============================================

    enum CaseStatus {
        OPEN,           // 投票进行中
        RESOLVED,       // 已裁决
        APPEALED,       // 已申诉，DAO 投票中
        FINAL,          // 最终裁决
        CANCELLED       // 已取消
    }

    enum VoteType {
        SUPPORT,        // 支持原告
        OPPOSE,         // 反对原告
        ABSTAIN         // 弃权
    }

    struct Case {
        address plaintiff;       // 原告
        address defendant;       // 被告
        string orderId;          // 关联订单 ID
        string evidence;         // 证据 IPFS 哈希
        uint256 deposit;         // 押金
        uint256 createdAt;       // 创建时间
        uint256 votingDeadline;  // 投票截止
        uint256 supportStake;    // 支持方总质押
        uint256 opposeStake;     // 反对方总质押
        uint256 abstainStake;    // 弃权总质押
        uint256 voterCount;      // 投票人数
        CaseStatus status;       // 案件状态
        bool appealed;           // 是否已申诉
        VoteType outcome;        // 裁决结果 (SUPPORT = 原告胜)
    }

    struct Vote {
        address voter;
        VoteType voteType;
        uint256 stake;
        uint256 votedAt;
        bool claimed;            // 是否已领取奖励
    }

    mapping(uint256 => Case) public cases;
    mapping(uint256 => mapping(address => Vote)) public votes;
    mapping(uint256 => address[]) public caseVoters;

    // ============================================
    // 事件
    // ============================================

    event CaseCreated(uint256 indexed caseId, address indexed plaintiff, address defendant, string orderId);
    event Voted(uint256 indexed caseId, address indexed voter, VoteType voteType, uint256 stake);
    event CaseResolved(uint256 indexed caseId, VoteType outcome, uint256 supportStake, uint256 opposeStake);
    event CaseAppealed(uint256 indexed caseId, address indexed appellant);
    event RewardClaimed(uint256 indexed caseId, address indexed voter, uint256 reward);
    event ConfigUpdated(string param, uint256 value);

    // ============================================
    // 构造函数
    // ============================================

    constructor(address _feedToken) Ownable(msg.sender) {
        feedToken = IERC20(_feedToken);
    }

    // ============================================
    // 案件管理
    // ============================================

    /**
     * @notice 创建仲裁案件
     * @param _defendant 被告地址
     * @param _orderId 关联订单 ID
     * @param _evidence 证据 IPFS 哈希
     */
    function createCase(
        address _defendant,
        string calldata _orderId,
        string calldata _evidence
    ) external nonReentrant returns (uint256) {
        require(_defendant != address(0), "Invalid defendant");
        require(_defendant != msg.sender, "Cannot sue yourself");
        require(bytes(_orderId).length > 0, "Order ID required");

        // 收押金
        require(feedToken.transferFrom(msg.sender, address(this), caseDeposit), "Deposit transfer failed");

        caseCount++;
        uint256 caseId = caseCount;

        cases[caseId] = Case({
            plaintiff: msg.sender,
            defendant: _defendant,
            orderId: _orderId,
            evidence: _evidence,
            deposit: caseDeposit,
            createdAt: block.timestamp,
            votingDeadline: block.timestamp + votingPeriod,
            supportStake: 0,
            opposeStake: 0,
            abstainStake: 0,
            voterCount: 0,
            status: CaseStatus.OPEN,
            appealed: false,
            outcome: VoteType.ABSTAIN
        });

        emit CaseCreated(caseId, msg.sender, _defendant, _orderId);
        return caseId;
    }

    // ============================================
    // 投票
    // ============================================

    /**
     * @notice 仲裁员投票
     * @param _caseId 案件 ID
     * @param _voteType 投票类型
     * @param _stake 质押量
     */
    function vote(
        uint256 _caseId,
        VoteType _voteType,
        uint256 _stake
    ) external nonReentrant {
        Case storage c = cases[_caseId];
        require(c.status == CaseStatus.OPEN || c.status == CaseStatus.APPEALED, "Case not votable");
        require(block.timestamp <= c.votingDeadline, "Voting period ended");
        require(_stake >= minVoteStake, "Stake below minimum");
        require(votes[_caseId][msg.sender].stake == 0, "Already voted");
        require(msg.sender != c.plaintiff && msg.sender != c.defendant, "Parties cannot vote");

        require(feedToken.transferFrom(msg.sender, address(this), _stake), "Stake transfer failed");

        votes[_caseId][msg.sender] = Vote({
            voter: msg.sender,
            voteType: _voteType,
            stake: _stake,
            votedAt: block.timestamp,
            claimed: false
        });

        caseVoters[_caseId].push(msg.sender);
        c.voterCount++;

        if (_voteType == VoteType.SUPPORT) {
            c.supportStake += _stake;
        } else if (_voteType == VoteType.OPPOSE) {
            c.opposeStake += _stake;
        } else {
            c.abstainStake += _stake;
        }

        emit Voted(_caseId, msg.sender, _voteType, _stake);
    }

    // ============================================
    // 裁决
    // ============================================

    /**
     * @notice 结算案件
     * @param _caseId 案件 ID
     */
    function resolveCase(uint256 _caseId) external {
        Case storage c = cases[_caseId];
        require(c.status == CaseStatus.OPEN || c.status == CaseStatus.APPEALED, "Case not resolvable");
        require(block.timestamp > c.votingDeadline, "Voting still active");

        // 判定结果: 多数票为准
        if (c.supportStake > c.opposeStake) {
            c.outcome = VoteType.SUPPORT;
        } else if (c.opposeStake > c.supportStake) {
            c.outcome = VoteType.OPPOSE;
        } else {
            c.outcome = VoteType.ABSTAIN; // 平票 → 有利于被告
        }

        if (c.status == CaseStatus.APPEALED) {
            c.status = CaseStatus.FINAL;
        } else {
            c.status = CaseStatus.RESOLVED;
        }

        // 退还押金给胜诉方
        address winner = c.outcome == VoteType.SUPPORT ? c.plaintiff : c.defendant;
        if (winner != address(0) && c.deposit > 0) {
            feedToken.transfer(winner, c.deposit);
        }

        emit CaseResolved(_caseId, c.outcome, c.supportStake, c.opposeStake);
    }

    // ============================================
    // 申诉
    // ============================================

    /**
     * @notice 对已裁决案件提起申诉 (一次)
     * @param _caseId 案件 ID
     */
    function appeal(uint256 _caseId) external nonReentrant {
        Case storage c = cases[_caseId];
        require(c.status == CaseStatus.RESOLVED, "Can only appeal resolved cases");
        require(!c.appealed, "Already appealed once");
        require(
            msg.sender == c.plaintiff || msg.sender == c.defendant,
            "Only parties can appeal"
        );
        require(
            block.timestamp <= c.votingDeadline + appealPeriod,
            "Appeal window expired"
        );

        // 申诉需再次缴押金
        require(feedToken.transferFrom(msg.sender, address(this), caseDeposit), "Appeal deposit failed");

        c.appealed = true;
        c.status = CaseStatus.APPEALED;
        c.deposit += caseDeposit;
        c.votingDeadline = block.timestamp + daoVotingPeriod;

        // 重置投票统计（保留原投票记录，但允许更多人投票）
        // 注: 原投票者不能重复投票

        emit CaseAppealed(_caseId, msg.sender);
    }

    // ============================================
    // 奖励领取
    // ============================================

    /**
     * @notice 胜诉方投票者领取奖励
     * @param _caseId 案件 ID
     */
    function claimReward(uint256 _caseId) external nonReentrant {
        Case storage c = cases[_caseId];
        require(c.status == CaseStatus.RESOLVED || c.status == CaseStatus.FINAL, "Case not resolved");

        Vote storage v = votes[_caseId][msg.sender];
        require(v.stake > 0, "No vote found");
        require(!v.claimed, "Already claimed");

        // 仅多数票方可领取奖励
        bool isWinner = (v.voteType == c.outcome);
        require(isWinner, "Only winning side can claim");

        v.claimed = true;

        // 计算奖励: 退还质押 + 按占比分配少数方的质押
        uint256 loserPool = c.outcome == VoteType.SUPPORT ? c.opposeStake : c.supportStake;
        uint256 winnerPool = c.outcome == VoteType.SUPPORT ? c.supportStake : c.opposeStake;

        uint256 reward = v.stake; // 退还本金
        if (winnerPool > 0 && loserPool > 0) {
            reward += (loserPool * v.stake) / winnerPool; // 按占比分配
        }

        require(feedToken.transfer(msg.sender, reward), "Reward transfer failed");

        emit RewardClaimed(_caseId, msg.sender, reward);
    }

    // ============================================
    // 管理员函数
    // ============================================

    /**
     * @notice 更新案件押金
     */
    function setCaseDeposit(uint256 _amount) external onlyOwner {
        caseDeposit = _amount;
        emit ConfigUpdated("caseDeposit", _amount);
    }

    /**
     * @notice 更新最低投票质押
     */
    function setMinVoteStake(uint256 _amount) external onlyOwner {
        minVoteStake = _amount;
        emit ConfigUpdated("minVoteStake", _amount);
    }

    /**
     * @notice 更新投票时长
     */
    function setVotingPeriod(uint256 _period) external onlyOwner {
        votingPeriod = _period;
        emit ConfigUpdated("votingPeriod", _period);
    }

    /**
     * @notice 紧急取消案件 (仅管理员)
     */
    function cancelCase(uint256 _caseId) external onlyOwner {
        Case storage c = cases[_caseId];
        require(c.status == CaseStatus.OPEN, "Can only cancel open cases");

        c.status = CaseStatus.CANCELLED;

        // 退还押金
        feedToken.transfer(c.plaintiff, c.deposit);

        // 退还所有投票者质押
        for (uint256 i = 0; i < caseVoters[_caseId].length; i++) {
            address voter = caseVoters[_caseId][i];
            Vote storage v = votes[_caseId][voter];
            if (v.stake > 0 && !v.claimed) {
                v.claimed = true;
                feedToken.transfer(voter, v.stake);
            }
        }
    }

    // ============================================
    // 查询函数
    // ============================================

    /**
     * @notice 获取案件投票人列表
     */
    function getCaseVoters(uint256 _caseId) external view returns (address[] memory) {
        return caseVoters[_caseId];
    }

    /**
     * @notice 获取案件投票统计
     */
    function getCaseStats(uint256 _caseId) external view returns (
        uint256 supportStake,
        uint256 opposeStake,
        uint256 abstainStake,
        uint256 voterCount,
        CaseStatus status,
        VoteType outcome
    ) {
        Case storage c = cases[_caseId];
        return (c.supportStake, c.opposeStake, c.abstainStake, c.voterCount, c.status, c.outcome);
    }
}
