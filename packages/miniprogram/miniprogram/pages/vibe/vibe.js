/**
 * 我的 Vibe（任务 0.4 mock + 任务 1.3 真实链路）
 *
 * 主人与私有 Vibe 的对话页。优先走真实云链路：
 *   发送 -> agent.ownerMessage（结构化校验后的回复+最多一条记忆提议）
 *   -> memory.appendMessage 持久化 -> 提议卡片（记住/改一下/别记这个）
 *   -> memory.confirmMemory / deleteMemory -> 「已记住」列表来自 listMemories。
 *
 * 云环境未部署或调用失败时自动回退到本地 fixture 演示模式，保证比赛演示
 * 不中断；聊天主流程在记忆提取失败时依然可用（AI_BEHAVIOR.md 失败行为）。
 *
 * 产品规则：Vibe 可以提议记忆，但只有主人确认后才会真正记住。
 */
const fixtures = require('../../data/vibe-fixtures.js');
const cloud = require('../../utils/cloud.js');
const store = require('../../utils/store.js');
const nowHelper = require('../../utils/now.js');

const NOW_TOPICS = nowHelper.NOW_ITEM_TOPICS.map((topic) => ({
  value: topic,
  label: nowHelper.NOW_TOPIC_LABELS[topic],
}));

const VISIBILITY_LABELS = {
  public: '已公开',
  agent_only: '仅分身可见',
  connected: '认识后可见',
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
    proposal: null,    // 记忆提议卡片 { id, memoryId, text, state, editText }
    inputValue: '',
    scrollIntoId: '',
    cardDraft: null,   // Card 草稿预览 { rows: [{ key, label, oldText, newText }], raw }
    cardDraftLoading: false,
    nowItems: [],        // 「最近动态」主人列表（不含已删除；含状态标签）
    nowTopics: NOW_TOPICS,
    nowComposer: '',     // 主人手写新动态的输入
    nowComposerTopic: 'current_work',
    nowEditingId: '',    // 正在编辑的动态 id
    nowEditText: '',
    nowProposal: null,   // Vibe 提议的 Now 草稿 { id, nowId, text, topic, state, editText }
  },

  onLoad() {
    this.demoMode = false;
    this.conversationId = '';
    this.sending = false;
    this.loadMemories();
    this.loadNowItems();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  // ---------- 记忆列表（listMemories，仅已确认） ----------

  async loadMemories() {
    try {
      const res = await cloud.callFunction('memory', {
        action: 'listMemories',
        status: 'confirmed',
      });
      const memories = (res.memories || []).map((m) => ({
        id: m._id,
        content: m.content,
        visibilityLabel: VISIBILITY_LABELS[m.visibility] || m.visibility,
      }));
      this.setData({ memories });
    } catch (err) {
      // 云未部署/未登录：回退到 fixture 演示模式（任务 0.4 的演示路径保持可用）
      console.warn('[vibe] cloud unavailable, fallback to fixture demo:', err && err.message);
      this.demoMode = true;
      const memories = fixtures.fixtureOwnerMemories
        .filter((m) => m.status === 'confirmed')
        .map((m) => ({
          id: m.id,
          content: m.content,
          visibilityLabel: VISIBILITY_LABELS[m.visibility] || m.visibility,
        }));
      // demo 的记忆回调时刻：fixture 回复自然引用真实存在的 fixture 记忆
      const focusMemory = fixtures.fixtureOwnerMemories.find((m) => m.id === 'fixture-memory-public-focus');
      const fixtureVibeMsg = {
        id: 'fixture-msg-vibe-1',
        role: 'vibe',
        text: '我听到了。比起「认识更多人」，你更在意对方是不是真的做过——这和你最近在打磨的访客对话是同一件事：先理解，再认识。',
      };
      if (focusMemory) {
        fixtureVibeMsg.memoryRefs = [{
          id: focusMemory.id,
          content: focusMemory.content,
          short: focusMemory.content.length > 40 ? focusMemory.content.slice(0, 40) + '…' : focusMemory.content,
        }];
      }
      this.setData({
        memories,
        messages: [
          { id: 'fixture-msg-owner-1', role: 'owner', text: '我最近想认识真正做过 AI 社交产品的人。' },
          fixtureVibeMsg,
        ],
        proposal: {
          id: 'fixture-proposal-1',
          memoryId: '',
          text: '你最近更想认识真正做过 AI 社交产品的人。',
          state: 'pending',
          editText: '',
        },
      });
      this.loadFixtureNowItems();
    }
  },

  // ---------- 最近动态（任务 4.5） ----------
  //
  // Now 是主人确认发布的一小段最近公开动态，不是 Feed。Vibe 只能提议草稿，
  // 发布永远是主人的显式操作；归档/隐藏/删除的内容不会出现在名片上。

  // demo 模式的 Now 数据：以 fixture 时间锚点判断有效性，保证确定性
  loadFixtureNowItems() {
    this.demoNowItems = fixtures.fixtureNowItems.map((item) => ({ ...item }));
    this.setData({ nowItems: nowHelper.ownerNowList(this.demoNowItems) });
  },

  async loadNowItems() {
    if (this.demoMode) {
      this.loadFixtureNowItems();
      return;
    }
    try {
      const res = await cloud.callFunction('now', { action: 'listNowItems' });
      this.setData({ nowItems: nowHelper.ownerNowList(res.nowItems || []) });
    } catch (err) {
      // 云未部署：Now 面板回退到 fixture 演示（demo 标志由 loadMemories 设置；
      // 若它还没跑完，这里静默失败，不阻塞页面）
      console.warn('[vibe] listNowItems failed:', err && err.message);
      if (this.demoMode) this.loadFixtureNowItems();
    }
  },

  syncDemoNowList() {
    this.setData({ nowItems: nowHelper.ownerNowList(this.demoNowItems || []) });
  },

  onNowComposerInput(e) {
    this.setData({ nowComposer: e.detail.value });
  },

  onNowComposerTopic(e) {
    this.setData({ nowComposerTopic: e.currentTarget.dataset.topic });
  },

  // 主人手写一条动态：同样先存为草稿，再显式发布
  async onCreateNowDraft() {
    const text = (this.data.nowComposer || '').trim();
    if (!text) {
      wx.showToast({ title: '先写一句最近动态', icon: 'none' });
      return;
    }
    if (text.length > 200) {
      wx.showToast({ title: '最多 200 字', icon: 'none' });
      return;
    }
    const topic = this.data.nowComposerTopic;
    if (this.demoMode) {
      const now = fixtures.FIXTURE_NOW;
      this.demoNowItems = (this.demoNowItems || []).concat({
        id: 'fixture-now-new-' + Date.now(),
        schemaVersion: 1,
        ownerId: fixtures.fixtureOwner.id,
        text,
        topic,
        sourceMemoryId: null,
        status: 'draft',
        publishedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      });
      this.syncDemoNowList();
      this.setData({ nowComposer: '' });
      wx.showToast({ title: '已存为草稿', icon: 'none' });
      return;
    }
    try {
      await cloud.callFunction('now', { action: 'createNowDraft', text, topic });
      this.setData({ nowComposer: '' });
      await this.loadNowItems();
      wx.showToast({ title: '已存为草稿', icon: 'none' });
    } catch (err) {
      console.warn('[vibe] createNowDraft failed:', err && err.message);
      wx.showToast({ title: '没存上，再试一次', icon: 'none' });
    }
  },

  // 列表行的就地编辑
  onNowEditStart(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.nowItems.find((n) => n.id === id);
    if (!item) return;
    this.setData({ nowEditingId: id, nowEditText: item.text });
  },

  onNowEditInput(e) {
    this.setData({ nowEditText: e.detail.value });
  },

  onNowEditCancel() {
    this.setData({ nowEditingId: '', nowEditText: '' });
  },

  async onNowEditSave() {
    const id = this.data.nowEditingId;
    const text = (this.data.nowEditText || '').trim();
    if (!id) return;
    if (!text) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    const ok = await this.applyNowAction('editNowItem', { nowId: id, text }, (item) => {
      item.text = text;
      item.updatedAt = (this.demoMode ? fixtures.FIXTURE_NOW : Date.now());
    });
    if (ok) this.setData({ nowEditingId: '', nowEditText: '' });
  },

  onPublishNow(e) {
    const id = e.currentTarget.dataset.id;
    this.applyNowAction('publishNowItem', { nowId: id }, (item) => {
      item.status = 'published';
      item.publishedAt = item.publishedAt || (this.demoMode ? fixtures.FIXTURE_NOW : Date.now());
      item.updatedAt = item.publishedAt;
    });
  },

  onArchiveNow(e) {
    const id = e.currentTarget.dataset.id;
    this.applyNowAction('archiveNowItem', { nowId: id }, (item) => {
      item.status = 'archived';
      item.updatedAt = this.demoMode ? fixtures.FIXTURE_NOW : Date.now();
    });
  },

  onHideNow(e) {
    const id = e.currentTarget.dataset.id;
    this.applyNowAction('hideNowItem', { nowId: id }, (item) => {
      item.status = 'hidden';
      item.updatedAt = this.demoMode ? fixtures.FIXTURE_NOW : Date.now();
    });
  },

  onDeleteNow(e) {
    const id = e.currentTarget.dataset.id;
    this.applyNowAction('deleteNowItem', { nowId: id }, (item) => {
      item.status = 'deleted';
      item.updatedAt = this.demoMode ? fixtures.FIXTURE_NOW : Date.now();
    });
  },

  // 统一的 Now 变更入口：云模式走 now 云函数（服务端按 openid 强制主人权限），
  // demo 模式只改本地 fixture 世界。返回是否成功。
  async applyNowAction(action, payload, demoMutate) {
    if (this.demoMode) {
      const item = (this.demoNowItems || []).find((n) => n.id === payload.nowId);
      if (!item) return false;
      demoMutate(item);
      this.syncDemoNowList();
      return true;
    }
    try {
      await cloud.callFunction('now', Object.assign({ action }, payload));
      await this.loadNowItems();
      return true;
    } catch (err) {
      console.warn('[vibe] ' + action + ' failed:', err && err.message);
      wx.showToast({ title: '操作失败，再试一次', icon: 'none' });
      return false;
    }
  },

  // ---------- Vibe 提议的 Now 草稿 ----------

  async onPublishNowProposal() {
    const p = this.data.nowProposal;
    if (!p || p.state !== 'pending' || !p.nowId) return;
    const ok = await this.applyNowAction('publishNowItem', { nowId: p.nowId }, (item) => {
      item.status = 'published';
      item.publishedAt = item.publishedAt || fixtures.FIXTURE_NOW;
      item.updatedAt = item.publishedAt;
    });
    if (ok) {
      this.setData({ 'nowProposal.state': 'published' });
      this.appendVibeMessage('已发布到你的最近动态：' + p.text);
    }
  },

  onEditNowProposal() {
    const p = this.data.nowProposal;
    if (!p || p.state !== 'pending') return;
    this.setData({ 'nowProposal.state': 'editing', 'nowProposal.editText': p.text });
  },

  onNowProposalEditInput(e) {
    this.setData({ 'nowProposal.editText': e.detail.value });
  },

  onCancelEditNowProposal() {
    this.setData({ 'nowProposal.state': 'pending', 'nowProposal.editText': '' });
  },

  // 改一下再发布：先保存修改，再显式发布（AI_BEHAVIOR §13：edit and publish）
  async onSaveEditedNowProposal() {
    const p = this.data.nowProposal;
    const text = (this.data.nowProposal.editText || '').trim();
    if (!p || !p.nowId) return;
    if (!text) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    const edited = await this.applyNowAction('editNowItem', { nowId: p.nowId, text }, (item) => {
      item.text = text;
      item.updatedAt = fixtures.FIXTURE_NOW;
    });
    if (!edited) return;
    const published = await this.applyNowAction('publishNowItem', { nowId: p.nowId }, (item) => {
      item.status = 'published';
      item.publishedAt = item.publishedAt || fixtures.FIXTURE_NOW;
      item.updatedAt = item.publishedAt;
    });
    if (published) {
      this.setData({ 'nowProposal.state': 'published', 'nowProposal.text': text });
      this.appendVibeMessage('已发布到你的最近动态：' + text);
    }
  },

  // 先不发：草稿保留在「最近动态」列表里，主人以后随时可以发布
  onDismissNowProposal() {
    this.setData({ nowProposal: null });
    wx.showToast({ title: '已存为草稿，想发的时候再发', icon: 'none' });
  },

  // ---------- 记忆提议 ----------

  async onRememberProposal() {
    const p = this.data.proposal;
    if (!p || p.state !== 'pending') return;
    const ok = await this.confirmMemoryOnServer(p.memoryId, { content: p.text });
    if (ok) this.setData({ 'proposal.state': 'confirmed' });
  },

  onEditProposal() {
    const p = this.data.proposal;
    if (!p || p.state !== 'pending') return;
    this.setData({ 'proposal.state': 'editing', 'proposal.editText': p.text });
  },

  onProposalEditInput(e) {
    this.setData({ 'proposal.editText': e.detail.value });
  },

  async onSaveEditedProposal() {
    const text = (this.data.proposal.editText || '').trim();
    if (!text) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    const ok = await this.confirmMemoryOnServer(this.data.proposal.memoryId, { content: text });
    if (ok) this.setData({ 'proposal.state': 'confirmed', 'proposal.text': text });
  },

  onCancelEditProposal() {
    this.setData({ 'proposal.state': 'pending', 'proposal.editText': '' });
  },

  async onDismissProposal() {
    const p = this.data.proposal;
    if (!p) return;
    // 被拒绝的提议软删除，之后不会进入任何检索（listMemories 只取 confirmed）
    if (!this.demoMode && p.memoryId) {
      try {
        await cloud.callFunction('memory', { action: 'deleteMemory', memoryId: p.memoryId });
      } catch (err) {
        console.warn('[vibe] deleteMemory failed:', err && err.message);
      }
    }
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

  // 确认记忆：confirmMemory（可带修改后的内容），成功后刷新「已记住」列表，
  // 并在对话里追加一条「我记住了：…」的确认消息（AI_BEHAVIOR §5 确认时刻）。
  // 失败时提示并可重试，提议卡片保持 pending。
  async confirmMemoryOnServer(memoryId, { content }) {
    if (this.demoMode || !memoryId) {
      const memory = {
        id: 'fixture-memory-confirmed-' + Date.now(),
        content,
        visibilityLabel: VISIBILITY_LABELS.private,
      };
      this.setData({ memories: this.data.memories.concat(memory) });
      this.appendVibeMessage('我记住了：' + content);
      return true;
    }
    try {
      await cloud.callFunction('memory', { action: 'confirmMemory', memoryId, content });
      await this.loadMemories();
      this.appendVibeMessage('我记住了：' + content);
      return true;
    } catch (err) {
      console.warn('[vibe] confirmMemory failed:', err && err.message);
      wx.showToast({ title: '没存上，再试一次', icon: 'none' });
      return false;
    }
  },

  // ---------- 对话输入 ----------

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  async onSend() {
    const text = (this.data.inputValue || '').trim();
    if (!text || this.sending) return;

    const ownerMsg = { id: nextMessageId('owner'), role: 'owner', text };
    this.setData({
      messages: this.data.messages.concat(ownerMsg),
      inputValue: '',
      scrollIntoId: ownerMsg.id,
    });

    if (this.demoMode) {
      // fixture 演示回复
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
        // demo 的 Now 提议时刻：主人说了一个具体的最近动态，Vibe 提议草稿，
        // 同样只有主人确认后才会发布（AI_BEHAVIOR §13）
        if (/最近在|刚完成|完成了/.test(text) && !this.data.nowProposal) {
          const draft = {
            id: 'fixture-now-proposed-' + Date.now(),
            schemaVersion: 1,
            ownerId: fixtures.fixtureOwner.id,
            text: text.length > 60 ? text.slice(0, 60) + '…' : text,
            topic: /刚完成|完成了/.test(text) ? 'completed_work' : 'current_work',
            sourceMemoryId: null,
            status: 'draft',
            publishedAt: null,
            expiresAt: null,
            createdAt: fixtures.FIXTURE_NOW,
            updatedAt: fixtures.FIXTURE_NOW,
          };
          this.demoNowItems = (this.demoNowItems || []).concat(draft);
          this.syncDemoNowList();
          this.setData({
            nowProposal: {
              id: nextMessageId('now-proposal'),
              nowId: draft.id,
              text: draft.text,
              topic: draft.topic,
              state: 'pending',
              editText: '',
            },
            scrollIntoId: 'now-proposal-card',
          });
        }
      }, 400);
      return;
    }

    this.sending = true;
    try {
      await this.persistMessage('owner', text);

      // agent.ownerMessage：结构化校验后的回复 + 最多一条记忆提议
      const history = this.data.messages.slice(-12).map((m) => ({
        role: m.role === 'owner' ? 'user' : 'assistant',
        content: m.text,
      }));
      const res = await cloud.callFunction('agent', { action: 'ownerMessage', messages: history });

      if (!res || res.ok !== true) {
        if (res && res.error && res.error.code === 'unauthorized') {
          // 未登录：提示并保持当前对话状态，不追加兜底消息
          wx.showToast({ title: '请先登录后再试', icon: 'none' });
          return;
        }
        // 模型不可用：聊天不中断，消息不丢（AI_BEHAVIOR.md 失败文案）
        this.appendVibeMessage('我现在有点连不上，刚才的话不会丢。可以稍后再试。');
        return;
      }

      const result = res.result;
      this.appendVibeMessage(result.reply, this.resolveMemoryRefs(result.referencedMemoryIds));
      await this.persistMessage('vibe', result.reply);

      // 记忆提议：先存 proposed（不可检索），主人确认后才生效
      if (result.memoryProposal && !this.data.proposal) {
        try {
          const created = await cloud.callFunction('memory', {
            action: 'createMemoryProposal',
            kind: result.memoryProposal.kind,
            content: result.memoryProposal.content,
            visibility: result.memoryProposal.suggestedVisibility || 'private',
            sourceConversationId: this.conversationId || '',
            sourceMessageIds: result.memoryProposal.sourceMessageIds || [],
          });
          const proposal = {
            id: nextMessageId('proposal'),
            memoryId: created.memory && created.memory._id,
            text: result.memoryProposal.content,
            state: 'pending',
            editText: '',
          };
          this.setData({ proposal, scrollIntoId: 'proposal-card' });
        } catch (err) {
          // 提取失败不影响聊天主流程
          console.warn('[vibe] createMemoryProposal failed:', err && err.message);
        }
      }

      // Now 提议（任务 4.5）：Vibe 只能创建草稿，发布永远是主人的显式操作
      if (result.nowProposal && !this.data.nowProposal) {
        try {
          const created = await cloud.callFunction('now', {
            action: 'createNowDraft',
            text: result.nowProposal.text,
            topic: result.nowProposal.topic,
            expiresAt: result.nowProposal.expiresAt !== undefined ? result.nowProposal.expiresAt : null,
          });
          const nowProposal = {
            id: nextMessageId('now-proposal'),
            nowId: created.nowItem && created.nowItem._id,
            text: result.nowProposal.text,
            topic: result.nowProposal.topic,
            state: 'pending',
            editText: '',
          };
          this.setData({ nowProposal, scrollIntoId: 'now-proposal-card' });
          await this.loadNowItems();
        } catch (err) {
          // 草稿创建失败不影响聊天主流程
          console.warn('[vibe] createNowDraft (proposal) failed:', err && err.message);
        }
      }
    } catch (err) {
      console.warn('[vibe] ownerMessage failed:', err && err.message);
      this.appendVibeMessage('我现在有点连不上，刚才的话不会丢。可以稍后再试。');
    } finally {
      this.sending = false;
    }
  },

  appendVibeMessage(text, memoryRefs) {
    const reply = { id: nextMessageId('vibe'), role: 'vibe', text };
    // 记忆回调时刻：这条回复引用了主人之前确认过的记忆
    if (Array.isArray(memoryRefs) && memoryRefs.length > 0) reply.memoryRefs = memoryRefs;
    this.setData({
      messages: this.data.messages.concat(reply),
      scrollIntoId: reply.id,
    });
  },

  // ownerMessage 返回的 referencedMemoryIds -> [{ id, content, short }]
  // content 从已加载的已确认记忆列表查出；查不到的 id 跳过，全查不到返回 undefined
  resolveMemoryRefs(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return undefined;
    const refs = ids
      .map((id) => this.data.memories.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({
        id: m.id,
        content: m.content,
        short: m.content.length > 40 ? m.content.slice(0, 40) + '…' : m.content,
      }));
    return refs.length > 0 ? refs : undefined;
  },

  async persistMessage(role, text) {
    try {
      const res = await cloud.callFunction('memory', {
        action: 'appendMessage',
        conversationId: this.conversationId || undefined,
        mode: 'owner',
        role,
        content: text,
      });
      if (res && res.conversationId) this.conversationId = res.conversationId;
    } catch (err) {
      // 持久化失败不阻塞聊天
      console.warn('[vibe] appendMessage failed:', err && err.message);
    }
  },

  // ---------- Card 草稿（任务 1.4） ----------

  // 只用已确认的记忆生成草稿；Vibe 只建议，主人决定是否采用。
  async onGenerateCardDraft() {
    if (this.data.cardDraftLoading) return;
    this.setData({ cardDraftLoading: true });
    try {
      let draft;
      if (this.demoMode) {
        const f = fixtures.fixtureOwnerCard;
        draft = {
          headline: f.headline,
          currentFocus: f.currentFocus,
          canHelpWith: f.canHelpWith,
          wantsToMeet: f.wantsToMeet,
          topics: f.topics,
          highlights: f.highlights,
        };
      } else {
        const profile = store.getProfile() || {};
        const res = await cloud.callFunction('agent', {
          action: 'generateCardDraft',
          currentCard: {
            bio: profile.bio || '',
            lookingFor: profile.lookingFor || '',
            tags: (profile.tags || []).map((t) => t.label),
            highlights: (profile.highlights || []).map((h) => ({ title: h.title, url: h.link })),
          },
        });
        if (!res || res.ok !== true) {
          const code = res && res.error && res.error.code;
          wx.showToast({
            title: code === 'no_confirmed_memories'
              ? '先确认几条记忆再生成'
              : code === 'unauthorized'
                ? '请先登录后再试'
                : '草稿生成失败，稍后再试',
            icon: 'none',
          });
          return;
        }
        draft = res.result.draft;
      }
      const rows = this.buildDraftRows(draft);
      if (rows.length === 0) {
        wx.showToast({ title: '草稿和现在的 Card 一样，没有新变化', icon: 'none' });
        return;
      }
      this.setData({ cardDraft: { rows, raw: draft }, scrollIntoId: 'card-draft-panel' });
    } catch (err) {
      console.warn('[vibe] generateCardDraft failed:', err && err.message);
      wx.showToast({ title: '草稿生成失败，稍后再试', icon: 'none' });
    } finally {
      this.setData({ cardDraftLoading: false });
    }
  },

  // 把草稿映射到现有 v1 profile 字段，并计算与当前 Card 的差异行。
  buildDraftRows(draft) {
    const profile = store.getProfile() || {};
    const current = {
      bio: profile.bio || '',
      lookingFor: profile.lookingFor || '',
      tags: (profile.tags || []).map((t) => t.label).join('、'),
      highlights: (profile.highlights || []).map((h) => h.title).join('、'),
    };
    const next = {
      bio: draft.currentFocus || draft.headline || '',
      lookingFor: (draft.wantsToMeet || []).join('、'),
      tags: (draft.topics || []).join('、'),
      highlights: (draft.highlights || []).map((h) => h.title).join('、'),
    };
    const labels = { bio: '此刻的我', lookingFor: '想遇见谁', tags: '话题标签', highlights: '代表内容' };
    const rows = [];
    for (const key of Object.keys(labels)) {
      // 草稿为空的部分不覆盖主人原文（不产生空版块）
      if (next[key] && next[key] !== current[key]) {
        rows.push({ key, label: labels[key], oldText: current[key] || '（空）', newText: next[key] });
      }
    }
    return rows;
  },

  onAcceptCardDraft() {
    const panel = this.data.cardDraft;
    if (!panel) return;
    const draft = panel.raw;
    const updates = {};
    if (panel.rows.some((r) => r.key === 'bio')) updates.bio = draft.currentFocus || draft.headline;
    if (panel.rows.some((r) => r.key === 'lookingFor')) updates.lookingFor = (draft.wantsToMeet || []).join('、');
    if (panel.rows.some((r) => r.key === 'tags')) updates.tags = (draft.topics || []).map((t) => ({ label: t, icon: '' }));
    if (panel.rows.some((r) => r.key === 'highlights')) {
      updates.highlights = (draft.highlights || []).map((h, i) => ({
        id: h.id || 'draft-' + i,
        title: h.title,
        icon: '✨',
        link: h.url || '',
      }));
    }
    store.setProfile(updates);
    this.setData({ cardDraft: null });
    wx.showToast({ title: '已更新你的 Card', icon: 'none' });
  },

  onRejectCardDraft() {
    // 放弃草稿：已发布的 Card 保持原样
    this.setData({ cardDraft: null });
  },
});
