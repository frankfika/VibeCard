/**
 * 情侣深聊 - 真心话大冒险
 * 升级版：分层次、有深度、好玩又有意义
 * 融入心理学元素，不只是刺激，更是了解
 */
module.exports = {
  mode: "couple_deep",
  mode_name: "情侣深聊",
  type: "truth_or_dare",
  cards: [
    // ========== Level 1: 轻松暖场 ==========
    { id: "cd_td_001", level: 1, spicy: "safe", category: "真心话", content: "你第一次见我时的第一印象？后来改变了吗？", tips: "真实回答" },
    { id: "cd_td_002", level: 1, spicy: "safe", category: "真心话", content: "你偷偷保存了我的哪张照片？为什么是那张？", tips: "Show出来" },
    { id: "cd_td_003", level: 1, spicy: "safe", category: "真心话", content: "你有没有和朋友吐槽过我？吐槽什么？", tips: "诚实！" },
    { id: "cd_td_004", level: 1, spicy: "safe", category: "真心话", content: "我做什么事的时候你觉得又好笑又可爱？", tips: null },
    { id: "cd_td_005", level: 1, spicy: "safe", category: "大冒险", content: "用最嗲的声音说'我爱你'", tips: "认真的！" },
    { id: "cd_td_006", level: 1, spicy: "safe", category: "大冒险", content: "模仿我生气的样子", tips: "看看你眼中的我" },
    { id: "cd_td_007", level: 1, spicy: "safe", category: "大冒险", content: "现在发一条朋友圈夸我（可以仅对方可见）", tips: "要真情实感" },
    { id: "cd_td_008", level: 1, spicy: "safe", category: "大冒险", content: "给你最好的朋友发消息，夸我", tips: "截图为证" },

    // ========== Level 2: 深入了解 ==========
    { id: "cd_td_009", level: 2, spicy: "medium", category: "真心话", content: "你有没有后悔过和我在一起？什么时候？", tips: "诚实，但要有建设性" },
    { id: "cd_td_010", level: 2, spicy: "medium", category: "真心话", content: "我的什么行为最让你有安全感？什么行为让你没有？", tips: "关系诊断问题", tool: true },
    { id: "cd_td_011", level: 2, spicy: "medium", category: "真心话", content: "你有没有因为我对别人吃醋过？是谁？", tips: "承认嫉妒" },
    { id: "cd_td_012", level: 2, spicy: "medium", category: "真心话", content: "我们之间，你有没有说过善意的谎言？关于什么？", tips: "安全空间里坦白" },
    { id: "cd_td_013", level: 2, spicy: "medium", category: "真心话", content: "你觉得我的前任是什么样的人？（基于我讲的）", tips: "外部视角" },
    { id: "cd_td_014", level: 2, spicy: "medium", category: "大冒险", content: "打开你的手机相册，随机翻到一张照片讲故事", tips: "相册是生活档案" },
    { id: "cd_td_015", level: 2, spicy: "medium", category: "大冒险", content: "打开微信，给我看你们最近的聊天记录标题", tips: "信任测试" },
    { id: "cd_td_016", level: 2, spicy: "medium", category: "大冒险", content: "现在给我一个法式拥抱（从后面环抱+下巴靠肩）", tips: "亲密升温" },
    { id: "cd_td_017", level: 2, spicy: "medium", category: "大冒险", content: "在我身上找到3个你没注意过的细节", tips: "仔细观察" },

    // ========== Level 3: 深度亲密 ==========
    { id: "cd_td_018", level: 3, spicy: "hot", category: "真心话", content: "我们的亲密生活，你最满意的是什么？最希望改变的是什么？", tips: "坦诚沟通", tool: true },
    { id: "cd_td_019", level: 3, spicy: "hot", category: "真心话", content: "你有没有什么性幻想从没告诉过我？", tips: "安全空间里可以说" },
    { id: "cd_td_020", level: 3, spicy: "hot", category: "真心话", content: "你觉得自己最性感的时刻是什么时候？", tips: "自我认知" },
    { id: "cd_td_021", level: 3, spicy: "hot", category: "真心话", content: "有没有什么我做的事让你很心动但你没告诉我？", tips: "正向反馈" },
    { id: "cd_td_022", level: 3, spicy: "hot", category: "真心话", content: "如果可以重新来过，我们的第一次你会怎么改变？", tips: "不带批评的分享" },
    { id: "cd_td_023", level: 3, spicy: "hot", category: "大冒险", content: "用1分钟给对方一个'感官之旅'：从头到脚轻轻触碰", tips: "Sensate Focus练习", theory: "Sensate Focus" },
    { id: "cd_td_024", level: 3, spicy: "hot", category: "大冒险", content: "对视30秒，期间慢慢靠近到鼻尖碰鼻尖", tips: "tension building" },
    { id: "cd_td_025", level: 3, spicy: "hot", category: "大冒险", content: "在对方脖子/耳后轻轻吹气，说一句撩人的话", tips: "ASMR效果" },

    // ========== 特别版：关系深化 ==========
    { id: "cd_td_026", level: 2, spicy: "safe", category: "关系真心话", content: "你觉得我们关系中最大的优势是什么？最大的风险是什么？", tips: "理性分析感情", tool: true },
    { id: "cd_td_027", level: 2, spicy: "safe", category: "关系真心话", content: "如果让你给我们的关系取一个'状态'标签，你会选什么？", tips: "热恋/平淡/成长/危机..." },
    { id: "cd_td_028", level: 3, spicy: "safe", category: "关系真心话", content: "你最希望5年后的我们是什么样子？你愿意为此做什么？", tips: "承诺与行动" },
    { id: "cd_td_029", level: 3, spicy: "safe", category: "关系大冒险", content: "现在认真说一次：'我承诺...'（你愿意做出的改变）", tips: "真正的承诺", tool: true },
    { id: "cd_td_030", level: 3, spicy: "safe", category: "关系大冒险", content: "一起制定一个'关系改进计划'的第一步，现在就确定", tips: "从游戏到行动", tool: true },

    // ========== 趣味挑战 ==========
    { id: "cd_td_031", level: 1, spicy: "safe", category: "趣味挑战", content: "用emoji描述我们的关系，让对方猜", tips: "创意测试" },
    { id: "cd_td_032", level: 1, spicy: "safe", category: "趣味挑战", content: "用3个词形容我的bed hair，我来猜你说的是好是坏", tips: "轻松调侃" },
    { id: "cd_td_033", level: 2, spicy: "medium", category: "趣味挑战", content: "角色互换：模仿对方说'我爱你'的方式", tips: "看看对方眼中的你" },
    { id: "cd_td_034", level: 2, spicy: "medium", category: "趣味挑战", content: "假装是第一次约会，用一个新身份重新认识对方", tips: "即兴表演" },
    { id: "cd_td_035", level: 2, spicy: "medium", category: "趣味挑战", content: "用60秒解释你为什么爱TA，每10秒必须换一个理由", tips: "速度挑战" }
  ]
};
