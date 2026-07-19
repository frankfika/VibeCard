/**
 * 联系请求 inbox（任务 0.4 mock + 任务 2.5 真实云链路）
 *
 * 优先走真实云链路：
 *   listInbox 拉取收件箱 -> 详情页 agent.summarizeConnection 生成「Vibe 的看法」
 *   -> actOnRequest(decision: connect|later|decline) -> connect 时从返回结果里
 *   拿到主人勾选的联系方式值（仅 connect 状态才会附带）。
 *
 * 云环境未部署或调用失败时回退到任务 0.4 的 fixture 演示模式，演示路径不中断。
 *
 * 产品规则：联系方式只在主人 connect 之后可见；是否认识永远由主人决定。
 */
const fixtures = require('../../data/vibe-fixtures.js');
const cloud = require('../../utils/cloud.js');

// agent.summarizeConnection 的 recommendation 文案映射
const RECOMMENDATION_TEXT = {
  worth_a_conversation: '我觉得你们值得聊一次。',
  maybe_later: '也许再过段时间更合适。',
  need_more_context: '我还判断不好，信息不太够。',
  not_relevant_now: '这次可能不太相关。',
};

const STATUS_TEXT = {
  pending: '待你决定',
  later: '先放一放',
  decline: '已礼貌回绝',
  connect: '已认识',
};

// fixture 演示模式下「Vibe 的看法」，云端 summarizeConnection 失败时也回退到它
const FIXTURE_VIBE_TAKE = {
  summary: '我觉得你们值得聊一次。',
  reasons: [
    '她真的做过 AI 产品：一个微信上的 AI 记账小程序，不是泛泛的兴趣。',
    '她卡住的点——私人记忆与公开身份的边界，正是你最近在打磨的东西。',
  ],
  uncertainty: '仍不确定：你们最近的时间是否都对得上一次二十分钟的语音。',
};

// 任务 4.3：弱理由请求的 Vibe 看法——温和地说信息不够，而不是替主人挡人
const FIXTURE_WEAK_VIBE_TAKE = {
  summary: '我还判断不好，信息不太够。',
  reasons: [
    '理由比较泛泛，没有说出具体想一起做什么。',
    '也没有留下可以了解的背景或作品。',
  ],
  uncertainty: '仍不确定：对方是否真的了解过你在做的事。',
};

function formatTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
}

// 请求没有独立的访客名字段，从 visitorSummary 的首段猜一个称呼
function deriveVisitorName(summary) {
  const first = String(summary || '').split(/[，,]/)[0].trim();
  if (first && first.length <= 8) return first;
  return '一位访客';
}

