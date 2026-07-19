/**
 * 访客分身对话（任务 0.4 mock）
 *
 * 访客在公开 Card 上点击「先和我的分身聊聊」进入本页。
 * 分身是主人的 AI 分身：开场白必须表明 AI 身份；
 * 回答只使用 fixture 中的公开信息（card 公开字段 + public 记忆），
 * 绝不泄露 agent_only / private 记忆内容与联系方式。
 * 2-3 轮问答后引导访客说出具体的认识理由，生成请求预览并提交。
 *
 * 全部使用本地 fixture，不调用任何真实模型或云函数。
 */
const fixtures = require('../../data/vibe-fixtures.js');

const card = fixtures.fixtureOwnerCard;

// 预设问题与回答：只引用 fixture 中的公开信息
const PRESET_QUESTIONS = [
  {
    id: 'q-focus',
    text: '他最近在忙什么？',
    answer: card.currentFocus,
  },
  {
    id: 'q-meet',
    text: '他想认识什么样的人？',
    answer: '他最近更想认识：' + card.wantsToMeet.join('、') + '。',
  },
  {
    id: 'q-help',
    text: '他能帮上什么忙？',
    answer: '这些话题找他聊准没错：' + card.canHelpWith.join('、') + '。',
  },
];

// 自由输入时的兜底回复：检索不到就承认不确定，不编造
const FALLBACK_REPLY =
  '这个我还不能确定答案。关于他的事，我只说我已经知道的，不会编。你可以换个问题，或者直接告诉我你为什么想认识他。';

const GUIDE_TEXT = '聊了这些，我更好奇了：你为什么偏偏想在现在认识他？';

let messageSeq = 0;
function nextMessageId(prefix) {
  messageSeq += 1;
  return prefix + '-' + messageSeq;
}

Page({
  data: {
    ownerName: card.name,
    stage: 'chat', // chat | reason | preview | done
    messages: [],
    chips: [],
    answeredCount: 0,
    guided: false,
    inputValue: '',
    reasonValue: '',
    preview: null,
    scrollIntoId: '',
  },

  onLoad() {
    const opening = {
      id: nextMessageId('agent'),
      role: 'agent',
      text:
        '我是' +
        card.name +
        '的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。',
    };
    this.setData({
      messages: [opening],
      chips: PRESET_QUESTIONS.map((q) => ({ id: q.id, text: q.text, used: false })),
      scrollIntoId: opening.id,
    });
  },

  appendMessages(list) {
    const messages = this.data.messages.concat(list);
    this.setData({
      messages,
      scrollIntoId: list[list.length - 1].id,
    });
  },

  // 每轮问答后检查是否该引导访客说出理由
  maybeGuide() {
    const count = this.data.answeredCount + 1;
    const update = { answeredCount: count };
    if (count >= 2 && !this.data.guided) {
      update.guided = true;
    }
    this.setData(update);
    if (update.guided) {
      setTimeout(() => {
        this.appendMessages([{ id: nextMessageId('agent'), role: 'agent', text: GUIDE_TEXT }]);
      }, 350);
    }
  },

  // ---------- 预设问题 ----------

  onAskPreset(e) {
    if (this.data.stage !== 'chat') return;
    const id = e.currentTarget.dataset.id;
    const question = PRESET_QUESTIONS.find((q) => q.id === id);
    if (!question) return;
    const chips = this.data.chips.map((c) =>
      c.id === id ? Object.assign({}, c, { used: true }) : c
    );
    this.setData({ chips });
    this.appendMessages([
      { id: nextMessageId('visitor'), role: 'visitor', text: question.text },
      { id: nextMessageId('agent'), role: 'agent', text: question.answer },
    ]);
    this.maybeGuide();
  },

  // ---------- 自由输入 ----------

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onSend() {
    if (this.data.stage !== 'chat') return;
    const text = (this.data.inputValue || '').trim();
    if (!text) return;
    this.setData({ inputValue: '' });
    this.appendMessages([
      { id: nextMessageId('visitor'), role: 'visitor', text: text },
      { id: nextMessageId('agent'), role: 'agent', text: FALLBACK_REPLY },
    ]);
    this.maybeGuide();
  },

  // ---------- 说出理由 ----------

  onStartReason() {
    this.setData({ stage: 'reason' });
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
    this.setData({
      stage: 'preview',
      preview: {
        // 演示中访客昵称固定为 fixture 的苏晴
        visitorName: fixtures.fixtureVisitor.name,
        reason: reason,
        possibleSharedContext: fixtures.fixtureConnectionRequest.possibleSharedContext,
      },
    });
  },

  onEditReason() {
    this.setData({ stage: 'reason' });
  },

  onSubmitRequest() {
    this.setData({ stage: 'done' });
  },
});
