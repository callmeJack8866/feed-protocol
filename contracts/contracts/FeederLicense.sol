// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title FeederLicense
 * @dev BEP-721 NFT 执照 — UUPS 可升级
 *
 * 功能：
 * - 每个喂价员需持有一个 NFT 执照才能参与喂价
 * - 仅 authorized minters (FeedEngine 主合约) 可铸造
 * - tokenURI → IPFS 元数据
 * - 支持按 owner 查询全部 token
 */
contract FeederLicense is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    /// @notice 下一个 tokenId
    uint256 private _nextTokenId;

    /// @notice 授权铸造者映射
    mapping(address => bool) public authorizedMinters;

    /// @notice 执照类型枚举
    enum LicenseType { BASIC, ADVANCED, PREMIUM, LEGENDARY }

    /// @notice tokenId → 执照类型
    mapping(uint256 => LicenseType) public licenseTypes;

    /// @notice 铸造者变更事件
    event MinterUpdated(address indexed minter, bool authorized);
    /// @notice 执照铸造事件
    event LicenseMinted(address indexed to, uint256 indexed tokenId, LicenseType licenseType);
    /// @notice 执照销毁事件
    event LicenseBurned(uint256 indexed tokenId);

    /// @notice 仅授权铸造者
    modifier onlyMinter() {
        require(authorizedMinters[msg.sender] || msg.sender == owner(), "FeederLicense: not authorized minter");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 初始化
     * @param owner_ 合约所有者
     */
    function initialize(address owner_) public initializer {
        __ERC721_init("Feeder License", "FLNFT");
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();

        _nextTokenId = 1;
    }

    /**
     * @notice 设置/取消授权铸造者
     * @param minter 铸造者地址
     * @param authorized 是否授权
     */
    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterUpdated(minter, authorized);
    }

    /**
     * @notice 铸造执照 NFT
     * @param to 接收者地址
     * @param uri IPFS 元数据 URI
     * @param licenseType_ 执照类型
     * @return tokenId 新铸造的 tokenId
     */
    function mint(
        address to,
        string calldata uri,
        LicenseType licenseType_
    ) external onlyMinter returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        licenseTypes[tokenId] = licenseType_;

        emit LicenseMinted(to, tokenId, licenseType_);
        return tokenId;
    }

    /**
     * @notice 销毁执照（仅所有者或授权铸造者）
     * @param tokenId 要销毁的 tokenId
     */
    function burn(uint256 tokenId) external {
        require(
            msg.sender == ownerOf(tokenId) || authorizedMinters[msg.sender] || msg.sender == owner(),
            "FeederLicense: not authorized to burn"
        );
        _burn(tokenId);
        delete licenseTypes[tokenId];
        emit LicenseBurned(tokenId);
    }

    /**
     * @notice 获取用户持有的所有 tokenId
     * @param owner_ 用户地址
     * @return tokenIds tokenId 数组
     */
    function getTokensByOwner(address owner_) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner_);
        uint256[] memory tokenIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(owner_, i);
        }
        return tokenIds;
    }

    /**
     * @notice 查询下一个 tokenId
     */
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    // ============ Override 解决多重继承 ============

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable, ERC721URIStorageUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
