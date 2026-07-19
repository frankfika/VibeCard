/**
 * 我的 Vibe（任务 0.4 mock）
 *
 * 主人与私有 Vibe 的对话页。当前完全使用本地 fixture 数据，
 * 不调用任何真实模型或云函数。演示路径：
 *   聊天 -> Vibe 提议记忆 -> 记住 / 改一下 / 别记这个 -> 已记住列表更新。
 *
 * 产品规则：Vibe 可以提议记忆，但只有主人确认后才会真正记住。
 */
const fixtures = require('../../data/vibe-fixtures.js');

const VISIBILITY_LABELS = {
  public: '已公开',
  agent_only: '仅分身可见',
  private: '仅自己可见',
};

let messageSeq = 0;
function nextMessageId(prefix) {
  messageSeq += 1;
  return prefix + '-' + messageSeq;
}

Page({
  data: {
    memories: [],      // 顶部「已记住」列表（仅含主人确认过的记忆）
    messages: [],      // 对话消息 { id, role: 'owner' | 'vibe', text }
    proposal: null,    // 记忆提议卡片 { id, text, state, editText }
    inputValue: '',
    scrollIntoId: '',
  },

  onLoad() {
    const memories = fixtures.fixtureOwnerMemories
      .filter((m) => m.status === 'confirmed')
      .map((m) => ({
        id: m.id,
        content: m.content,
        visibilityLabel: VISIBILITY_LABELS[m.visibility] || m.visibility,
      }));

    this.setData({
      memories,
      messages: [
        { id: 'fixture-msg-owner-1', role: 'owner', text: '我最近想认识真正做过 AI 社交产品的人。' },
        {
          id: 'fixture-msg-vibe-1',
          role: 'vibe',
          text: '我听到了。比起「认识更多人」，你更在意对方是不是真的做过，并且和你一样在意边界。',
        },
      ],
      proposal: {
        id: 'fixture-proposal-1',
        text: '你最近更想认识真正做过 AI 社交产品的人。',
        state: 'pending', // pending | editing | confirmed
        editText: '',
      },
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  // ---------- 记忆提议 ----------

  onRememberProposal() {
    const p = this.data.proposal;
    if (!p || p.state !== 'pending') return;
    this.confirmMemory(p.text);
    this.setData({ 'proposal.state': 'confirmed' });
  },

  onEditProposal() {
    const p = this.data.proposal;
    if (!p || p.state !== 'pending') return;
    this.setData({ 'proposal.state': 'editing', 'proposal.editText': p.text });
  },

  onProposalEditInput(e) {
    this.setData({ 'proposal.editText': e.detail.value });
  },

  onSaveEditedProposal() {
    const text = (this.data.proposal.editText || '').trim();
    if (!text) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    this.confirmMemory(text);
    this.setData({ 'proposal.state': 'confirmed', 'proposal.text': text });
  },

  onCancelEditProposal() {
    this.setData({ 'proposal.state': 'pending', 'proposal.editText': '' });
  },

  onDismissProposal() {
    if (!this.data.proposal) return;
    const reply = {
      id: nextMessageId('vibe'),
      role: 'vibe',
      text: '好的，这条我不会记住。',
    };
    this.setData({
      proposal: null,
      messages: this.data.messages.concat(reply),
      scrollIntoId: reply.id,
    });
  },

  // 提议被确认后进入「已记住」列表；新确认的记忆默认仅自己可见，
  // 是否发布到公开 Card 是之后独立的一步。
  confirmMemory(text) {
    const memory = {
      id: 'fixture-memory-confirmed-' + Date.now(),
      content: text,
      visibilityLabel: VISIBILITY_LABELS.private,
    };
    this.setData({ memories: this.data.memories.concat(memory) });
    wx.showToast({ title: '已记住', icon: 'none' });
  },

  // ---------- 对话输入 ----------

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onSend() {
    const text = (this.data.inputValue || '').trim();
    if (!text) return;
    const ownerMsg = { id: nextMessageId('owner'), role: 'owner', text: text };
    this.setData({
      messages: this.data.messages.concat(ownerMsg),
      inputValue: '',
      scrollIntoId: ownerMsg.id,
    });
    // mock 回复：固定的温暖回复，不调用真实模型
    setTimeout(() => {
      const reply = {
        id: nextMessageId('vibe'),
        role: 'vibe',
        text: '谢谢你告诉我这些。你说过的我都先放在心里，但只有你确认过的，我才会真正记住。',
      };
      this.setData({
        messages: this.data.messages.concat(reply),
        scrollIntoId: reply.id,
      });
    }, 400);
  },
});