Page({
  data: {
    view: 'list', // list | detail | share | connected | later | declined
    demoMode: false,
    requestsList: [],      // 列表项 { id, visitorName, reason, timeText, statusText, ... }
    currentRequest: null,  // 详情页请求
    vibeTake: null,
    summaryLoading: false,
    contactMethods: [],
    contactMethodsLoaded: false,
    selectedCount: 0,
    sharedContacts: [],
    decidedAction: '', // 仅 demo 模式：'' | 'connected' | 'later' | 'declined'
    acting: false,
  },

  onLoad() {
    this.demoMode = false;
    this.loadInbox({ allowFallback: true });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  // ---------- 数据加载 ----------

  async loadInbox({ allowFallback } = {}) {
    try {
      const res = await cloud.callFunction('requests', { action: 'listInbox' });
      if (!res || res.ok !== true) {
        if (res && res.error && res.error.code === 'unauthorized') {
          // 未登录：提示并保持当前页面状态，不回退演示（避免给未登录主人展示假数据）
          wx.showToast({ title: '请先登录后再试', icon: 'none' });
          return;
        }
        throw new Error((res && res.error && res.error.message) || 'listInbox failed');
      }
      this.demoMode = false;
      const requestsList = (res.result.requests || []).map((r) => this.mapCloudRequest(r));
      this.setData({ requestsList, demoMode: false });
    } catch (err) {
      if (!allowFallback) {
        console.warn('[requests] refresh inbox failed:', err && err.message);
        return;
      }
      // 云未部署/未登录：回退到 fixture 演示模式（任务 0.4 路径保持可用）
      console.warn('[requests] cloud unavailable, fallback to fixture demo:', err && err.message);
      this.demoMode = true;
      this.loadFixtureDemo();
    }
  },

  mapCloudRequest(r) {
    return {
      id: r._id,
      visitorName: deriveVisitorName(r.visitorSummary),
      visitorAvatarUrl: '',
      visitorSummary: r.visitorSummary || '',
      reason: r.reason || '',
      possibleSharedContext: Array.isArray(r.possibleSharedContext) ? r.possibleSharedContext : [],
      timeText: formatTime(r.createdAt),
      ownerAction: r.ownerAction || 'pending',
      statusText: STATUS_TEXT[r.ownerAction] || STATUS_TEXT.pending,
    };
  },

  loadFixtureDemo() {
    const r = fixtures.fixtureConnectionRequest;
    const weak = fixtures.fixtureWeakConnectionRequest;
    this.setData({
      demoMode: true,
      requestsList: [
        {
          id: r.id,
          visitorName: fixtures.fixtureVisitor.name,
          visitorAvatarUrl: fixtures.fixtureVisitor.avatarUrl,
          visitorSummary: r.visitorSummary,
          reason: r.reason,
          possibleSharedContext: r.possibleSharedContext,
          // fixture 时间戳固定为演示用，这里展示固定的相对时间
          timeText: '1 小时前',
          ownerAction: 'pending',
          statusText: STATUS_TEXT.pending,
        },
        {
          // 任务 4.3：弱理由请求，演示 Vibe 的边界表达
          id: weak.id,
          visitorName: fixtures.fixtureWeakVisitor.name,
          visitorAvatarUrl: fixtures.fixtureWeakVisitor.avatarUrl,
          visitorSummary: weak.visitorSummary,
          reason: weak.reason,
          possibleSharedContext: weak.possibleSharedContext,
          timeText: '3 小时前',
          ownerAction: 'pending',
          statusText: STATUS_TEXT.pending,
        },
      ],
      vibeTake: FIXTURE_VIBE_TAKE,
    });
  },

  // ---------- 详情 ----------

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    const found = this.data.requestsList.find((r) => r.id === id) || this.data.requestsList[0];
    if (!found) return;
    this.setData({ currentRequest: found, view: 'detail', vibeTake: null });

    if (this.demoMode) {
      const take = found.id === fixtures.fixtureWeakConnectionRequest.id
        ? FIXTURE_WEAK_VIBE_TAKE
        : FIXTURE_VIBE_TAKE;
      this.setData({ vibeTake: take });
      return;
    }
    this.loadSummary(found.id);
  },

  // 「你的 Vibe 的看法」：agent.summarizeConnection；失败回退 fixture 看法，页面保持可用
  async loadSummary(requestId) {
    this.setData({ summaryLoading: true });
    try {
      const res = await cloud.callFunction('agent', { action: 'summarizeConnection', requestId });
      if (!res || res.ok !== true) {
        if (res && res.error && res.error.code === 'unauthorized') {
          wx.showToast({ title: '请先登录后再试', icon: 'none' });
        }
        throw new Error((res && res.error && res.error.message) || 'summarizeConnection failed');
      }
      const s = res.result || {};
      this.setData({
        vibeTake: {
          summary: RECOMMENDATION_TEXT[s.recommendation] || '我还没想好。',
          reasons: Array.isArray(s.why) && s.why.length > 0 ? s.why : FIXTURE_VIBE_TAKE.reasons,
          uncertainty: s.uncertainty ? '仍不确定：' + s.uncertainty : FIXTURE_VIBE_TAKE.uncertainty,
        },
      });
    } catch (err) {
      console.warn('[requests] summarizeConnection failed, fallback to fixture take:', err && err.message);
      this.setData({ vibeTake: FIXTURE_VIBE_TAKE });
    } finally {
      this.setData({ summaryLoading: false });
    }
  },

  backToList() {
    this.setData({ view: 'list', currentRequest: null });
    if (!this.demoMode) this.loadInbox({ allowFallback: false });
  },

  // 从联系方式选择返回详情（不重新加载 summary）
  backToDetail() {
    this.setData({ view: 'detail' });
  },

  // ---------- 决策：认识一下 ----------

  async onConnect() {
    this.setData({ view: 'share' });
    if (this.demoMode) {
      this.setData({
        contactMethods: fixtures.fixtureOwnerContactMethods.map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          value: c.value,
          checked: false,
        })),
        contactMethodsLoaded: true,
        selectedCount: 0,
      });
      return;
    }
    if (!this.data.contactMethodsLoaded) await this.loadContactMethods();
  },

  // 主人自己的联系方式选项，来自 users 文档的 contactMethods
  async loadContactMethods() {
    try {
      const profile = await cloud.callFunction('user', { action: 'getProfile' });
      const methods = (profile && Array.isArray(profile.contactMethods) ? profile.contactMethods : [])
        .filter((m) => m && m.id)
        .map((m) => ({ id: m.id, kind: m.kind, label: m.label || m.kind, value: m.value, checked: false }));
      this.setData({ contactMethods: methods, contactMethodsLoaded: true, selectedCount: 0 });
    } catch (err) {
      console.warn('[requests] load contactMethods failed:', err && err.message);
      this.setData({ contactMethods: [], contactMethodsLoaded: true, selectedCount: 0 });
    }
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

  async onConfirmShare() {
    const selected = this.data.contactMethods.filter((c) => c.checked);
    if (selected.length === 0) {
      wx.showToast({ title: '请选择至少一种联系方式', icon: 'none' });
      return;
    }

    if (this.demoMode) {
      this.updateDemoStatus('connect');
      this.setData({
        view: 'connected',
        decidedAction: 'connected',
        sharedContacts: selected,
      });
      return;
    }

    if (this.data.acting) return;
    this.setData({ acting: true });
    try {
      const res = await cloud.callFunction('requests', {
        action: 'actOnRequest',
        requestId: this.data.currentRequest.id,
        decision: 'connect',
        sharedContactMethodIds: selected.map((c) => c.id),
      });
      if (!res || res.ok !== true) {
        const code = res && res.error && res.error.code;
        wx.showToast({
          title: code === 'invalid_transition'
            ? '这条请求已经处理过了'
            : code === 'unauthorized'
              ? '请先登录后再试'
              : '操作失败，稍后再试',
          icon: 'none',
        });
        return;
      }
      // 联系方式值只在 connect 之后由云端附带回来
      this.setData({
        view: 'connected',
        sharedContacts: res.result.sharedContacts || [],
      });
    } catch (err) {
      console.warn('[requests] connect failed:', err && err.message);
      wx.showToast({ title: '操作失败，稍后再试', icon: 'none' });
    } finally {
      this.setData({ acting: false });
    }
  },

  // ---------- 决策：以后再说 / 暂不联系 ----------

  async onLater() {
    await this.actOnCurrent('later', 'later', 'later');
  },

  async onDecline() {
    await this.actOnCurrent('decline', 'declined', 'declined');
  },

  async actOnCurrent(decision, view, demoAction) {
    if (this.demoMode) {
      this.updateDemoStatus(decision);
      this.setData({ view, decidedAction: demoAction });
      return;
    }
    if (this.data.acting) return;
    this.setData({ acting: true });
    try {
      const res = await cloud.callFunction('requests', {
        action: 'actOnRequest',
        requestId: this.data.currentRequest.id,
        decision,
      });
      if (!res || res.ok !== true) {
        const code = res && res.error && res.error.code;
        wx.showToast({
          title: code === 'unauthorized' ? '请先登录后再试' : '操作失败，稍后再试',
          icon: 'none',
        });
        return;
      }
      this.setData({ view });
    } catch (err) {
      console.warn('[requests] actOnRequest(' + decision + ') failed:', err && err.message);
      wx.showToast({ title: '操作失败，稍后再试', icon: 'none' });
    } finally {
      this.setData({ acting: false });
    }
  },

  // demo 模式下决策后同步列表角标
  updateDemoStatus(ownerAction) {
    const requestsList = this.data.requestsList.map((r) =>
      Object.assign({}, r, { ownerAction, statusText: STATUS_TEXT[ownerAction] || STATUS_TEXT.pending })
    );
    this.setData({ requestsList });
  },

  // ---------- 拉黑：不再接收 TA 的消息（任务 3.2） ----------

  // 仅 pending/later 的请求显示该入口（WXML 侧同样做了条件渲染）
  onBlockVisitor() {
    const req = this.data.currentRequest;
    if (!req) return;
    if (req.ownerAction !== 'pending' && req.ownerAction !== 'later') return;
    wx.showModal({
      title: '不再接收 TA 的消息？',
      content: '之后 TA 将无法再与你的 Vibe 对话，也无法再向你发送认识请求。',
      confirmText: '不再接收',
      success: (res) => {
        if (res && res.confirm) this.confirmBlockVisitor();
      },
    });
  },

  async confirmBlockVisitor() {
    const req = this.data.currentRequest;
    if (!req) return;

    if (this.demoMode) {
      // demo 模式：本地模拟，不调云
      this.updateDemoStatus('decline');
      this.setData({
        currentRequest: Object.assign({}, req, { ownerAction: 'decline', statusText: STATUS_TEXT.decline }),
        decidedAction: 'declined',
      });
      wx.showToast({ title: '已不再接收 TA 的消息', icon: 'none' });
      return;
    }

    if (this.data.acting) return;
    this.setData({ acting: true });
    try {
      const res = await cloud.callFunction('requests', {
        action: 'blockVisitor',
        requestId: req.id,
      });
      if (!res || res.ok !== true) {
        const code = res && res.error && res.error.code;
        wx.showToast({
          title: code === 'unauthorized' ? '请先登录后再试' : '操作失败，请稍后再试',
          icon: 'none',
        });
        return;
      }
      // 拉黑后 pending/later 的请求会被云端置为 decline，详情状态同步刷新
      const updated = (res.result && res.result.request) || {};
      const ownerAction = updated.ownerAction || 'decline';
      this.setData({
        currentRequest: Object.assign({}, req, {
          ownerAction,
          statusText: STATUS_TEXT[ownerAction] || STATUS_TEXT.decline,
        }),
      });
      wx.showToast({ title: '已不再接收 TA 的消息', icon: 'none' });
    } catch (err) {
      console.warn('[requests] blockVisitor failed:', err && err.message);
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ acting: false });
    }
  },

  // 重置为待处理，方便重复演示（仅 demo 模式显示）
  onResetDemo() {
    if (!this.demoMode) return;
    this.setData({
      view: 'list',
      decidedAction: '',
      currentRequest: null,
      contactMethods: [],
      contactMethodsLoaded: false,
      selectedCount: 0,
      sharedContacts: [],
      vibeTake: FIXTURE_VIBE_TAKE,
    });
    this.loadFixtureDemo();
  },
});
