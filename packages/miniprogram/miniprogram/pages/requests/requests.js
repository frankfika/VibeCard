/**
 * 联系请求 inbox（任务 0.4 mock）
 *
 * 使用 fixture 数据展示一条 pending 的联系请求，演示主人的完整决策路径：
 *   列表 -> 详情（对方是谁 / 为什么 / 共同点 / Vibe 的看法）
 *   -> 认识一下（选择联系方式）-> Vibe matched.
 *   -> 以后再说 / 暂不联系（各自状态提示，可返回列表）
 *
 * 不调用任何真实模型或云函数；详情通过页内状态切换，不嵌套弹窗。
 */
const fixtures = require('../../data/vibe-fixtures.js');

Page({
  data: {
    view: 'list', // list | detail | share | connected | later | declined
    request: null,
    decidedAction: '', // '' | 'connected' | 'later' | 'declined'（列表页状态角标）
    vibeTake: null,
    contactMethods: [],
    selectedCount: 0,
    sharedContacts: [],
  },

  onLoad() {
    const r = fixtures.fixtureConnectionRequest;
    this.setData({
      request: {
        id: r.id,
        visitorName: fixtures.fixtureVisitor.name,
        visitorAvatarUrl: fixtures.fixtureVisitor.avatarUrl,
        visitorSummary: r.visitorSummary,
        reason: r.reason,
        possibleSharedContext: r.possibleSharedContext,
        // fixture 时间戳固定为演示用，这里展示固定的相对时间
        timeText: '1 小时前',
      },
      vibeTake: {
        summary: '我觉得你们值得聊一次。',
        reasons: [
          '她真的做过 AI 产品：一个微信上的 AI 记账小程序，不是泛泛的兴趣。',
          '她卡住的点——私人记忆与公开身份的边界，正是你最近在打磨的东西。',
        ],
        uncertainty: '仍不确定：你们最近的时间是否都对得上一次二十分钟的语音。',
      },
      contactMethods: fixtures.fixtureOwnerContactMethods.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: c.label,
        value: c.value,
        checked: false,
      })),
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  // ---------- 视图切换 ----------

  openDetail() {
    this.setData({ view: 'detail' });
  },

  backToList() {
    this.setData({ view: 'list' });
  },

  // ---------- 决策：认识一下 ----------

  onConnect() {
    this.setData({ view: 'share' });
  },

  onToggleContact(e) {
    const id = e.currentTarget.dataset.id;
    const contactMethods = this.data.contactMethods.map((c) =>
      c.id === id ? Object.assign({}, c, { checked: !c.checked }) : c
    );
    this.setData({
      contactMethods,
      selectedCount: contactMethods.filter((c) => c.checked).length,
    });
  },

  onConfirmShare() {
    const shared = this.data.contactMethods.filter((c) => c.checked);
    if (shared.length === 0) {
      wx.showToast({ title: '请选择至少一种联系方式', icon: 'none' });
      return;
    }
    this.setData({
      view: 'connected',
      decidedAction: 'connected',
      sharedContacts: shared,
    });
  },

  // ---------- 决策：以后再说 / 暂不联系 ----------

  onLater() {
    this.setData({ view: 'later', decidedAction: 'later' });
  },

  onDecline() {
    this.setData({ view: 'declined', decidedAction: 'declined' });
  },

  // 重置为待处理，方便重复演示
  onResetDemo() {
    const contactMethods = this.data.contactMethods.map((c) =>
      Object.assign({}, c, { checked: false })
    );
    this.setData({
      view: 'list',
      decidedAction: '',
      contactMethods,
      selectedCount: 0,
      sharedContacts: [],
    });
  },
});
