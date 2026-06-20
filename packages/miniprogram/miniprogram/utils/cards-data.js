const allCards = [
  { id: 'aron_01', question: '如果可以邀请世界上任何人共进晚餐，你会选择谁？', tags: ['36问', '灵魂拷问', '破冰', '梦想目标', '初识', '轻松搞笑'], source: 'Arthur Aron 36问' },
  { id: 'aron_02', question: '你想成名吗？以什么方式成名？', tags: ['36问', '灵魂拷问', '破冰', '梦想目标', '初识', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_03', question: '打电话之前，你会先排练要说什么吗？为什么？', tags: ['36问', '灵魂拷问', '破冰', '性格特质', '初识', '轻松搞笑'], source: 'Arthur Aron 36问' },
  { id: 'aron_04', question: '对你来说，怎样才算"完美"的一天？', tags: ['36问', '灵魂拷问', '破冰', '生活方式', '初识', '温馨治愈'], source: 'Arthur Aron 36问' },
  { id: 'aron_05', question: '你上一次对自己唱歌是什么时候？对别人唱呢？', tags: ['36问', '灵魂拷问', '破冰', '性格特质', '初识', '轻松搞笑'], source: 'Arthur Aron 36问' },
  { id: 'aron_06', question: '如果你能活到90岁，后60年可以一直保持30岁时的心智或身体，你会选哪个？', tags: ['36问', '二选一', '破冰', '人生哲学', '初识', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_07', question: '你有没有秘密地预感过自己会以怎样的方式死去？', tags: ['36问', '灵魂拷问', '暖场', '恐惧脆弱', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_08', question: '说出三件你和对方看起来相同的特点。', tags: ['36问', '默契考验', '破冰', '性格特质', '初识', '浪漫甜蜜'], source: 'Arthur Aron 36问' },
  { id: 'aron_09', question: '你人生中最感恩的是什么？', tags: ['36问', '灵魂拷问', '暖场', '价值观', '初识', '温馨治愈'], source: 'Arthur Aron 36问' },
  { id: 'aron_10', question: '如果你能改变成长过程中的一件事，会是什么？', tags: ['36问', '灵魂拷问', '暖场', '原生家庭', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_11', question: '用四分钟，尽可能详细地告诉对方你的人生故事。', tags: ['36问', '灵魂拷问', '暖场', '童年回忆', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_12', question: '如果明天醒来能获得一种能力或特质，你希望是什么？', tags: ['36问', '灵魂拷问', '暖场', '梦想目标', '初识', '轻松搞笑'], source: 'Arthur Aron 36问' },
  { id: 'aron_13', question: '如果有个水晶球能告诉你关于自己、人生、未来或任何事的真相，你想知道什么？', tags: ['36问', '灵魂拷问', '深入', '人生哲学', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_14', question: '有没有什么事是你梦想很久却一直没做的？为什么没做？', tags: ['36问', '灵魂拷问', '深入', '梦想目标', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_15', question: '你人生中最大的成就是什么？', tags: ['36问', '灵魂拷问', '深入', '价值观', '约会中', '温馨治愈'], source: 'Arthur Aron 36问' },
  { id: 'aron_16', question: '在友情中你最看重什么？', tags: ['36问', '灵魂拷问', '深入', '价值观', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_17', question: '你最珍贵的记忆是什么？', tags: ['36问', '灵魂拷问', '深入', '童年回忆', '约会中', '温馨治愈'], source: 'Arthur Aron 36问' },
  { id: 'aron_18', question: '你最糟糕的记忆是什么？', tags: ['36问', '灵魂拷问', '深入', '恐惧脆弱', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_19', question: '如果你知道自己一年后会突然死去，你会改变现在的生活方式吗？为什么？', tags: ['36问', '灵魂拷问', '深入', '人生哲学', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_20', question: '友情对你来说意味着什么？', tags: ['36问', '灵魂拷问', '深入', '价值观', '约会中', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_21', question: '爱和情感在你生命中扮演什么角色？', tags: ['36问', '灵魂拷问', '深入', '爱情观', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_22', question: '轮流分享你认为对方身上的优点，每人说五条。', tags: ['36问', '默契考验', '深入', '性格特质', '约会中', '浪漫甜蜜'], source: 'Arthur Aron 36问' },
  { id: 'aron_23', question: '你的家庭关系亲密温暖吗？你觉得你的童年比别人更幸福吗？', tags: ['36问', '灵魂拷问', '深入', '原生家庭', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_24', question: '你和母亲的关系如何？', tags: ['36问', '灵魂拷问', '深入', '原生家庭', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_25', question: '用"我们"造三个真实的句子，比如"我们都在这个房间里感到..."', tags: ['36问', '默契考验', '灵魂', '爱情观', '热恋期', '浪漫甜蜜'], source: 'Arthur Aron 36问' },
  { id: 'aron_26', question: '完成这个句子："我希望有人能和我分享..."', tags: ['36问', '灵魂拷问', '灵魂', '恐惧脆弱', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_27', question: '如果你要和对方成为亲密的朋友，有什么是TA需要知道的？', tags: ['36问', '灵魂拷问', '灵魂', '恐惧脆弱', '热恋期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_28', question: '告诉对方你喜欢TA什么，要非常诚实，说一些你不会对刚认识的人说的话。', tags: ['36问', '灵魂拷问', '灵魂', '爱情观', '热恋期', '浪漫甜蜜'], source: 'Arthur Aron 36问' },
  { id: 'aron_29', question: '和对方分享生命中尴尬的时刻。', tags: ['36问', '灵魂拷问', '灵魂', '恐惧脆弱', '热恋期', '轻松搞笑'], source: 'Arthur Aron 36问' },
  { id: 'aron_30', question: '你上一次在别人面前哭是什么时候？自己一个人哭呢？', tags: ['36问', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_31', question: '告诉对方，你已经喜欢上了TA的什么。', tags: ['36问', '灵魂拷问', '灵魂', '爱情观', '热恋期', '浪漫甜蜜'], source: 'Arthur Aron 36问' },
  { id: 'aron_32', question: '有什么事情是太严肃了而不能开玩笑的？', tags: ['36问', '灵魂拷问', '灵魂', '价值观', '稳定期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_33', question: '如果你今晚就会死去，而且没有机会和任何人交流，你最后悔没说出口的是什么？为什么还没说？', tags: ['36问', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_34', question: '你的房子着火了，里面有你所有的东西。救出家人和宠物后，你还有时间再冲进去拿一样东西，你会拿什么？为什么？', tags: ['36问', '情景模拟', '灵魂', '价值观', '稳定期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_35', question: '家人中谁的去世会让你最难过？为什么？', tags: ['36问', '灵魂拷问', '灵魂', '原生家庭', '稳定期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'aron_36', question: '分享一个私人问题，询问对方会怎么处理。然后也请对方告诉你，TA觉得你对这个问题的感受如何。', tags: ['36问', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'Arthur Aron 36问' },
  { id: 'gottman_01', question: '我最欣赏你的三个品质是什么？', tags: ['Gottman', '灵魂拷问', '暖场', '性格特质', '稳定期', '浪漫甜蜜'], source: 'Gottman研究所' },
  { id: 'gottman_02', question: '你觉得我们的关系中最需要改善的是什么？', tags: ['Gottman', '灵魂拷问', '深入', '爱情观', '稳定期', '深度走心'], source: 'Gottman研究所' },
  { id: 'gottman_03', question: '我们上次开怀大笑是什么时候？当时发生了什么？', tags: ['Gottman', '灵魂拷问', '暖场', '生活方式', '稳定期', '轻松搞笑'], source: 'Gottman研究所' },
  { id: 'gottman_04', question: '你希望我以什么方式表达爱意？', tags: ['Gottman', '爱的语言', '灵魂拷问', '深入', '爱情观', '稳定期', '浪漫甜蜜'], source: 'Gottman研究所' },
  { id: 'gottman_05', question: '当我们发生冲突时，你最希望我做什么？', tags: ['Gottman', '灵魂拷问', '深入', '爱情观', '稳定期', '深度走心'], source: 'Gottman研究所' },
  { id: 'wyr_01', question: '宁可永远不能吃甜食，还是永远不能吃咸的？', tags: ['二选一', '破冰', '生活方式', '初识', '轻松搞笑'], source: '经典派对游戏' },
  { id: 'wyr_02', question: '宁可有读心术但别人也能读你的心，还是完全没有这个能力？', tags: ['二选一', '情景模拟', '暖场', '人生哲学', '初识', '轻松搞笑'], source: '经典派对游戏' },
  { id: 'wyr_03', question: '宁可回到过去改变一件事，还是看到未来但不能改变？', tags: ['二选一', '情景模拟', '深入', '人生哲学', '约会中', '深度走心'], source: '经典派对游戏' },
  { id: 'wyr_04', question: '宁可有个无聊但稳定的工作，还是刺激但收入不稳的事业？', tags: ['二选一', '深入', '价值观', '约会中', '深度走心'], source: '经典派对游戏' },
  { id: 'wyr_05', question: '宁可和一个你爱但不爱你的人在一起，还是一个爱你但你不爱的人？', tags: ['二选一', '灵魂', '爱情观', '热恋期', '深度走心'], source: '经典派对游戏' },
  { id: 'nhie_01', question: '我从没在公共场合唱过歌', tags: ['Never Have I Ever', '破冰', '性格特质', '初识', '轻松搞笑'], source: '经典派对游戏' },
  { id: 'nhie_02', question: '我从没在分手后还想复合过', tags: ['Never Have I Ever', '深入', '爱情观', '约会中', '深度走心'], source: '经典派对游戏' },
  { id: 'nhie_03', question: '我从没在电影院里哭过', tags: ['Never Have I Ever', '破冰', '性格特质', '初识', '轻松搞笑'], source: '经典派对游戏' },
  { id: 'quick_01', question: '咖啡还是茶？', tags: ['快问快答', '破冰', '生活方式', '初识', '轻松搞笑'], source: '经典破冰游戏' },
  { id: 'quick_02', question: '猫派还是狗派？', tags: ['快问快答', '破冰', '生活方式', '初识', '轻松搞笑'], source: '经典破冰游戏' },
  { id: 'quick_03', question: '早起鸟还是夜猫子？', tags: ['快问快答', '破冰', '生活方式', '初识', '轻松搞笑'], source: '经典破冰游戏' },
  { id: 'dare_01', question: '对视30秒不说话，看看会发生什么。', tags: ['亲密挑战', '真心话大冒险', '暖场', '爱情观', '约会中', '浪漫甜蜜'], source: '亲密挑战' },
  { id: 'dare_02', question: '用一分钟描述为什么喜欢对方，不能停顿。', tags: ['亲密挑战', '真心话大冒险', '深入', '爱情观', '热恋期', '浪漫甜蜜'], source: '亲密挑战' },
  { id: 'dare_03', question: '给对方一个持续10秒的拥抱。', tags: ['亲密挑战', '真心话大冒险', '暖场', '爱情观', '约会中', '浪漫甜蜜'], source: '亲密挑战' },
  { id: 'scenario_01', question: '如果我们同时失业了，你会怎么办？', tags: ['情景模拟', '深入', '未来规划', '稳定期', '深度走心'], source: '情景模拟问题' },
  { id: 'scenario_02', question: '如果你的好友不喜欢我，你会怎么处理？', tags: ['情景模拟', '深入', '爱情观', '热恋期', '深度走心'], source: '情景模拟问题' },
  { id: 'theand_01', question: '你觉得我们的关系中，有什么是你不敢问我的？', tags: ['THE AND', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'The Skin Deep' },
  { id: 'theand_02', question: '我有没有做过什么事让你失望但你没说出来？', tags: ['THE AND', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'The Skin Deep' },
  { id: 'theand_03', question: '你觉得我真正了解你吗？有什么是我不知道的？', tags: ['THE AND', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'The Skin Deep' },
  { id: 'esther_01', question: '在关系中，你是更害怕失去自我，还是更害怕失去对方？', tags: ['Esther Perel', '灵魂拷问', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: 'Esther Perel' },
  { id: 'esther_02', question: '你觉得神秘感在长期关系中还重要吗？', tags: ['Esther Perel', '灵魂拷问', '深入', '爱情观', '老夫老妻', '深度走心'], source: 'Esther Perel' },
  { id: 'proust_01', question: '你认为最完美的快乐是什么？', tags: ['Proust问卷', '灵魂拷问', '深入', '人生哲学', '约会中', '深度走心'], source: '普鲁斯特问卷' },
  { id: 'proust_02', question: '你最害怕的是什么？', tags: ['Proust问卷', '灵魂拷问', '深入', '恐惧脆弱', '热恋期', '深度走心'], source: '普鲁斯特问卷' },
  { id: 'love_lang_01', question: '你更喜欢收到实用的礼物还是有纪念意义的礼物？', tags: ['爱的语言', '二选一', '暖场', '爱情观', '约会中', '浪漫甜蜜'], source: '五种爱的语言' },
  { id: 'love_lang_02', question: '你更希望伴侣经常说"我爱你"，还是用行动证明？', tags: ['爱的语言', '二选一', '深入', '爱情观', '热恋期', '深度走心'], source: '五种爱的语言' },
  { id: 'sync_01', question: '猜猜对方最怕什么动物？', tags: ['默契考验', '破冰', '恐惧脆弱', '初识', '轻松搞笑'], source: '默契考验游戏' },
  { id: 'sync_02', question: '对方最喜欢什么颜色？', tags: ['默契考验', '破冰', '性格特质', '初识', '轻松搞笑'], source: '默契考验游戏' },
  { id: 'fun_01', question: '如果你的人生是一部电影，它是什么类型的？', tags: ['灵魂拷问', '破冰', '性格特质', '初识', '轻松搞笑'], source: '趣味破冰' },
  { id: 'fun_02', question: '你的"guilty pleasure"是什么？', tags: ['灵魂拷问', '破冰', '生活方式', '初识', '轻松搞笑'], source: '趣味破冰' },
  { id: 'fun_03', question: '如果你有一个超能力只能用一天，你想要什么？', tags: ['灵魂拷问', '情景模拟', '破冰', '梦想目标', '初识', '轻松搞笑'], source: '趣味破冰' },
  { id: 'island_01', question: '如果只能带三样东西去荒岛，你会带什么？', tags: ['荒岛求生', '破冰', '价值观', '初识', '轻松搞笑'], source: '荒岛问题' },
  { id: 'romantic_01', question: '如果我是一首歌，你觉得我是哪首？', tags: ['灵魂拷问', '暖场', '性格特质', '热恋期', '浪漫甜蜜'], source: '浪漫问题' },
  { id: 'romantic_02', question: '你最想和我一起完成的一件事是什么？', tags: ['灵魂拷问', '深入', '梦想目标', '热恋期', '浪漫甜蜜'], source: '浪漫问题' },
  { id: 'romantic_03', question: '十年后你希望我们在做什么？', tags: ['灵魂拷问', '深入', '未来规划', '稳定期', '浪漫甜蜜'], source: '浪漫问题' },
  { id: 'ttl_01', question: '说出关于你童年的三件事，其中一件是假的。让对方猜猜哪个是假的？', tags: ['两真一假', '破冰', '童年回忆', '初识', '轻松搞笑'], source: '经典派对游戏' },
  { id: 'attach_01', question: '当伴侣需要独处空间时，你的第一反应是什么？', tags: ['依恋理论', '灵魂拷问', '深入', '爱情观', '热恋期', '深度走心'], source: '依恋理论' },
  { id: 'attach_02', question: '在关系中，你更担心被抛弃还是被束缚？', tags: ['依恋理论', '二选一', '灵魂', '恐惧脆弱', '稳定期', '深度走心'], source: '依恋理论' },
  { id: 'sol_01', question: '你觉得爱情中"了解一个人"意味着什么？', tags: ['School of Life', '灵魂拷问', '深入', '爱情观', '约会中', '深度走心'], source: 'School of Life' },
  { id: 'sol_02', question: '你相信一见钟情吗？为什么？', tags: ['School of Life', '灵魂拷问', '暖场', '爱情观', '初识', '深度走心'], source: 'School of Life' },
];

const tags = [
  { id: '36问', name: '36问', category: '经典' },
  { id: 'Gottman', name: 'Gottman', category: '经典' },
  { id: '二选一', name: '二选一', category: '趣味' },
  { id: 'Never Have I Ever', name: 'Never Have I Ever', category: '趣味' },
  { id: '快问快答', name: '快问快答', category: '趣味' },
  { id: '真心话大冒险', name: '真心话大冒险', category: '趣味' },
  { id: '亲密挑战', name: '亲密挑战', category: '趣味' },
  { id: '情景模拟', name: '情景模拟', category: '趣味' },
  { id: 'THE AND', name: 'THE AND', category: '经典' },
  { id: 'Esther Perel', name: 'Esther Perel', category: '经典' },
  { id: 'Proust问卷', name: 'Proust问卷', category: '经典' },
  { id: '爱的语言', name: '爱的语言', category: '经典' },
  { id: '默契考验', name: '默契考验', category: '趣味' },
  { id: '荒岛求生', name: '荒岛求生', category: '趣味' },
  { id: '两真一假', name: '两真一假', category: '趣味' },
  { id: '依恋理论', name: '依恋理论', category: '经典' },
  { id: 'School of Life', name: 'School of Life', category: '经典' },
];

const presets = [
  { id: 'first-date', name: '初次约会', tags: ['36问', '快问快答', '破冰', '初识'] },
  { id: 'deep-talk', name: '深夜深聊', tags: ['36问', '灵魂拷问', '深度走心'] },
  { id: 'fun-night', name: '轻松搞笑', tags: ['二选一', '快问快答', '轻松搞笑'] },
  { id: 'intimacy', name: '升温亲密', tags: ['亲密挑战', '爱的语言', '浪漫甜蜜'] },
];

const tagCategories = [
  { id: '经典', name: '经典' },
  { id: '趣味', name: '趣味' },
];

const companionTypes = [
  { id: 'sport', name: '运动', icon: '⛹️', color: '#FF6B6B', subcategories: [{ id: 'running', name: '跑步' }, { id: 'fitness', name: '健身' }, { id: 'hiking', name: '徒步' }] },
  { id: 'travel', name: '旅行', icon: '✈️', color: '#4ECDC4', subcategories: [{ id: 'nearby', name: '周边游' }, { id: 'camping', name: '露营' }] },
  { id: 'food', name: '饭搭子', icon: '🍜', color: '#FFE66D', subcategories: [{ id: 'explore', name: '探店' }, { id: 'cooking', name: '做饭' }] },
  { id: 'study', name: '学习', icon: '📚', color: '#95E1D3', subcategories: [{ id: 'postgrad', name: '考研' }, { id: 'bookclub', name: '读书会' }] },
  { id: 'movie', name: '观影', icon: '🎬', color: '#A8E6CF', subcategories: [{ id: 'cinema', name: '电影' }, { id: 'exhibition', name: '展览' }] },
  { id: 'game', name: '游戏', icon: '🎮', color: '#B4A7D6', subcategories: [{ id: 'boardgame', name: '桌游' }, { id: 'escape', name: '密室' }] },
  { id: 'pet', name: '遛宠', icon: '🐕', color: '#FFB6C1', subcategories: [{ id: 'dogwalk', name: '遛狗' }, { id: 'catcafe', name: '猫咖' }] },
  { id: 'hobby', name: '兴趣', icon: '🎨', color: '#FFDAB9', subcategories: [{ id: 'painting', name: '画画' }, { id: 'photography', name: '摄影' }] },
];

// mockActivities removed — activities are now loaded from chain/backend only
const mockActivities = [];

function getCardsByTags(selectedTags) {
  if (!selectedTags || selectedTags.length === 0) return allCards;
  return allCards.filter(card => selectedTags.some(tag => card.tags.includes(tag)));
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = {
  allCards, getCardsByTags, shuffleArray,
  tags, tagCategories, presets,
  companionTypes, mockActivities
};
