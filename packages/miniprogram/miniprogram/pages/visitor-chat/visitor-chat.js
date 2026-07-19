/**
 * 访客分身对话（任务 0.4 mock + 任务 2.5 真实云链路）
 *
 * 云模式（页面参数带 ownerId，如分享链接场景）：
 *   card.getPublicCard 校验云可用并初始化分身开场 -> 消息走 agent.visitorMessage
 *   -> 按 nextAction 流转（invite_connection_reason 引导理由 /
 *      offer_request_review 显示请求预览 / end 收尾）
 *   -> 理由确认后 requests.createRequest；weak_reason 时分身追问补充，
 *      blocked / rate_limited / declined_cooldown 给温和提示；
 *      moderation_blocked 退回理由编辑（草稿保留），moderation_unavailable 可重试。
 *
 * 云不可用（无 ownerId / 调用失败）回退任务 0.4 的 fixture 演示流程。
 *
 * 产品规则：分身必须声明自己是 AI；全程绝不显示联系方式；
 * 检索不到证据就承认不确定，不编造。
 */
const fixtures = require('../../data/vibe-fixtures.js');
const cloud = require('../../utils/cloud.js');

const fixtureCard = fixtures.fixtureOwnerCard;

// ---------- fixture 演示内容（云不可用时使用） ----------

// 预设问题与回答：只引用 fixture 中的公开信息
const FIXTURE_PRESET_QUESTIONS = [
  { id: 'q-focus', text: '他最近在忙什么？', answer: fixtureCard.currentFocus },
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
    ownerName: fixtureCard.name,
    stage: 'chat', // chat | reason | preview | done
    messages: [],
    chips: [],
    answeredCount: 0,
    guided: false,
    ended: false,
    inputValue: '',
    reasonValue: '',
    reasonHint: DEFAULT_REASON_HINT,
    preview: null,
    scrollIntoId: '',
    doneTitle: '已送达',
    doneDesc: '你的理由已经交给他的 Vibe，是否认识由他决定。',
    doneSub: '如果他有兴趣，他会选一种联系方式给你。',
  },

  onLoad(options) {
    this.demoMode = true;
    this.sending = false;
    this.ownerId = (options && options.ownerId) || '';
    this.roundCount = 0;
    if (this.ownerId) {
      this.initCloudMode();
    } else {
      this.initDemoMode();
    }
  },

  // ---------- 初始化 ----------

  async initCloudMode() {
    try {
      const res = await cloud.callFunction('card', { action: 'getPublicCard', ownerId: this.ownerId });
      if (!res || res.ok !== true) {
        throw new Error((res && res.error && res.error.message) || 'getPublicCard failed');
      }
      const card = res.result || {};
      this.demoMode = false;
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
        ownerName: card.name || '他',
        messages: [opening],
        chips,
        scrollIntoId: opening.id,
      });
    } catch (err) {
      // 云未部署/调用失败：回退 fixture 演示模式
      console.warn('[visitor-chat] cloud unavailable, fallback to fixture demo:', err && err.message);
      this.initDemoMode();
    }
  },

  initDemoMode() {
    this.demoMode = true;
    const opening = {
      id: nextMessageId('agent'),
      role: 'agent',
      text: '我是' + fixtureCard.name + '的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。',
    };
    this.setData({
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
        this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: GUIDE_TEXT }]);
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
      const history = this.data.messages.slice(-12).map((m) => ({
        role: m.role === 'visitor' ? 'user' : 'assistant',
        content: m.text,
      }));
      const res = await cloud.callFunction('agent', {
        action: 'visitorMessage',
        ownerId: this.ownerId,
        messages: history,
        roundCount: this.roundCount,
      });
      if (!res || res.ok !== true) {
        // 模型不可用：不编造回答，给出不确定回复并引导到理由
        this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: CLOUD_FALLBACK_REPLY }]);
        this.setData({ guided: true });
        return;
      }
      this.roundCount += 1;
      const result = res.result || {};
      this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: result.reply || CLOUD_FALLBACK_REPLY }]);
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
    // 云模式：请求不携带访客昵称，共同点由主人侧的 Vibe 在 summarize 时补全
    this.setData({
      stage: 'preview',
      preview: { visitorName: '一位访客', reason, possibleSharedContext: [] },
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
    try {
      const res = await cloud.callFunction('requests', {
        action: 'createRequest',
        ownerId: this.ownerId,
        visitorSummary: '一位通过 AI 分身对话而来的访客',
        reason: this.data.preview.reason,
        possibleSharedContext: [],
      });
      if (res && res.ok === true) {
        this.setDone('已送达', '你的理由已经交给他的 Vibe，是否认识由他决定。', '如果他有兴趣，他会选一种联系方式给你。');
        return;
      }
      const code = res && res.error && res.error.code;
      if (code === 'weak_reason') {
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
});
