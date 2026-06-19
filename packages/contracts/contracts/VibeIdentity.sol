// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VibeIdentity - DID + SBT 一体化身份系统
 * @notice 结合去中心化身份(DID)和灵魂绑定代币(SBT)
 */
contract VibeIdentity {
    // ============ 状态变量 ============

    struct Identity {
        string did; // did:vibe:chainId:address
        uint256 sbtTokenId; // 自动递增的 SBT ID
        string currentProfileHash; // 当前名片 IPFS hash
        uint256 createdAt;
        bool exists;
    }

    mapping(address => Identity) public identities;
    mapping(uint256 => address) public tokenOwner; // SBT tokenId => owner
    mapping(uint256 => string[]) public profileHistory; // tokenId => IPFS hashes

    uint256 private _tokenIdCounter;
    address public admin;

    // ============ 事件 ============

    event IdentityCreated(address indexed user, string did, uint256 tokenId);
    event ProfileUpdated(address indexed user, string newHash);
    event DIDResolved(string did, address user, string profileHash);

    // ============ 修饰符 ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // ============ 构造函数 ============

    constructor() {
        admin = msg.sender;
    }

    // ============ 核心功能 ============

    /**
     * @notice 创建身份（DID + SBT）
     * @param profileHash 初始名片 IPFS hash
     * @return did 生成的 DID
     * @return tokenId 生成的 SBT token ID
     */
    function createIdentity(string calldata profileHash) external returns (string memory, uint256) {
        require(!identities[msg.sender].exists, "Identity exists");
        require(bytes(profileHash).length > 0, "Invalid profile hash");

        uint256 tokenId = _tokenIdCounter++;

        // 生成 DID: did:vibe:chainId:address
        string memory did = string(abi.encodePacked(
            "did:vibe:",
            _toString(block.chainid),
            ":",
            _toHexString(msg.sender)
        ));

        identities[msg.sender] = Identity({
            did: did,
            sbtTokenId: tokenId,
            currentProfileHash: profileHash,
            createdAt: block.timestamp,
            exists: true
        });

        tokenOwner[tokenId] = msg.sender;
        profileHistory[tokenId].push(profileHash);

        emit IdentityCreated(msg.sender, did, tokenId);
        return (did, tokenId);
    }

    /**
     * @notice 更新名片（自动记录历史版本）
     * @param newHash 新的 IPFS hash
     */
    function updateProfile(string calldata newHash) external {
        require(identities[msg.sender].exists, "Identity not found");
        require(bytes(newHash).length > 0, "Invalid profile hash");

        uint256 tokenId = identities[msg.sender].sbtTokenId;
        identities[msg.sender].currentProfileHash = newHash;
        profileHistory[tokenId].push(newHash);

        emit ProfileUpdated(msg.sender, newHash);
    }

    /**
     * @notice 解析 DID 获取地址和名片
     * @return user 用户地址
     * @return profileHash 当前名片 hash
     */
    function resolveDID(string calldata /* did */) external pure returns (address user, string memory profileHash) {
        // 简化解析：从 DID 中提取地址
        // 生产环境需要更严格的验证
        // 这里假设 DID 格式正确，直接通过 identities 反查

        // TODO: 实现完整的 DID 解析逻辑
        // 当前返回空值，需要链下索引支持
        return (address(0), "");
    }

    /**
     * @notice 获取用户身份信息
     */
    function getIdentity(address user) external view returns (Identity memory) {
        require(identities[user].exists, "Identity not found");
        return identities[user];
    }

    /**
     * @notice 获取名片历史版本
     */
    function getProfileHistory(address user) external view returns (string[] memory) {
        require(identities[user].exists, "Identity not found");
        uint256 tokenId = identities[user].sbtTokenId;
        return profileHistory[tokenId];
    }

    /**
     * @notice 获取 SBT 所有者
     */
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = tokenOwner[tokenId];
        require(owner != address(0), "Token does not exist");
        return owner;
    }

    /**
     * @notice 获取用户的 SBT token ID
     */
    function tokenOfOwner(address user) external view returns (uint256) {
        require(identities[user].exists, "Identity not found");
        return identities[user].sbtTokenId;
    }

    /**
     * @notice 检查地址是否已创建身份
     */
    function hasIdentity(address user) external view returns (bool) {
        return identities[user].exists;
    }

    // ============ SBT 特性：禁止转账 ============

    // 灵魂绑定代币不可转让，不实现 transfer 函数

    // ============ 内部辅助函数 ============

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = '0';
        buffer[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            uint8 value = uint8(uint160(addr) >> (8 * (19 - i)));
            buffer[2 + i * 2] = _hexChar(value >> 4);
            buffer[3 + i * 2] = _hexChar(value & 0x0f);
        }
        return string(buffer);
    }

    function _hexChar(uint8 value) internal pure returns (bytes1) {
        if (value < 10) return bytes1(uint8(48 + value));
        return bytes1(uint8(87 + value));
    }
}
