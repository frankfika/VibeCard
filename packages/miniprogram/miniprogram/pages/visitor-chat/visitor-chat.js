/**
 * 访客分身对话（任务 0.4 mock + 任务 2.5 真实云链路）
 *
 * 云模式（页面参数带 ownerId，如分享链接场景）：
 *   card.getPublicCard 校验云可用并初始化分身开场 -> 消息走 agent.visitorMessage
 *   （blocked / rate_limited 闸门返回时，分身温和收尾并结束本次对话）
 *   -> 按 nextAction 流转（invite_connection_reason 引导理由 /
 *      offer_request_review 显示请求预览 / end 收尾）
 *   -> 理由确认后 requests.createRequest；weak_reason 时分身追问补充，
 *      blocked / rate_limited / declined_cooldown 给温和提示；
 *      moderation_blocked 退回理由编辑（草稿保留），moderation_unavailable 可重试。
 *
 * 只有没有 ownerId 的显式演示入口才使用 fixture。真实分享链接发生网络或
 * 云函数故障时必须显示可重试错误，绝不能把另一位 fixture 主人冒充成目标主人。
 *
 * 产品规则：分身必须声明自己是 AI；全程绝不显示联系方式；
 * 检索不到证据就承认不确定，不编造。
 */
const fixtures = require('../../data/vibe-fixtures.js');
const cloud = require('../../utils/cloud.js');
const nowHelper = require('../../utils/now.js');
const subscribe = require('../../utils/subscribe.js');
const track = require('../../utils/track.js');

const fixtureCard = fixtures.fixtureOwnerCard;

// ---------- fixture 演示内容（云不可用时使用） ----------

// 「他最近在忙什么？」的回答规则与云端一致（AI_BEHAVIOR §13）：
// 优先引用已发布且未过期的最近动态，其次公开的当下重心记忆；
// 两者都没有就明确说没有最近公开动态，绝不编造。
// fixture 世界以 FIXTURE_NOW 为时间锚点，保证演示确定性。
function fixtureRecentAnswer() {
  const active = nowHelper.activeNowItems(fixtures.fixtureNowItems, fixtures.FIXTURE_NOW, 1);
  if (active.length > 0) return active[0].text;
  if (fixtureCard.currentFocus) return fixtureCard.currentFocus;
  return '他最近还没有公开的动态，我不想替他编。你可以换个问题，或者直接告诉我你为什么想认识他。';
}

// 预设问题与回答：只引用 fixture 中的公开信息
const FIXTURE_PRESET_QUESTIONS = [
  { id: 'q-focus', text: '他最近在忙什么？', answer: fixtureRecentAnswer() },
  {
    id: 'q-meet',
    text: '他想认识什么样的人？',
    answer: '他最近更想认识：' + fixtureCard.wantsToMeet.join('、') + '。',
  },
  {
    id: 'q-help',
    text: '他能帮上什么忙？',
    answer: '这些话题找他聊准没错：' + fixtureCard.canHelpWith.join('、') + '。',
  },
];

// demo 模式自由输入的兜底回复：检索不到就承认不确定，不编造
const FIXTURE_FALLBACK_REPLY =
  '这个我还不能确定答案。关于他的事，我只说我已经知道的，不会编。你可以换个问题，或者直接告诉我你为什么想认识他。';

const GUIDE_TEXT = '聊了这些，我更好奇了：你为什么偏偏想在现在认识他？';

// createRequest 返回 weak_reason 时，分身的追问
const WEAK_REASON_FOLLOW_UP = '我大概懂了，但还差一个具体的理由。你为什么偏偏想在现在认识他？';

// 云不可用 / 模型失败时的兜底回复：不确定但不编造，同时把话头引向理由
const CLOUD_FALLBACK_REPLY =
  '我现在有点连不上，刚才的话不会丢。你可以稍后再试，或者直接告诉我你为什么想认识他。';

const DEFAULT_REASON_HINT = '一个具体的理由，比「认识一下」更有分量。';

let messageSeq = 0;
function nextMessageId(prefix) {
  messageSeq += 1;
  return prefix + '-' + messageSeq;
}

