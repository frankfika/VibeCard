/**
 * 情侣深聊 - 问题卡
 * 融入Gottman关系研究、情绪聚焦疗法(EFT)、非暴力沟通(NVC)
 * 工具性：关系诊断、沟通模板、冲突解决
 */
module.exports = {
  mode: "couple_deep",
  mode_name: "情侣深聊",
  type: "question",
  cards: [
    // ========== Gottman 爱情地图 Love Maps ==========
    { id: "cd_q_001", level: 1, category: "爱情地图", content: "我现在工作/生活中最大的压力源是什么？", tips: "Gottman研究：了解伴侣的内心世界是亲密关系的基础", theory: "Gottman Love Maps", tool: true },
    { id: "cd_q_002", level: 1, category: "爱情地图", content: "我最近最开心的一件事是什么？", tips: "你知道答案吗？", theory: "Gottman Love Maps", tool: true },
    { id: "cd_q_003", level: 1, category: "爱情地图", content: "我这周最担心的事情是什么？", tips: "持续更新彼此的'爱情地图'", theory: "Gottman Love Maps", tool: true },
    { id: "cd_q_004", level: 2, category: "爱情地图", content: "我目前最想实现的三个人生目标是什么？", tips: "你了解TA的梦想吗", theory: "Gottman Love Maps", tool: true },
    { id: "cd_q_005", level: 2, category: "爱情地图", content: "我和原生家庭的关系怎么样？有什么未解决的问题？", tips: "原生家庭影响亲密关系", theory: "Gottman Love Maps" },

    // ========== 关系诊断工具 ==========
    { id: "cd_q_006", level: 2, category: "关系诊断", content: "【四骑士检测】我们吵架时有没有出现：批评、蔑视、防卫、冷战？", tips: "Gottman'末日四骑士'：预测离婚准确率94%", theory: "Four Horsemen", tool: true },
    { id: "cd_q_007", level: 2, category: "关系诊断", content: "1-10分，你觉得我们的沟通质量是多少分？扣分项是什么？", tips: "具体化问题才能解决", tool: true },
    { id: "cd_q_008", level: 2, category: "关系诊断", content: "在我们的关系里，你有没有感到不被理解的时刻？", tips: "EFT情绪聚焦疗法核心问题", theory: "EFT", tool: true },
    { id: "cd_q_009", level: 3, category: "关系诊断", content: "你觉得我们关系中最大的'房间里的大象'是什么？", tips: "那个大家都不说但都知道的问题", tool: true },
    { id: "cd_q_010", level: 3, category: "关系诊断", content: "如果给我们的关系做一次'年度review'，你会怎么评价？", tips: "像工作复盘一样认真", tool: true },

    // ========== NVC 非暴力沟通模板 ==========
    { id: "cd_q_011", level: 2, category: "NVC练习", content: "用这个句式说一件事：'当你...的时候，我感到...，因为我需要...'", tips: "非暴力沟通四要素：观察-感受-需要-请求", theory: "NVC", tool: true },
    { id: "cd_q_012", level: 2, category: "NVC练习", content: "有没有什么事你一直想让我改变，但不知道怎么开口？用NVC试试", tips: "先说感受，再说需要", theory: "NVC", tool: true },
    { id: "cd_q_013", level: 3, category: "NVC练习", content: "回忆上次吵架，如果用NVC重新表达，你会怎么说？", tips: "把指责变成请求", theory: "NVC", tool: true },

    // ========== 依恋修复 Attachment Repair ==========
    { id: "cd_q_014", level: 2, category: "依恋修复", content: "在我们的关系里，什么时候你会感到不安全？", tips: "识别依恋触发点", theory: "Attachment", tool: true },
    { id: "cd_q_015", level: 2, category: "依恋修复", content: "当你感到被忽视时，你希望我怎么做？", tips: "建立安全基地", theory: "Attachment", tool: true },
    { id: "cd_q_016", level: 3, category: "依恋修复", content: "你小时候最需要但没得到的是什么？现在我能给你吗？", tips: "治愈童年伤痕", theory: "Attachment" },

    // ========== 36问深化版 ==========
    { id: "cd_q_017", level: 2, category: "36问情侣版", content: "说出三件你认为我们真正共同拥有的东西", tips: "36问变体：强化'我们感'", theory: "36 Questions" },
    { id: "cd_q_018", level: 2, category: "36问情侣版", content: "完成这个句子：'我希望有人能和我分享...'", tips: "袒露需求", theory: "36 Questions" },
    { id: "cd_q_019", level: 3, category: "36问情侣版", content: "告诉对方你欣赏TA的五个具体特质", tips: "要具体，不要泛泛的'你很好'", theory: "36 Questions" },
    { id: "cd_q_020", level: 3, category: "36问情侣版", content: "分享一个你在这段关系里感到脆弱的时刻", tips: "脆弱性是亲密的桥梁", theory: "Vulnerability" },

    // ========== 未来规划工具 ==========
    { id: "cd_q_021", level: 2, category: "未来规划", content: "5年后，你希望我们的生活是什么样子？", tips: "具体到：住哪、工作、生活方式", tool: true },
    { id: "cd_q_022", level: 2, category: "未来规划", content: "关于要不要孩子/几个孩子，你的真实想法是？", tips: "这个问题必须认真聊", tool: true },
    { id: "cd_q_023", level: 2, category: "未来规划", content: "你理想的婚姻分工是什么样的？", tips: "家务、育儿、经济...", tool: true },
    { id: "cd_q_024", level: 3, category: "未来规划", content: "如果只能选一个：事业成功但感情平淡 vs 感情美满但事业一般？", tips: "人生优先级排序", tool: true },

    // ========== 感恩练习 Gratitude ==========
    { id: "cd_q_025", level: 1, category: "感恩练习", content: "说出三件最近你想感谢我但没说的事", tips: "Gottman研究：5:1比例，5句好话抵消1句批评", theory: "Gottman 5:1", tool: true },
    { id: "cd_q_026", level: 1, category: "感恩练习", content: "我最近做的哪件小事让你感到被爱？", tips: "关注微小的爱的表达", tool: true },
    { id: "cd_q_027", level: 2, category: "感恩练习", content: "在这段关系里，你最感激的一个成长是什么？", tips: "关系是最好的成长场域" },

    // ========== 冲突考古 ==========
    { id: "cd_q_028", level: 3, category: "冲突考古", content: "我们上次吵架的根本原因是什么？表面原因之下的真实需求是？", tips: "挖掘冲突背后的需求", tool: true },
    { id: "cd_q_029", level: 3, category: "冲突考古", content: "我们有没有一个反复出现的'经典吵架'模式？", tips: "识别循环陷阱", tool: true },
    { id: "cd_q_030", level: 3, category: "冲突考古", content: "吵架时，你最希望我做的一件事是什么？", tips: "建立冲突规则", tool: true },

    // ========== 性与亲密 ==========
    { id: "cd_q_031", level: 3, category: "亲密对话", content: "在亲密关系中，你最需要的是什么？（安全感/激情/被需要...）", tips: "性需求背后的情感需求", theory: "Esther Perel" },
    { id: "cd_q_032", level: 3, category: "亲密对话", content: "1-10分，你对我们目前亲密生活的满意度？可以怎么改善？", tips: "坦诚但温柔", tool: true },
    { id: "cd_q_033", level: 3, category: "亲密对话", content: "有没有什么你想尝试但不好意思说的？", tips: "安全的空间里可以坦诚" },

    // ========== 终极问题 ==========
    { id: "cd_q_034", level: 3, category: "终极问题", content: "如果我们最终会分开，你觉得最可能的原因是什么？", tips: "提前识别风险点", tool: true },
    { id: "cd_q_035", level: 3, category: "终极问题", content: "你愿意为这段关系做出的最大改变是什么？", tips: "真正的承诺需要行动" }
  ]
};
