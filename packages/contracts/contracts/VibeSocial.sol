// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVibePoints {
    function mint(address user, uint256 amount, string calldata reason, uint256 cooldown, uint256 dailyLimit) external;
    function burn(address user, uint256 amount, string calldata reason) external;
    function balanceOf(address user) external view returns (uint256);
}

interface IVibeIdentity {
    function identities(address user) external view returns (
        string memory did,
        uint256 sbtTokenId,
        string memory currentProfileHash,
        uint256 createdAt,
        bool exists
    );
}

/**
 * @title VibeSocial - 社交互动 + 积分激励
 * @notice 管理关注、互动、UGC 卡牌、活动等社交行为，并自动发放积分
 */
contract VibeSocial {
    IVibePoints public pointsContract;
    IVibeIdentity public identityContract;

    // ============ 积分配置 ============

    uint256 public constant POINTS_CREATE_PROFILE = 50 * 10**18;      // 创建名片
    uint256 public constant POINTS_DAILY_SIGNIN = 5 * 10**18;         // 每日签到
    uint256 public constant POINTS_INTERACTION = 10 * 10**18;         // 破冰互动
    uint256 public constant POINTS_ACTIVITY_HOST = 30 * 10**18;       // 发起活动
    uint256 public constant POINTS_ACTIVITY_JOIN = 15 * 10**18;       // 参与活动
    uint256 public constant POINTS_ACTIVITY_REWARD = 20 * 10**18;     // 好评奖励
    uint256 public constant POINTS_UGC_CARD = 20 * 10**18;            // 创作卡牌
    uint256 public constant POINTS_CARD_USED = 1 * 10**18;            // 卡牌被使用
    uint256 public constant POINTS_INVITE = 100 * 10**18;             // 邀请新用户
    uint256 public constant POINTS_FOLLOW = 2 * 10**18;               // 关注用户

    // 消费价格
    uint256 public constant COST_PREMIUM_TEMPLATE = 100 * 10**18;     // 高级模板
    uint256 public constant COST_PIN_ACTIVITY = 50 * 10**18;          // 置顶活动
    uint256 public constant COST_RARE_CARD_PACK = 30 * 10**18;        // 稀有卡包
    uint256 public constant COST_PRIVATE_ACTIVITY = 20 * 10**18;      // 私密活动

    // ============ 状态变量 ============

    address public admin;
    mapping(address => bool) public hasCreatedProfile;
    mapping(address => uint256) public lastSigninTime;

    // 关注关系
    mapping(address => uint256) public followingCount;
    mapping(address => uint256) public followersCount;
    mapping(address => mapping(address => bool)) public isFollowing;

    // 互动计数
    mapping(address => uint256) public interactionCount;
    mapping(address => uint256) public activityCount;

    // 信誉分（自动计算）
    mapping(address => uint256) public reputationScore;

    // UGC 卡牌
    struct CardNFT {
        uint256 id;
        string question;
        string category;
        address creator;
        uint256 price; // 以积分计价
        uint256 usageCount;
        uint256 totalEarnings;
        bool isActive;
    }
    mapping(uint256 => CardNFT) public cards;
    uint256 private _cardIdCounter;

    // 活动
    struct Activity {
        uint256 id;
        address organizer;
        string title;
        string category;
        uint256 maxParticipants;
        address[] participants;
        bool completed;
        uint256 totalRating;
        uint256 ratingCount;
        bool isPinned;
        uint256 pinnedUntil;
    }
    mapping(uint256 => Activity) public activities;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    mapping(uint256 => mapping(address => bool)) public hasRated;
    uint256 private _activityIdCounter;

    // 邀请关系
    mapping(address => address) public inviter; // 被邀请人 => 邀请人
    mapping(address => uint256) public inviteCount;

    // ============ 事件 ============

    event ProfileCreated(address indexed user, uint256 pointsEarned);
    event DailySignin(address indexed user, uint256 pointsEarned);
    event InteractionRecorded(address indexed user, uint256 pointsEarned);
    event Followed(address indexed follower, address indexed followee, uint256 pointsEarned);
    event Unfollowed(address indexed follower, address indexed followee);
    event CardCreated(uint256 indexed cardId, address indexed creator, uint256 price);
    event CardUsed(uint256 indexed cardId, address indexed user, address indexed creator, uint256 creatorEarnings);
    event ActivityCreated(uint256 indexed activityId, address indexed organizer);
    event ActivityJoined(uint256 indexed activityId, address indexed participant);
    event ActivityRated(uint256 indexed activityId, address indexed rater, uint8 rating);
    event ActivitySettled(uint256 indexed activityId, uint256 avgRating);
    event ActivityPinned(uint256 indexed activityId, uint256 until);
    event ReputationUpdated(address indexed user, uint256 score);
    event UserInvited(address indexed inviter, address indexed invitee);

    // ============ 修饰符 ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier profileExists() {
        require(hasCreatedProfile[msg.sender], "Profile not created");
        _;
    }

    // ============ 构造函数 ============

    constructor(address _pointsContract, address _identityContract) {
        pointsContract = IVibePoints(_pointsContract);
        identityContract = IVibeIdentity(_identityContract);
        admin = msg.sender;
    }

    // ============ 用户行为 ============

    /**
     * @notice 创建名片（一次性奖励）
     */
    function createProfile(address referrer) external {
        require(!hasCreatedProfile[msg.sender], "Profile exists");

        hasCreatedProfile[msg.sender] = true;

        // 发放积分（无冷却，无每日限制）
        pointsContract.mint(msg.sender, POINTS_CREATE_PROFILE, "create_profile", 0, 0);

        // 处理邀请关系
        if (referrer != address(0) && referrer != msg.sender && hasCreatedProfile[referrer]) {
            inviter[msg.sender] = referrer;
            inviteCount[referrer]++;
            pointsContract.mint(referrer, POINTS_INVITE, "invite", 0, 0);
            emit UserInvited(referrer, msg.sender);
        }

        emit ProfileCreated(msg.sender, POINTS_CREATE_PROFILE);
    }

    /**
     * @notice 每日签到
     */
    function dailySignin() external profileExists {
        // 冷却 24 小时，每日 1 次
        pointsContract.mint(msg.sender, POINTS_DAILY_SIGNIN, "daily_signin", 24 hours, 1);

        lastSigninTime[msg.sender] = block.timestamp;
        emit DailySignin(msg.sender, POINTS_DAILY_SIGNIN);
    }

    /**
     * @notice 记录破冰互动
     */
    function recordInteraction() external profileExists {
        // 每次互动间隔 10 分钟，每日最多 5 次
        pointsContract.mint(msg.sender, POINTS_INTERACTION, "interaction", 10 minutes, 5);

        interactionCount[msg.sender]++;
        _updateReputation(msg.sender);

        emit InteractionRecorded(msg.sender, POINTS_INTERACTION);
    }

    /**
     * @notice 关注用户
     */
    function follow(address user) external profileExists {
        require(user != msg.sender, "Cannot follow self");
        require(!isFollowing[msg.sender][user], "Already following");
        require(hasCreatedProfile[user], "Target profile not found");

        isFollowing[msg.sender][user] = true;
        followingCount[msg.sender]++;
        followersCount[user]++;

        // 发放少量积分（防止刷关注，每日限制 20 次）
        pointsContract.mint(msg.sender, POINTS_FOLLOW, "follow", 0, 20);

        _updateReputation(msg.sender);
        _updateReputation(user);

        emit Followed(msg.sender, user, POINTS_FOLLOW);
    }

    /**
     * @notice 取消关注
     */
    function unfollow(address user) external profileExists {
        require(isFollowing[msg.sender][user], "Not following");

        isFollowing[msg.sender][user] = false;
        followingCount[msg.sender]--;
        followersCount[user]--;

        _updateReputation(msg.sender);
        _updateReputation(user);

        emit Unfollowed(msg.sender, user);
    }

    /**
     * @notice 批量关注（减少签名次数）
     */
    function followBatch(address[] calldata users) external profileExists {
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] != msg.sender && !isFollowing[msg.sender][users[i]] && hasCreatedProfile[users[i]]) {
                isFollowing[msg.sender][users[i]] = true;
                followingCount[msg.sender]++;
                followersCount[users[i]]++;
                emit Followed(msg.sender, users[i], 0);
            }
        }
        _updateReputation(msg.sender);
    }

    // ============ UGC 卡牌 ============

    /**
     * @notice 创作破冰卡
     */
    function createCard(
        string calldata question,
        string calldata category,
        uint256 price
    ) external profileExists returns (uint256) {
        require(price >= 10 * 10**18, "Minimum 10 points");
        require(bytes(question).length >= 10, "Question too short");
        require(bytes(question).length <= 500, "Question too long");

        uint256 cardId = _cardIdCounter++;
        cards[cardId] = CardNFT({
            id: cardId,
            question: question,
            category: category,
            creator: msg.sender,
            price: price,
            usageCount: 0,
            totalEarnings: 0,
            isActive: true
        });

        // 创作奖励（无冷却，鼓励创作）
        pointsContract.mint(msg.sender, POINTS_UGC_CARD, "ugc_card", 0, 0);

        emit CardCreated(cardId, msg.sender, price);
        return cardId;
    }

    /**
     * @notice 使用卡牌（创作者获得 80%，20% 销毁）
     */
    function useCard(uint256 cardId) external profileExists {
        CardNFT storage card = cards[cardId];
        require(card.creator != address(0), "Card not found");
        require(card.isActive, "Card inactive");

        // 扣除使用者积分
        pointsContract.burn(msg.sender, card.price, "use_card");

        // 创作者获得 80%
        uint256 creatorShare = card.price * 80 / 100;
        pointsContract.mint(card.creator, creatorShare, "card_revenue", 0, 0);

        // 20% 销毁（通缩机制）

        card.usageCount++;
        card.totalEarnings += creatorShare;

        // 使用者获得少量互动积分
        pointsContract.mint(msg.sender, POINTS_CARD_USED, "card_interaction", 0, 0);

        emit CardUsed(cardId, msg.sender, card.creator, creatorShare);
    }

    /**
     * @notice 获取热门卡牌（按使用次数排序，链下实现）
     */
    function getCard(uint256 cardId) external view returns (CardNFT memory) {
        return cards[cardId];
    }

    /**
     * @notice 禁用卡牌（管理员功能）
     */
    function deactivateCard(uint256 cardId) external onlyAdmin {
        cards[cardId].isActive = false;
    }

    // ============ 活动系统 ============

    /**
     * @notice 发起活动
     */
    function createActivity(
        string calldata title,
        string calldata category,
        uint256 maxParticipants
    ) external profileExists returns (uint256) {
        require(bytes(title).length >= 5, "Title too short");
        require(maxParticipants > 0 && maxParticipants <= 100, "Invalid max participants");

        uint256 activityId = _activityIdCounter++;
        Activity storage activity = activities[activityId];
        activity.id = activityId;
        activity.organizer = msg.sender;
        activity.title = title;
        activity.category = category;
        activity.maxParticipants = maxParticipants;
        activity.completed = false;

        // 发放积分（无冷却，每周最多 10 次）
        pointsContract.mint(msg.sender, POINTS_ACTIVITY_HOST, "activity_host", 0, 10);

        activityCount[msg.sender]++;
        _updateReputation(msg.sender);

        emit ActivityCreated(activityId, msg.sender);
        return activityId;
    }

    /**
     * @notice 加入活动
     */
    function joinActivity(uint256 activityId) external profileExists {
        Activity storage activity = activities[activityId];
        require(!activity.completed, "Activity completed");
        require(activity.participants.length < activity.maxParticipants, "Activity full");
        require(!hasJoined[activityId][msg.sender], "Already joined");

        activity.participants.push(msg.sender);
        hasJoined[activityId][msg.sender] = true;

        // 发放积分（无冷却，每周最多 20 次）
        pointsContract.mint(msg.sender, POINTS_ACTIVITY_JOIN, "activity_join", 0, 20);

        activityCount[msg.sender]++;
        _updateReputation(msg.sender);

        emit ActivityJoined(activityId, msg.sender);
    }

    /**
     * @notice 活动评分
     */
    function rateActivity(uint256 activityId, uint8 rating) external profileExists {
        require(rating >= 1 && rating <= 5, "Rating 1-5");
        Activity storage activity = activities[activityId];
        require(!hasRated[activityId][msg.sender], "Already rated");

        // 检查是否参与过或是组织者
        bool isParticipant = hasJoined[activityId][msg.sender] || msg.sender == activity.organizer;
        require(isParticipant, "Not participant");

        activity.totalRating += rating;
        activity.ratingCount++;
        hasRated[activityId][msg.sender] = true;

        emit ActivityRated(activityId, msg.sender, rating);
    }

    /**
     * @notice 结算活动（发放好评奖励）
     */
    function settleActivity(uint256 activityId) external {
        Activity storage activity = activities[activityId];
        require(msg.sender == activity.organizer, "Only organizer");
        require(!activity.completed, "Already settled");
        require(activity.ratingCount > 0, "No ratings");

        activity.completed = true;

        uint256 avgRating = activity.totalRating / activity.ratingCount;

        // 4-5 星给组织者和参与者奖励
        if (avgRating >= 4) {
            pointsContract.mint(activity.organizer, POINTS_ACTIVITY_REWARD, "activity_reward", 0, 0);

            for (uint256 i = 0; i < activity.participants.length; i++) {
                pointsContract.mint(activity.participants[i], POINTS_ACTIVITY_REWARD, "activity_reward", 0, 0);
            }
        }

        emit ActivitySettled(activityId, avgRating);
    }

    /**
     * @notice 置顶活动（消费积分）
     */
    function pinActivity(uint256 activityId, uint256 duration) external profileExists {
        Activity storage activity = activities[activityId];
        require(msg.sender == activity.organizer, "Only organizer");
        require(!activity.completed, "Activity completed");
        require(duration >= 1 days && duration <= 7 days, "Duration 1-7 days");

        pointsContract.burn(msg.sender, COST_PIN_ACTIVITY, "pin_activity");

        activity.isPinned = true;
        activity.pinnedUntil = block.timestamp + duration;

        emit ActivityPinned(activityId, activity.pinnedUntil);
    }

    /**
     * @notice 获取活动详情
     */
    function getActivity(uint256 activityId) external view returns (
        Activity memory activity,
        uint256 participantsCount,
        bool isPinnedNow
    ) {
        activity = activities[activityId];
        participantsCount = activity.participants.length;
        isPinnedNow = activity.isPinned && block.timestamp < activity.pinnedUntil;
        return (activity, participantsCount, isPinnedNow);
    }

    // ============ 消费功能 ============

    /**
     * @notice 解锁高级模板
     */
    function unlockPremiumTemplate() external profileExists {
        pointsContract.burn(msg.sender, COST_PREMIUM_TEMPLATE, "unlock_template");
    }

    /**
     * @notice 购买稀有卡包
     */
    function buyRareCardPack() external profileExists {
        pointsContract.burn(msg.sender, COST_RARE_CARD_PACK, "buy_card_pack");
    }

    // ============ 信誉系统 ============

    /**
     * @notice 自动计算信誉分
     */
    function _updateReputation(address user) internal {
        uint256 score =
            followersCount[user] * 5 +       // 每个粉丝 5 分
            interactionCount[user] * 10 +    // 每次互动 10 分
            activityCount[user] * 15;        // 每次活动 15 分

        reputationScore[user] = score;
        emit ReputationUpdated(user, score);
    }

    /**
     * @notice 获取用户信誉等级
     */
    function getReputationTier(address user) external view returns (string memory) {
        uint256 score = reputationScore[user];
        if (score >= 1000) return "Diamond";
        if (score >= 500) return "Gold";
        if (score >= 200) return "Silver";
        return "Bronze";
    }

    /**
     * @notice 获取用户完整社交数据
     */
    function getSocialData(address user) external view returns (
        uint256 following,
        uint256 followers,
        uint256 interactions,
        uint256 activitiesCount,
        uint256 reputation,
        string memory tier,
        uint256 points
    ) {
        return (
            followingCount[user],
            followersCount[user],
            interactionCount[user],
            activityCount[user],
            reputationScore[user],
            this.getReputationTier(user),
            pointsContract.balanceOf(user)
        );
    }

    // ============ 管理功能 ============

    function updatePointsContract(address newContract) external onlyAdmin {
        pointsContract = IVibePoints(newContract);
    }

    function updateIdentityContract(address newContract) external onlyAdmin {
        identityContract = IVibeIdentity(newContract);
    }
}
