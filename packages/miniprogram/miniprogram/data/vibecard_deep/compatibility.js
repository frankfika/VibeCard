/**
 * 情侣深聊 - 默契测试卡
 * 升级版：不只是猜答案，更是关系诊断工具
 * 包含：爱的语言测试、依恋风格测试、价值观匹配
 */
module.exports = {
  mode: "couple_deep",
  mode_name: "情侣深聊",
  type: "compatibility",
  description: "默契测试：双方各自作答，然后对比答案，看看你们有多了解彼此",
  cards: [
    // ========== 爱的语言测试 ==========
    { id: "cd_m_001", level: 1, category: "爱的语言", content: "对方最主要的爱的语言是？（肯定/礼物/服务/陪伴/触碰）", tips: "你知道TA怎么感受爱吗？", theory: "5 Love Languages", tool: true },
    { id: "cd_m_002", level: 1, category: "爱的语言", content: "对方生气时最需要的是？（独处/拥抱/倾诉/解决问题）", tips: "正确的回应方式", tool: true },
    { id: "cd_m_003", level: 2, category: "爱的语言", content: "对方压力大时希望你怎么做？", tips: "陪着TA vs 给建议 vs 帮TA做事", tool: true },

    // ========== 日常默契 ==========
    { id: "cd_m_004", level: 1, category: "日常默契", content: "对方现在最想去的旅行目的地是？", tips: "各自写答案" },
    { id: "cd_m_005", level: 1, category: "日常默契", content: "对方最近最想买的东西是？", tips: "你在关注TA的需求吗" },
    { id: "cd_m_006", level: 1, category: "日常默契", content: "对方最不能忍受的食物是？", tips: "生活小细节" },
    { id: "cd_m_007", level: 1, category: "日常默契", content: "对方最喜欢的一首歌是？", tips: "音乐品味了解" },
    { id: "cd_m_008", level: 2, category: "日常默契", content: "对方目前工作中最困扰的事是？", tips: "你有在认真听吗" },

    // ========== 深层了解 ==========
    { id: "cd_m_009", level: 2, category: "深层了解", content: "对方小时候最害怕的事情是？", tips: "童年记忆", tool: true },
    { id: "cd_m_010", level: 2, category: "深层了解", content: "对方最感激的一个家人是谁？为什么？", tips: "原生家庭关系" },
    { id: "cd_m_011", level: 2, category: "深层了解", content: "对方人生中最骄傲的成就是？", tips: "核心身份认同" },
    { id: "cd_m_012", level: 2, category: "深层了解", content: "对方最大的不安全感是什么？", tips: "脆弱的部分", tool: true },
    { id: "cd_m_013", level: 3, category: "深层了解", content: "对方觉得自己最大的缺点是？", tips: "自我认知" },

    // ========== 关系认知 ==========
    { id: "cd_m_014", level: 2, category: "关系认知", content: "你们之间最大的分歧是什么？", tips: "各自写，看是否一致", tool: true },
    { id: "cd_m_015", level: 2, category: "关系认知", content: "对方最欣赏你的一点是？", tips: "你知道自己在TA眼中的样子吗" },
    { id: "cd_m_016", level: 2, category: "关系认知", content: "对方最希望你改变的一个习惯是？", tips: "诚实作答", tool: true },
    { id: "cd_m_017", level: 3, category: "关系认知", content: "对方觉得你们关系中最需要改善的是？", tips: "关系诊断", tool: true },
    { id: "cd_m_018", level: 3, category: "关系认知", content: "你觉得对方最需要从这段关系中获得什么？", tips: "核心需求", tool: true },

    // ========== 价值观匹配 ==========
    { id: "cd_m_019", level: 2, category: "价值观", content: "对方对'多少钱算大额消费需要商量'的标准是？", tips: "金钱观", tool: true },
    { id: "cd_m_020", level: 2, category: "价值观", content: "对方对要不要孩子的真实想法是？", tips: "核心问题", tool: true },
    { id: "cd_m_021", level: 2, category: "价值观", content: "对方期望的婚后居住安排是？（和父母住/独立住/离父母多远）", tips: "生活规划", tool: true },
    { id: "cd_m_022", level: 3, category: "价值观", content: "对方觉得事业和家庭哪个更重要？比例是多少？", tips: "人生优先级", tool: true },

    // ========== 亲密默契 ==========
    { id: "cd_m_023", level: 2, category: "亲密默契", content: "对方最喜欢的亲密方式是？", tips: "身体亲密偏好" },
    { id: "cd_m_024", level: 2, category: "亲密默契", content: "对方觉得自己最性感的部位是？", tips: "身体自信" },
    { id: "cd_m_025", level: 3, category: "亲密默契", content: "对方有没有什么亲密方面想尝试但没说的？", tips: "安全空间里猜测" },

    // ========== 未来想象 ==========
    { id: "cd_m_026", level: 2, category: "未来想象", content: "对方心中理想的退休生活是什么样？", tips: "长远规划匹配" },
    { id: "cd_m_027", level: 3, category: "未来想象", content: "对方最害怕这段关系因为什么原因结束？", tips: "关系焦虑点", tool: true },
    { id: "cd_m_028", level: 3, category: "未来想象", content: "对方愿意为这段关系做出的最大牺牲是什么？", tips: "承诺程度" },

    // ========== 趣味猜猜猜 ==========
    { id: "cd_m_029", level: 1, category: "趣味猜", content: "如果对方中了500万，第一件会做的事是？", tips: "轻松一点" },
    { id: "cd_m_030", level: 1, category: "趣味猜", content: "对方最想拥有的超能力是？", tips: "童心测试" },
    { id: "cd_m_031", level: 1, category: "趣味猜", content: "如果对方能穿越到任何时代，会选哪个？", tips: "有趣的了解" },
    { id: "cd_m_032", level: 2, category: "趣味猜", content: "对方最想和哪个名人吃一顿饭？", tips: "偶像和价值观" }
  ]
};