Page({
  data: {
    ownerName: '这位主人',
    stage: 'loading', // loading | chat | reason | preview | done | unavailable
    messages: [],
    chips: [],
    answeredCount: 0,
    guided: false,
    ended: false,
    inputValue: '',
    reasonValue: '',
    reasonHint: DEFAULT_REASON_HINT,
    preview: null,
    latestSharedContext: [], // 分身最近发现的共同点（请求预览的「可能的共同点」来自它）
    scrollIntoId: '',
    unavailableTitle: '', // stage 'unavailable' 终态标题/描述（名片收回/找不到/分身休息）
    unavailableDesc: '',
    unavailableRetry: false,
    doneTitle: '已送达',
    doneDesc: '你的理由已经交给他的 Vibe，是否认识由他决定。',
    doneSub: '如果他有兴趣，他会选一种联系方式给你。',
  },

  onLoad(options) {
    track.event('page_view', { page: 'visitor_chat', has_owner: !!((options && options.ownerId)) });
    this.demoMode = false;
    this.sending = false;
    this.ownerId = (options && options.ownerId) || '';
    this.conversationId = '';
    const storedDemo = wx.getStorageSync && wx.getStorageSync('vibecard_demo_mode');
    const explicitDemo = (options && options.demo === '1') || storedDemo === true || storedDemo === '1';
    if (explicitDemo) {
      this.initDemoMode();
    } else if (this.ownerId) {
      this.initCloudMode();
    } else {
      this.setUnavailable('这张分享链接不完整', '请让主人重新分享一次。');
    }
  },

  // ---------- 初始化 ----------

  async initCloudMode() {
    try {
      const res = await cloud.callFunction('card', { action: 'getPublicCard', ownerId: this.ownerId });
      if (!res || res.ok !== true) {
        const code = res && res.error && res.error.code;
        if (code === 'card_deleted' || code === 'not_found') {
          // 名片已删除/不存在：终态，不回退演示（给已删除名片展示假数据是错误的）
          this.demoMode = false;
          this.setUnavailable(
            code === 'card_deleted' ? '这张名片已被主人收回' : '这张名片找不到了',
            '可以请对方重新分享一次'
          );
          return;
        }
        if (code === 'unauthorized') {
          wx.showToast({ title: '请先登录后再试', icon: 'none' });
        }
        throw new Error((res && res.error && res.error.message) || 'getPublicCard failed');
      }
      const card = (res.result && res.result.card) || {};
      this.demoMode = false;
      if (card.agentEnabled === false) {
        // 分身休息中：终态，无输入框（agentEnabled 字段缺失视为 true，向后兼容）
        this.setUnavailable('他的分身暂时在休息，改天再来吧。', '');
        return;
      }
      // 预设问题只在有对应公开信息时出现；回答由 agent.visitorMessage 生成
      const chips = [];
      if (card.currentFocus) chips.push({ id: 'q-focus', text: '他最近在忙什么？', used: false });
      if (card.wantsToMeet && card.wantsToMeet.length > 0) chips.push({ id: 'q-meet', text: '他想认识什么样的人？', used: false });
      if (card.canHelpWith && card.canHelpWith.length > 0) chips.push({ id: 'q-help', text: '他能帮上什么忙？', used: false });
      const opening = {
        id: nextMessageId('agent'),
        role: 'agent',
        text: '我是' + (card.name || '这位主人') + '的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。',
      };
      this.setData({
        stage: 'chat',
        ownerName: card.name || '他',
        messages: [opening],
        chips,
        scrollIntoId: opening.id,
      });
    } catch (err) {
      console.warn('[visitor-chat] public card unavailable:', err && err.message);
      this.demoMode = false;
      this.setUnavailable('暂时连不上这张名片', '网络恢复后再试一次；我不会用演示数据替代真实主人。', true);
    }
  },

  // 终态：名片不可用/分身休息。不渲染输入框、不追加任何对话
  setUnavailable(title, desc, retry) {
    this.setData({ stage: 'unavailable', unavailableTitle: title, unavailableDesc: desc, unavailableRetry: !!retry });
  },

  onRetryInit() {
    if (!this.ownerId || this.sending) return;
    this.setData({ stage: 'loading', messages: [], chips: [], unavailableRetry: false });
    this.initCloudMode();
  },

  initDemoMode() {
    this.demoMode = true;
    const opening = {
      id: nextMessageId('agent'),
      role: 'agent',
      text: '我是' + fixtureCard.name + '的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。',
    };
    this.setData({
      stage: 'chat',
      ownerName: fixtureCard.name,
      messages: [opening],
      chips: FIXTURE_PRESET_QUESTIONS.map((q) => ({ id: q.id, text: q.text, used: false })),
      scrollIntoId: opening.id,
    });
  },

  appendMessages(list) {
    const messages = this.data.messages.concat(list);
    this.setData({ messages, scrollIntoId: list[list.length - 1].id });
  },

  // demo 模式：每轮问答后检查是否该引导访客说出理由
  maybeGuideDemo() {
    const count = this.data.answeredCount + 1;
    const update = { answeredCount: count };
    if (count >= 2 && !this.data.guided) update.guided = true;
    this.setData(update);
    if (update.guided) {
      setTimeout(() => {
        // demo 的共同点发现时刻：引导消息带上 fixture 中真实的共同点
        const sharedContext = fixtures.fixtureConnectionRequest.possibleSharedContext.slice(0, 3);
        const guideMsg = { id: nextMessageId('agent'), role: 'agent', text: GUIDE_TEXT };
        if (sharedContext.length > 0) {
          guideMsg.sharedContext = sharedContext;
          this.setData({ latestSharedContext: sharedContext });
        }
        this.appendMessages([guideMsg]);
      }, 350);
    }
  },

  // ---------- 提问 ----------

  onAskPreset(e) {
    if (this.data.stage !== 'chat' || this.sending) return;
    const id = e.currentTarget.dataset.id;
    const chips = this.data.chips.map((c) =>
      c.id === id ? Object.assign({}, c, { used: true }) : c
    );
    this.setData({ chips });

    if (this.demoMode) {
      const question = FIXTURE_PRESET_QUESTIONS.find((q) => q.id === id);
      if (!question) return;
      this.appendMessages([
        { id: nextMessageId('visitor'), role: 'visitor', text: question.text },
        { id: nextMessageId('agent'), role: 'agent', text: question.answer },
      ]);
      this.maybeGuideDemo();
      return;
    }

    // 云模式：预设问题也交给分身回答（证据检索在云端，不泄露私有记忆）
    const chip = this.data.chips.find((c) => c.id === id);
    if (chip) this.sendVisitorMessage(chip.text);
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onSend() {
    if (this.data.stage !== 'chat' || this.sending) return;
    const text = (this.data.inputValue || '').trim();
    if (!text) return;
    this.setData({ inputValue: '' });

    if (this.demoMode) {
      this.appendMessages([
        { id: nextMessageId('visitor'), role: 'visitor', text },
        { id: nextMessageId('agent'), role: 'agent', text: FIXTURE_FALLBACK_REPLY },
      ]);
      this.maybeGuideDemo();
      return;
    }
    this.sendVisitorMessage(text);
  },

  // ---------- 云模式对话 ----------

  async sendVisitorMessage(text) {
    this.appendMessages([{ id: nextMessageId('visitor'), role: 'visitor', text }]);
    this.sending = true;
    try {
      const res = await cloud.callFunction('agent', {
        action: 'visitorMessage',
        ownerId: this.ownerId,
        message: text,
        ...(this.conversationId ? { conversationId: this.conversationId } : {}),
      });
      if (!res || res.ok !== true) {
        const code = res && res.error && res.error.code;
        if (code === 'unauthorized') {
          wx.showToast({ title: '请先登录后再试', icon: 'none' });
          return;
        }
        if (code === 'blocked') {
          // 主人已拉黑：温和收尾，不指责访客
          this.appendMessages([{
            id: nextMessageId('agent'),
            role: 'agent',
            text: '他暂时不方便接收新消息，这次就先聊到这里。谢谢你的认真。',
          }]);
          this.setData({ ended: true });
          return;
        }
        if (code === 'rate_limited') {
          // 消息量/新对话超限：直接转达云端的温和提示，明天才能继续
          this.appendMessages([{
            id: nextMessageId('agent'),
            role: 'agent',
            text: (res.error && res.error.message) || '今天聊得够多了，明天再来吧',
          }]);
          this.setData({ ended: true });
          return;
        }
        if (code === 'round_limit') {
          this.appendMessages([{
            id: nextMessageId('agent'),
            role: 'agent',
            text: (res.error && res.error.message) || '这次先聊到这里，你可以把具体理由告诉我。',
          }]);
          this.setData({ ended: true, guided: true });
          return;
        }
        if (code === 'moderation_blocked') {
          this.appendMessages([{
            id: nextMessageId('agent'), role: 'agent',
            text: '这句话可能不方便继续处理，换一种说法试试？',
          }]);
          return;
        }
        if (code === 'moderation_unavailable') {
          this.appendMessages([{
            id: nextMessageId('agent'), role: 'agent',
            text: '内容检查暂时不可用，请稍后重试这句话。',
          }]);
          return;
        }
        // 模型不可用：不编造回答，给出不确定回复并引导到理由
        this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: CLOUD_FALLBACK_REPLY }]);
        this.setData({ guided: true });
        return;
      }
      const result = res.result || {};
      if (typeof result.conversationId === 'string' && result.conversationId) this.conversationId = result.conversationId;
      if (typeof result.evidenceId === 'string' && result.evidenceId) this.evidenceId = result.evidenceId;
      const replyMsg = { id: nextMessageId('agent'), role: 'agent', text: result.reply || CLOUD_FALLBACK_REPLY };
      // 共同点发现时刻：分身发现了访客与主人的真实交集（最多 3 条）
      const sharedContext = Array.isArray(result.sharedContext)
        ? result.sharedContext.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
        : [];
      if (sharedContext.length > 0) {
        replyMsg.sharedContext = sharedContext;
        this.setData({ latestSharedContext: sharedContext });
      }
      this.appendMessages([replyMsg]);
      this.handleNextAction(result.nextAction);
    } catch (err) {
      console.warn('[visitor-chat] visitorMessage failed:', err && err.message);
      this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: CLOUD_FALLBACK_REPLY }]);
      this.setData({ guided: true });
    } finally {
      this.sending = false;
    }
  },

  handleNextAction(nextAction) {
    if (nextAction === 'invite_connection_reason') {
      this.setData({ guided: true });
    } else if (nextAction === 'offer_request_review') {
      // 分身判断理由已经足够：若访客已写过理由直接进预览，否则先引导填写
      if ((this.data.reasonValue || '').trim()) {
        this.buildPreview();
      } else {
        this.setData({ guided: true });
      }
    } else if (nextAction === 'end') {
      this.setData({ ended: true });
    }
  },

  // ---------- 说出理由 ----------

  onStartReason() {
    this.setData({ stage: 'reason', reasonHint: DEFAULT_REASON_HINT });
  },

  onReasonInput(e) {
    this.setData({ reasonValue: e.detail.value });
  },

  onMakePreview() {
    const reason = (this.data.reasonValue || '').trim();
    if (!reason) {
      wx.showToast({ title: '先写一句你的理由', icon: 'none' });
      return;
    }
    this.buildPreview();
  },

  buildPreview() {
    const reason = (this.data.reasonValue || '').trim();
    if (this.demoMode) {
      this.setData({
        stage: 'preview',
        preview: {
          // 演示中访客昵称固定为 fixture 的苏晴
          visitorName: fixtures.fixtureVisitor.name,
          reason,
          possibleSharedContext: fixtures.fixtureConnectionRequest.possibleSharedContext,
        },
      });
      return;
    }
    // 云模式：请求不携带访客昵称；「可能的共同点」来自对话中分身发现的真实交集
    this.setData({
      stage: 'preview',
      preview: {
        visitorName: '一位访客',
        reason,
        possibleSharedContext: this.data.latestSharedContext || [],
      },
    });
  },

  onEditReason() {
    this.setData({ stage: 'reason' });
  },

  // ---------- 提交请求 ----------

  async onSubmitRequest() {
    if (this.demoMode) {
      this.setData({ stage: 'done' });
      return;
    }
    if (this.sending) return;
    this.sending = true;

    // 订阅消息（v2 获客 + 留存，2026-08-16）：在用户点击「提交」的同一交互里
    // 请求「对方有新请求」的订阅授权，授权失败/拒绝绝不阻塞提交。
    // 必须在 await 之前的同步阶段触发 wx.requestSubscribeMessage。
    let subscribePromise = null;
    try {
      subscribePromise = subscribe.requestSubscribe('OWNER_NEW_REQUEST');
    } catch (e) {
      console.warn('[visitor-chat] subscribe pre-call failed:', e && e.message);
    }

    try {
      const res = await cloud.callFunction('requests', {
        action: 'createRequest',
        ownerId: this.ownerId,
        visitorSummary: '一位通过 AI 分身对话而来的访客',
        reason: this.data.preview.reason,
        possibleSharedContext: Array.isArray(this.data.preview.possibleSharedContext)
          ? this.data.preview.possibleSharedContext.slice(0, 3)
          : [],
        ...(this.evidenceId ? { evidenceId: this.evidenceId } : {}),
        ...(this.conversationId ? { conversationId: this.conversationId } : {}),
      }, { idempotent: false });
      if (res && res.ok === true) {
        // 等订阅结果回来（即使失败也无妨），再显示完成态
        if (subscribePromise) {
          try { await subscribePromise; } catch (e) {}
        }
        track.event('request_submitted', { owner_id: this.ownerId });
        this.setDone('已送达', '你的理由已经交给他的 Vibe，是否认识由他决定。', '如果他有兴趣，他会选一种联系方式给你。');
        return;
      }
      const code = res && res.error && res.error.code;
      if (code === 'unauthorized') {
        // 未登录：停在预览页，草稿不丢
        wx.showToast({ title: '请先登录后再试', icon: 'none' });
      } else if (code === 'weak_reason') {
        // 理由不够具体：分身追问，让访客补充后再来
        this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: WEAK_REASON_FOLLOW_UP }]);
        this.setData({ stage: 'reason', reasonHint: WEAK_REASON_FOLLOW_UP });
      } else if (code === 'rate_limited') {
        this.setDone('今天已经留过言了', '你今天的理由已经在他那里了，静候他的决定就好。', '');
      } else if (code === 'blocked') {
        this.setDone('暂时送不到', '他暂时不方便接收新的认识请求。谢谢你的认真。', '');
      } else if (code === 'declined_cooldown') {
        this.setDone('先等一等', '他最近刚作出过决定，过一天再来试试吧。', '');
      } else if (code === 'moderation_blocked') {
        // 内容安全判断不通过：退回理由编辑，已写内容保留在 reasonValue 中
        this.setData({
          stage: 'reason',
          reasonHint: '这句话可能不方便转达，换一种说法试试？你写的内容还在。',
        });
      } else if (code === 'moderation_unavailable') {
        // 审核服务暂时不可用：停在预览页，草稿不丢，可稍后重试
        wx.showToast({ title: '内容检查暂时不可用，请稍后重试', icon: 'none' });
      } else {
        wx.showToast({ title: '提交失败，稍后再试', icon: 'none' });
      }
    } catch (err) {
      console.warn('[visitor-chat] createRequest failed:', err && err.message);
      wx.showToast({ title: '提交失败，稍后再试', icon: 'none' });
    } finally {
      this.sending = false;
    }
  },

  setDone(title, desc, sub) {
    this.setData({ stage: 'done', doneTitle: title, doneDesc: desc, doneSub: sub });
  },

  // 分享给朋友（v2 获客）：访客把这个名片入口分享给更多可能认识主人的人
  onShareAppMessage() {
    const ownerId = this.ownerId || '';
    const path = ownerId
      ? '/pages/visitor-chat/visitor-chat?ownerId=' + encodeURIComponent(ownerId)
      : '/pages/visitor-chat/visitor-chat';
    return {
      title: '我先和他的 AI 分身聊了聊，挺有意思 · VibeCard',
      path,
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const ownerId = this.ownerId || '';
    const query = ownerId ? 'ownerId=' + encodeURIComponent(ownerId) : '';
    return {
      title: '我先和他的 AI 分身聊了聊，挺有意思 · VibeCard',
      query,
    };
  },
});
