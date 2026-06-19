// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VibePoints - 链上积分系统
 * @notice 不可转让的积分，仅用于应用内激励和消费
 * @dev 未来可升级为 ERC-20 代币（1 积分 = 1 $VIBE）
 */
contract VibePoints {
    // ============ 状态变量 ============

    string public constant name = "Vibe Points";
    string public constant symbol = "POINTS";
    uint8 public constant decimals = 18;

    // 积分余额（不可转让）
    mapping(address => uint256) public balanceOf;

    // 积分历史记录
    struct Transaction {
        address user;
        int256 amount; // 正数=获得，负数=消费
        string reason; // "daily_signin", "interaction", "activity_host", etc.
        uint256 timestamp;
    }
    Transaction[] public transactions;
    mapping(address => uint256[]) public userTransactions; // user => transaction IDs

    // 行为限制（防刷）
    mapping(address => mapping(string => uint256)) public lastActionTime;
    mapping(address => mapping(string => uint256)) public dailyActionCount;
    mapping(address => uint256) public lastResetDay;

    // 权限控制
    address public admin;
    mapping(address => bool) public operators; // 授权的合约可以发放/扣除积分

    // ============ 事件 ============

    event PointsEarned(address indexed user, uint256 amount, string reason);
    event PointsSpent(address indexed user, uint256 amount, string reason);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // ============ 修饰符 ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == admin, "Only operator");
        _;
    }

    // ============ 构造函数 ============

    constructor() {
        admin = msg.sender;
        operators[msg.sender] = true;
    }

    // ============ 核心功能 ============

    /**
     * @notice 发放积分（带防刷机制）
     * @param user 用户地址
     * @param amount 积分数量
     * @param reason 原因代码
     * @param cooldown 冷却时间（秒）
     * @param dailyLimit 每日限制次数（0=不限制）
     */
    function mint(
        address user,
        uint256 amount,
        string calldata reason,
        uint256 cooldown,
        uint256 dailyLimit
    ) external onlyOperator {
        require(user != address(0), "Invalid address");

        // 重置每日计数
        _resetDailyCountIfNeeded(user);

        // 检查冷却时间
        if (cooldown > 0) {
            require(
                block.timestamp >= lastActionTime[user][reason] + cooldown,
                "Cooldown not passed"
            );
            lastActionTime[user][reason] = block.timestamp;
        }

        // 检查每日限制
        if (dailyLimit > 0) {
            require(
                dailyActionCount[user][reason] < dailyLimit,
                "Daily limit reached"
            );
            dailyActionCount[user][reason]++;
        }

        // 发放积分
        balanceOf[user] += amount;

        // 记录历史
        uint256 txId = transactions.length;
        transactions.push(Transaction({
            user: user,
            amount: int256(amount),
            reason: reason,
            timestamp: block.timestamp
        }));
        userTransactions[user].push(txId);

        emit PointsEarned(user, amount, reason);
    }

    /**
     * @notice 扣除积分（用于消费）
     * @param user 用户地址
     * @param amount 积分数量
     * @param reason 原因代码
     */
    function burn(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyOperator {
        require(balanceOf[user] >= amount, "Insufficient balance");

        balanceOf[user] -= amount;

        // 记录历史
        uint256 txId = transactions.length;
        transactions.push(Transaction({
            user: user,
            amount: -int256(amount),
            reason: reason,
            timestamp: block.timestamp
        }));
        userTransactions[user].push(txId);

        emit PointsSpent(user, amount, reason);
    }

    /**
     * @notice 批量发放积分（减少 Gas）
     */
    function mintBatch(
        address[] calldata users,
        uint256[] calldata amounts,
        string calldata reason
    ) external onlyOperator {
        require(users.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            balanceOf[users[i]] += amounts[i];

            uint256 txId = transactions.length;
            transactions.push(Transaction({
                user: users[i],
                amount: int256(amounts[i]),
                reason: reason,
                timestamp: block.timestamp
            }));
            userTransactions[users[i]].push(txId);

            emit PointsEarned(users[i], amounts[i], reason);
        }
    }

    // ============ 查询功能 ============

    /**
     * @notice 获取用户积分历史
     */
    function getUserTransactions(address user) external view returns (Transaction[] memory) {
        uint256[] memory txIds = userTransactions[user];
        Transaction[] memory result = new Transaction[](txIds.length);

        for (uint256 i = 0; i < txIds.length; i++) {
            result[i] = transactions[txIds[i]];
        }

        return result;
    }

    /**
     * @notice 检查用户是否可以执行某个行为
     */
    function canPerformAction(
        address user,
        string calldata reason,
        uint256 cooldown,
        uint256 dailyLimit
    ) external view returns (bool, string memory) {
        // 检查冷却时间
        if (cooldown > 0 && block.timestamp < lastActionTime[user][reason] + cooldown) {
            uint256 remaining = lastActionTime[user][reason] + cooldown - block.timestamp;
            return (false, string(abi.encodePacked("Cooldown: ", _toString(remaining), "s")));
        }

        // 检查每日限制
        if (dailyLimit > 0) {
            uint256 today = block.timestamp / 1 days;
            uint256 lastReset = lastResetDay[user];
            uint256 count = (today == lastReset) ? dailyActionCount[user][reason] : 0;

            if (count >= dailyLimit) {
                return (false, "Daily limit reached");
            }
        }

        return (true, "");
    }

    /**
     * @notice 获取用户在某个行为上的剩余次数
     */
    function getRemainingActions(
        address user,
        string calldata reason,
        uint256 dailyLimit
    ) external view returns (uint256) {
        if (dailyLimit == 0) return type(uint256).max;

        uint256 today = block.timestamp / 1 days;
        uint256 lastReset = lastResetDay[user];
        uint256 count = (today == lastReset) ? dailyActionCount[user][reason] : 0;

        return count >= dailyLimit ? 0 : dailyLimit - count;
    }

    // ============ 管理功能 ============

    function addOperator(address operator) external onlyAdmin {
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyAdmin {
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }

    // ============ 内部函数 ============

    function _resetDailyCountIfNeeded(address user) internal {
        uint256 today = block.timestamp / 1 days;
        if (lastResetDay[user] != today) {
            lastResetDay[user] = today;
            // dailyActionCount 会在下次访问时自动被视为 0
        }
    }

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
}
