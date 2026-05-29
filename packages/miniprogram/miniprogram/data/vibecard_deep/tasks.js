/**
 * 情侣深聊 - 任务卡
 * 融入亲密感建立练习、感官体验、仪式感创造
 * 工具性：可复用的亲密仪式、沟通练习
 */
module.exports = {
  mode: "couple_deep",
  mode_name: "情侣深聊",
  type: "task",
  cards: [
    // ========== Gottman 转身回应练习 ==========
    { id: "cd_t_001", level: 1, category: "转身回应", content: "接下来10分钟，全身心关注对方：放下手机，眼神接触，积极回应", tips: "Gottman'转身回应'：成功夫妻86%会积极回应伴侣", theory: "Gottman Bids", tool: true },
    { id: "cd_t_002", level: 1, category: "转身回应", content: "对方说任何事，都用'哇，然后呢？'回应，持续5分钟", tips: "练习积极倾听", theory: "Active Listening", tool: true },
    { id: "cd_t_003", level: 2, category: "转身回应", content: "练习'镜像反馈'：重复对方说的话+你的理解，确认是否正确", tips: "我听到你说的是...，对吗？", theory: "Mirroring", tool: true },

    // ========== 感官亲密 Sensate Focus ==========
    { id: "cd_t_004", level: 1, category: "感官练习", content: "闭上眼睛，让对方用手指轻轻划过你的手臂，专注感受", tips: "感官聚焦练习：不带目的的触碰", theory: "Sensate Focus", tool: true },
    { id: "cd_t_005", level: 2, category: "感官练习", content: "互相给对方按摩手部5分钟，期间不说话", tips: "用触觉沟通", theory: "Sensate Focus" },
    { id: "cd_t_006", level: 2, category: "感官练习", content: "对视4分钟，不说话（36问经典练习）", tips: "Arthur Aron实验：4分钟对视能加深亲密感", theory: "36 Questions", tool: true },
    { id: "cd_t_007", level: 2, category: "感官练习", content: "拥抱到你能感受到对方心跳同步（约20秒）", tips: "同步呼吸增加连接感", theory: "Oxytocin" },

    // ========== 爱的语言实践 ==========
    { id: "cd_t_008", level: 1, category: "爱的语言", content: "用对方的爱的语言表达爱：如果TA是肯定语，说5句真诚的赞美", tips: "确认对方的主要爱的语言", theory: "5 Love Languages", tool: true },
    { id: "cd_t_009", level: 1, category: "爱的语言", content: "如果对方的爱的语言是服务：帮TA完成一件TA不想做的事", tips: "行动胜于言语", theory: "5 Love Languages", tool: true },
    { id: "cd_t_010", level: 2, category: "爱的语言", content: "给对方一个'爱的语言综合礼包'：一句赞美+一个礼物+陪伴时光", tips: "全方位输出", theory: "5 Love Languages", tool: true },

    // ========== 仪式感创造 Rituals ==========
    { id: "cd_t_011", level: 1, category: "仪式感", content: "一起制定一个'每日check-in'仪式：每天固定时间聊10分钟今天的心情", tips: "日常小仪式是感情的防腐剂", tool: true },
    { id: "cd_t_012", level: 2, category: "仪式感", content: "创造一个只属于你们的'暗号'：比如捏三下手=我爱你", tips: "私密语言增加连接", tool: true },
    { id: "cd_t_013", level: 2, category: "仪式感", content: "一起写一份'关系协议'：列出5条你们都认同的相处原则", tips: "明确规则减少冲突", tool: true },
    { id: "cd_t_014", level: 2, category: "仪式感", content: "设立'约会日'制度：每周固定一天的约会时间，现在安排下一次", tips: "刻意创造独处时光", tool: true },

    // ========== 感恩练习 ==========
    { id: "cd_t_015", level: 1, category: "感恩", content: "写下3件今天想感谢对方的事，念出来", tips: "每天感恩3件事可以显著提升关系满意度", theory: "Gratitude Practice", tool: true },
    { id: "cd_t_016", level: 1, category: "感恩", content: "发一条消息给对方的家人/朋友，说一件你欣赏对方的事", tips: "第三方认可更有分量", tool: true },
    { id: "cd_t_017", level: 2, category: "感恩", content: "写一封'感谢信'给对方，列出TA为这段关系付出的5件事", tips: "不要觉得理所当然", tool: true },

    // ========== 梦想板 Dream Board ==========
    { id: "cd_t_018", level: 2, category: "梦想共创", content: "一起列一个'情侣愿望清单'：30件想一起做的事", tips: "从简单到疯狂都可以", tool: true },
    { id: "cd_t_019", level: 2, category: "梦想共创", content: "制作一个简单的'5年规划'：分别写下个人目标和共同目标", tips: "看看你们的方向是否一致", tool: true },
    { id: "cd_t_020", level: 3, category: "梦想共创", content: "互相写一封'给10年后的我们'的信", tips: "存好，10年后打开", tool: true },

    // ========== 冲突修复练习 ==========
    { id: "cd_t_021", level: 2, category: "冲突修复", content: "练习'软启动'：把一个抱怨改成用'我'开头的句子重新说", tips: "Gottman'软启动'技术减少防卫", theory: "Gottman Soft Startup", tool: true },
    { id: "cd_t_022", level: 2, category: "冲突修复", content: "回顾最近一次冲突，双方各说'那次我做得不好的是...'", tips: "主动承认错误修复关系", tool: true },
    { id: "cd_t_023", level: 3, category: "冲突修复", content: "设定一个'暂停词'：吵架时说这个词就要暂停20分钟冷静", tips: "避免情绪升级", theory: "Gottman Repair", tool: true },

    // ========== 创意互动 ==========
    { id: "cd_t_024", level: 1, category: "创意互动", content: "一起给对方画一幅画（1分钟速写）", tips: "重点是心意不是画技" },
    { id: "cd_t_025", level: 1, category: "创意互动", content: "互相拍一张'最能代表TA性格'的照片", tips: "解释为什么选这个角度" },
    { id: "cd_t_026", level: 2, category: "创意互动", content: "一起录一段'我们的故事'视频，保存起来", tips: "从相识到现在" },

    // ========== 身体亲密 ==========
    { id: "cd_t_027", level: 2, category: "亲密升温", content: "给对方全身按摩10分钟，专注感受", tips: "创造亲密氛围" },
    { id: "cd_t_028", level: 2, category: "亲密升温", content: "一起洗手/洗脸，互相帮对方擦干", tips: "日常中的亲密" },
    { id: "cd_t_029", level: 3, category: "亲密升温", content: "躺在一起，同步呼吸3分钟", tips: "不说话，只感受" },

    // ========== 承诺更新 ==========
    { id: "cd_t_030", level: 3, category: "承诺更新", content: "各自写下'我对这段关系的承诺'，然后交换念出来", tips: "定期更新承诺", tool: true },
    { id: "cd_t_031", level: 3, category: "承诺更新", content: "认真地再说一次'我爱你'，然后说为什么", tips: "不是敷衍地说，是认真地说" },
    { id: "cd_t_032", level: 3, category: "承诺更新", content: "设定下一个'关系里程碑'并为之庆祝的方式", tips: "纪念日、100天、第一次旅行..." }
  ]
};
