// 中文语言包
const lang = {
  appName: 'vibecard',
  slogan: '让每一次互动都充满心动',
  greeting: {
    morning: '早安',
    afternoon: '下午好',
    evening: '晚上好'
  },
  quickStart: '随机抽卡',
  quickDesc: '惊喜从这里开始',
  selectMode: '选择模式',
  selectModeDesc: '找到属于你们的节奏',
  cards: '张卡片',
  dailyTip: '今日心语',

  // 模式
  modes: {
    dating_icebreaker: {
      name: '相亲破冰',
      desc: '快速了解三观，判断是否合适',
      icon: '🫱🏻‍🫲🏼'
    },
    romance_spark: {
      name: '约会心动',
      desc: '制造浪漫话题，让心跳加速',
      icon: '💕'
    },
    couple_deep: {
      name: '情侣深聊',
      desc: '深度交流，让灵魂更近',
      icon: '🔥'
    },
    marriage_fresh: {
      name: '婚姻保鲜',
      desc: '重燃激情，找回初心',
      icon: '💍'
    }
  },

  // 卡片类型
  cardTypes: {
    question: '灵魂拷问',
    task: '亲密挑战',
    choice: '二选一',
    scene: '情景模拟',
    compatibility: '默契考验',
    truth_or_dare: '真心话大冒险',
    conflict_resolution: '矛盾化解'
  },

  // 游戏页
  game: {
    tapToFlip: '轻触翻开',
    skip: '换一张',
    next: '完成',
    restart: '重新开始',
    favorite: '收藏',
    completed: '太棒了！',
    completedDesc: '这个模式的卡片都完成啦',
    vs: 'VS',
    progress: '进度'
  },

  // 收藏页
  favorites: {
    title: '我的收藏',
    count: '张收藏',
    empty: '还没有收藏哦',
    emptyDesc: '玩卡片时点击 ♡ 收藏喜欢的内容',
    goPlay: '去抽卡',
    close: '关闭'
  },

  // 设置页
  settings: {
    title: '我的',
    yourInteraction: '互动记录',
    completedCards: '已完成',
    favoriteCards: '已收藏',
    daysPlayed: '天数',
    progressManage: '进度管理',
    reset: '重置',
    dataManage: '数据管理',
    resetAll: '重置所有进度',
    clearFavorites: '清空收藏',
    clearAllData: '清除所有数据',
    more: '更多',
    share: '分享给TA',
    version: '版本',
    footer: '愿每对爱人都能找到心动的感觉',
    localOnly: '数据仅存储在本地',
    confirmReset: '确定要重置吗？',
    confirmClear: '确定要清空吗？'
  },

  // 欢迎页
  welcome: {
    title: 'vibecard',
    subtitle: '让每次互动都充满心动',
    start: '开始探索'
  },

  // 每日心语
  dailyTips: [
    '今天记得对TA说一句「谢谢你陪着我」',
    '一起尝试一件从没做过的事吧',
    '认真倾听，是最好的陪伴',
    '给TA一个长长的拥抱，不需要理由',
    '分享今天最开心的小事',
    '偶尔撒个娇，感情会更甜',
    '记住TA说过的小事，会让TA感到被珍惜',
    '散步聊天，是最浪漫的约会',
    '多发现对方的闪光点',
    '有分歧时，先抱一下再说',
    '制造一个小惊喜，不用很贵重',
    '眼神交流和微笑，比说一百句话都甜',
    '学会示弱不是软弱，是信任',
    '一起创造更多美好回忆吧',
    '适度的空间让爱更自在'
  ]
};

// 获取翻译对象
function t() {
  return lang;
}

// 兼容旧代码
function getCurrentLanguage() {
  return 'zh';
}

function setLanguage() {
  // 不再需要切换语言
}

module.exports = {
  lang,
  t,
  getCurrentLanguage,
  setLanguage
};
