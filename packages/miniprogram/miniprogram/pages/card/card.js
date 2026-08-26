const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');
const cloud = require('../../utils/cloud.js');
const nowHelper = require('../../utils/now.js');
const track = require('../../utils/track.js');
const firstRun = require('../../utils/first-run.js');

// 最近动态（任务 4.5）：云端/分享负载里来的都是已投影的公开字段
// { id, text, topic, publishedAt }，这里只补展示标签，绝不补充内容
function toNowDisplayRows(items, limit) {
  return (items || [])
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .slice(0, limit || nowHelper.PUBLIC_NOW_LIMIT)
    .map((item) => ({
      id: item._id || item.id,
      text: item.text,
      topic: item.topic,
      topicLabel: nowHelper.NOW_TOPIC_LABELS[item.topic] || '',
      publishedAt: item.publishedAt || null,
    }));
}

function drawRoundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2);
  ctx.lineTo(x + radius, y + h);
  ctx.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + radius);
  ctx.arc(x + radius, y + radius, radius, Math.PI, -Math.PI / 2);
  ctx.closePath();
}

// 画布文字宽度保护：超长截断加省略号，避免与右侧元素重叠
function fitCanvasText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (!value) return '';
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

const AVATAR_STYLES = ['notionists', 'adventurer'];
const AVATAR_SEEDS = ['Alex', 'Luna', 'Max', 'Zoe', 'Kai', 'Nova'];
// 历史数据里标签和 lookingFor 带 emoji 前缀，展示时统一清掉
function stripEmojiPrefix(text) {
  return String(text || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
}
function cleanProfileDisplay(profile) {
  if (!profile) return profile;
  const cleaned = { ...profile };
  if (Array.isArray(cleaned.tags)) {
    cleaned.tags = cleaned.tags.map(t => ({ ...t, label: stripEmojiPrefix(t.label) }));
  }
  if (cleaned.lookingFor) cleaned.lookingFor = stripEmojiPrefix(cleaned.lookingFor);
  return cleaned;
}

function avatarUrlFor(style, seed) {
  return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&backgroundColor=transparent`;
}
const AVATAR_OPTIONS = [];
AVATAR_STYLES.forEach(style => AVATAR_SEEDS.forEach(seed => {
  AVATAR_OPTIONS.push({ key: `${style}-${seed}`, url: avatarUrlFor(style, seed) });
}));
const TAG_OPTIONS = [
  'Builder', 'Designer', 'Founder', 'Developer', 'Researcher',
  'Community', 'Product', 'AI', 'Web3', 'Creator',
  'Investor', 'Indie Hacker', 'Design', 'Shipping',
  'Strategy', 'Full Stack', 'Mobile', 'Remote',
  'Speaker', 'Coffee Chat'
];
const LOOKING_FOR_OPTIONS = [
  '找合伙人', '寻找机会', '寻求投资',
  '随便聊聊', '交流想法', '招募队友'
];
const EVENT_OPTIONS = ['ETHGlobal', 'Devcon', 'Token2049', 'Hackathon', 'Remote', 'Local'];

Page({
  data: {
    profile: null,
    isSetup: false,
    isEditing: false,
    showShare: false,
    isSharedView: false,
    showOnboarding: false,
    editName: '',
    editHandle: '',
    editBio: '',
    editTags: [],
    editLookingFor: '',
    editCanHelpWith: '',
    editEvent: '',
    editHighlights: [],
    editCustomTag: '',
    tagOptions: TAG_OPTIONS,
    lookingForOptions: LOOKING_FOR_OPTIONS,
    eventOptions: EVENT_OPTIONS,
    avatarOptions: AVATAR_OPTIONS,
    editAvatar: '',
    editAvatarSeed: '',
    avatarMode: 'generated',
    editWallet: '',
    editTwitter: '',
    editDiscord: '',
    editWechat: '',
    cardVisible: false,
    nowItems: [], // 最近动态（任务 4.5）：≤3 条已发布未过期；空则不渲染
    // 任务 1.5：首次使用是五问对话，而不是结构化资料表。
    firstRunStage: 'intro',
    firstRunName: '',
    firstRunQuestion: null,
    firstRunQuestionNumber: 0,
    firstRunAnswer: '',
    firstRunHistory: [],
    firstRunProposal: null,
    firstRunProposalText: '',
    firstRunProposalEditing: false,
    firstRunDraft: null,
    firstRunBusy: false,
    firstRunError: '',
    firstRunPermissionDenied: false,
  },

  onLoad(options) {
    track.event('page_view', { page: 'card', shared: !!options.shared });
    if (options.shared) {
      try {
        const sharedProfile = cleanProfileDisplay(JSON.parse(decodeURIComponent(options.shared)));
        this.setData({
          profile: sharedProfile,
          isSetup: true,
          isSharedView: true,
          cardVisible: true,
          // 分享负载里带着发布时的公开快照；访客与主人看到同一份
          nowItems: toNowDisplayRows(sharedProfile.nowItems),
        });
        this.hideSharedTabBar();
        return;
      } catch (e) {}
    }
    this.loadProfile();
  },

  onShow() {
    if (this.data.isSharedView) {
      // hideTabBar 可能早于 tabBar 挂载而生效失败，在多个生命周期幂等补刀
      this.hideSharedTabBar();
      return;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0, hidden: false });
    }
    this.loadProfile();
  },

  onReady() {
    if (this.data.isSharedView) {
      this.hideSharedTabBar();
      setTimeout(() => { if (this.data.isSharedView) this.hideSharedTabBar(); }, 500);
    }
  },

  // 访客分享视图需要彻底隐藏 tabBar：wx API 与自定义组件双保险
  hideSharedTabBar() {
    nav.hideTabBar();
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: true });
  },

  loadProfile() {
    let profile = cleanProfileDisplay(store.getProfile() || {});
    if (!profile.verified) profile = { ...profile, verified: { wallet: '', twitter: '', discord: '', wechat: '' } };
    if (!profile.highlights) profile = { ...profile, highlights: [] };
    if (!profile.avatar && profile.name) {
      profile = { ...profile, avatar: avatarUrlFor('notionists', profile.name) };
    }
    const isSetup = store.isProfileSetup();
    if (isSetup) {
      const threads = store.getThreads();
      if (threads && threads.length > 0) {
        profile = { ...profile, latestMoment: threads[0].content };
      }
    }
    this.setData({ profile, isSetup, avatarFailed: false });
    if (!isSetup) {
      this.startFirstRun();
    } else {
      // Trigger enter animation
      this.setData({ cardVisible: false });
      setTimeout(() => this.setData({ cardVisible: true }), 100);
      this.loadNowItems();
    }
  },

  // ---------- 三分钟首次对话（任务 1.5） ----------

  startFirstRun() {
    if (!this.firstRunState) this.firstRunState = firstRun.load(wx);
    const demoFlag = wx.getStorageSync && wx.getStorageSync('vibecard_demo_mode');
    this.firstRunDemoMode = demoFlag === true || demoFlag === '1';
    this.setData({ showOnboarding: true, cardVisible: false });
    this.syncFirstRunView();
    if (this.firstRunState.stage === 'draft-loading') this.prepareFirstRunDraft();
  },

  persistFirstRun() {
    firstRun.save(wx, this.firstRunState);
    this.syncFirstRunView();
  },

  syncFirstRunView() {
    const state = this.firstRunState || firstRun.emptyState();
    const question = firstRun.QUESTIONS[state.questionIndex] || null;
    const reviewId = state.reviewIds[state.reviewIndex];
    const decision = reviewId && state.memoryDecisions[reviewId];
    const proposal = reviewId
      ? firstRun.proposalFor(reviewId, decision && decision.content
        ? decision.content.replace((firstRun.questionById(reviewId) || {}).memoryPrefix || '', '')
        : state.answers[reviewId])
      : null;
    if (proposal && decision && decision.content) proposal.content = decision.content;
    const history = firstRun.QUESTIONS.slice(0, state.questionIndex).map((item) => ({
      id: item.id,
      prompt: item.prompt,
      answer: state.skipped[item.id] ? '已跳过' : state.answers[item.id],
      skipped: !!state.skipped[item.id],
    }));
    this.setData({
      firstRunStage: state.stage,
      firstRunName: state.name || '',
      firstRunQuestion: question,
      firstRunQuestionNumber: state.questionIndex + 1,
      firstRunAnswer: question ? (state.answers[question.id] || '') : '',
      firstRunHistory: history,
      firstRunProposal: proposal,
      firstRunProposalText: proposal ? proposal.content : '',
      firstRunProposalEditing: false,
      firstRunDraft: state.draft,
      firstRunError: state.stage === 'draft-error' ? (state.draftError || 'Vibe 暂时没起草成功。你的回答还在。') : '',
      firstRunPermissionDenied: state.stage === 'draft-error' && state.draftErrorCode === 'permission',
    });
  },

  onFirstRunNameInput(e) {
    this.firstRunState.name = e.detail.value;
    firstRun.save(wx, this.firstRunState);
    this.setData({ firstRunName: e.detail.value });
  },

  onStartFirstRun() {
    const name = String(this.data.firstRunName || '').trim();
    if (!name) {
      wx.showToast({ title: '先告诉我怎么称呼你', icon: 'none' });
      return;
    }
    this.firstRunState.name = name;
    this.firstRunState.stage = 'questions';
    this.persistFirstRun();
  },

  onFirstRunAnswerInput(e) {
    this.setData({ firstRunAnswer: e.detail.value });
  },

  onAnswerFirstRunQuestion() {
    const answer = String(this.data.firstRunAnswer || '').trim();
    const question = firstRun.QUESTIONS[this.firstRunState.questionIndex];
    if (!question || !answer) {
      wx.showToast({ title: '说一句，或者选择跳过', icon: 'none' });
      return;
    }
    this.firstRunState.answers[question.id] = answer;
    delete this.firstRunState.skipped[question.id];
    this.advanceFirstRunQuestion();
  },

  onSkipFirstRunQuestion() {
    const question = firstRun.QUESTIONS[this.firstRunState.questionIndex];
    if (!question) return;
    delete this.firstRunState.answers[question.id];
    this.firstRunState.skipped[question.id] = true;
    this.advanceFirstRunQuestion();
  },

  advanceFirstRunQuestion() {
    if (this.firstRunState.questionIndex < firstRun.QUESTIONS.length - 1) {
      this.firstRunState.questionIndex += 1;
      this.persistFirstRun();
      return;
    }
    this.firstRunState.reviewIds = firstRun.reviewIdsFor(this.firstRunState);
    this.firstRunState.reviewIndex = 0;
    this.firstRunState.stage = this.firstRunState.reviewIds.length ? 'memory-review' : 'draft';
    if (this.firstRunState.stage === 'draft') {
      // 全部跳过时没有可确认的记忆，只产生名字，不调用模型也不补字段。
      this.firstRunState.draft = firstRun.draftFromAnswers(this.firstRunState, true);
    }
    this.persistFirstRun();
  },

  onBackFirstRunQuestion() {
    if (this.firstRunState.questionIndex <= 0) return;
    this.firstRunState.questionIndex -= 1;
    this.persistFirstRun();
  },

  onEditFirstRunProposal() {
    this.setData({ firstRunProposalEditing: true });
  },

  onFirstRunProposalInput(e) {
    this.setData({ firstRunProposalText: e.detail.value });
  },

  onCancelFirstRunProposalEdit() {
    this.setData({
      firstRunProposalEditing: false,
      firstRunProposalText: this.data.firstRunProposal && this.data.firstRunProposal.content,
    });
  },

  async onConfirmFirstRunMemory() {
    if (this.data.firstRunBusy) return;
    const proposal = this.data.firstRunProposal;
    const content = String(this.data.firstRunProposalText || '').trim();
    if (!proposal || !content) {
      wx.showToast({ title: '记忆内容不能为空', icon: 'none' });
      return;
    }
    this.setData({ firstRunBusy: true, firstRunError: '', firstRunPermissionDenied: false });
    const state = this.firstRunState;
    const saved = state.memoryDecisions[proposal.questionId] || {};
    if (this.firstRunDemoMode) {
      state.memoryDecisions[proposal.questionId] = {
        decision: 'confirmed',
        memoryId: 'demo-' + proposal.key,
        content,
        visibility: proposal.questionId === 'boundary' ? 'private' : proposal.visibility,
      };
      this.setData({ firstRunBusy: false });
      await this.advanceFirstRunReview();
      return;
    }
    try {
      // 先查已确认记忆：确认响应丢失后再次进入，也不会重复创建或确认。
      const listed = await cloud.callFunction('memory', { action: 'listMemories', status: 'confirmed' });
      const existing = (listed.memories || []).find((memory) => {
        const refs = memory.sourceMessageIds || [];
        return refs.includes(proposal.sourceMessageIds[0]) || memory.content === content;
      });
      let memoryId = existing && (existing._id || existing.id);
      const desiredVisibility = proposal.questionId === 'boundary' ? 'private' : proposal.visibility;
      if (existing && existing.visibility !== desiredVisibility) {
        await cloud.callFunction('memory', {
          action: 'editMemory',
          memoryId,
          visibility: desiredVisibility,
        }, { idempotent: false });
      }
      if (!memoryId) {
        memoryId = saved.memoryId;
        if (!memoryId) {
          // create 成功但响应丢失时，稳定 sourceMessageId 可找回 proposed 记录。
          const proposed = await cloud.callFunction('memory', { action: 'listMemories', status: 'proposed' });
          const recovered = (proposed.memories || []).find((memory) => {
            const refs = memory.sourceMessageIds || [];
            return refs.includes(proposal.sourceMessageIds[0]);
          });
          memoryId = recovered && (recovered._id || recovered.id);
        }
        if (!memoryId) {
          const created = await cloud.callFunction('memory', {
            action: 'createMemoryProposal',
            kind: proposal.kind,
            content,
            // 隐私边界无论 UI/恢复数据如何变化，都在写入点再次强制 private。
            visibility: proposal.questionId === 'boundary' ? 'private' : proposal.visibility,
            sourceConversationId: 'first-run-onboarding',
            sourceMessageIds: proposal.sourceMessageIds,
          }, { idempotent: false });
          memoryId = created.memory && (created.memory._id || created.memory.id);
          if (!memoryId) throw new Error('memory_id_missing');
          state.memoryDecisions[proposal.questionId] = {
            decision: 'pending', memoryId, content, visibility: desiredVisibility,
          };
          firstRun.save(wx, state);
        }
        await cloud.callFunction('memory', {
          action: 'confirmMemory',
          memoryId,
          content,
          visibility: proposal.questionId === 'boundary' ? 'private' : proposal.visibility,
        }, { idempotent: false });
      }
      state.memoryDecisions[proposal.questionId] = {
        decision: 'confirmed', memoryId, content, visibility: desiredVisibility,
      };
      await this.advanceFirstRunReview();
    } catch (err) {
      const message = String((err && (err.code || err.message)) || '');
      const denied = /unauthorized|permission|auth/i.test(message);
      this.setData({
        firstRunError: denied ? '需要先登录，才能把这条记忆安全地存给你。' : '这条记忆暂时没存上，答案还在，可以重试。',
        firstRunPermissionDenied: denied,
      });
    } finally {
      this.setData({ firstRunBusy: false });
    }
  },

  async onDismissFirstRunMemory() {
    const proposal = this.data.firstRunProposal;
    if (!proposal || this.data.firstRunBusy) return;
    this.firstRunState.memoryDecisions[proposal.questionId] = { decision: 'dismissed' };
    await this.advanceFirstRunReview();
  },

  async advanceFirstRunReview() {
    const state = this.firstRunState;
    if (state.reviewIndex < state.reviewIds.length - 1) {
      state.reviewIndex += 1;
      this.persistFirstRun();
    } else {
      await this.prepareFirstRunDraft();
    }
  },

  async prepareFirstRunDraft() {
    const state = this.firstRunState;
    if (!state || this.generatingFirstRunDraft) return;
    const confirmedIds = state.reviewIds.filter((id) => {
      const decision = state.memoryDecisions[id];
      const question = firstRun.questionById(id);
      return decision && decision.decision === 'confirmed'
        && decision.visibility === 'public'
        && question && question.visibility === 'public';
    });
    if (!confirmedIds.length) {
      state.stage = 'draft';
      state.draft = firstRun.draftFromAnswers(state, true);
      this.persistFirstRun();
      return;
    }
    if (this.firstRunDemoMode) {
      state.stage = 'draft';
      state.draft = firstRun.draftFromAnswers(state, true);
      this.persistFirstRun();
      return;
    }
    this.generatingFirstRunDraft = true;
    state.stage = 'draft-loading';
    firstRun.save(wx, state);
    this.setData({
      firstRunStage: 'draft-loading',
      firstRunBusy: true,
      firstRunError: '',
      firstRunPermissionDenied: false,
    });
    try {
      const res = await cloud.callFunction('agent', {
        action: 'generateCardDraft',
        cardDraftScope: 'public_only',
        memoryIds: confirmedIds
          .map((id) => state.memoryDecisions[id] && state.memoryDecisions[id].memoryId)
          .filter(Boolean),
        currentCard: {},
      });
      if (!res || res.ok !== true || !res.result || !res.result.draft) {
        const code = res && res.error && res.error.code;
        const err = new Error(code || 'invalid_card_draft');
        err.code = code;
        throw err;
      }
      state.draft = this.projectFirstRunAgentDraft(res.result.draft, confirmedIds);
      state.stage = 'draft';
      delete state.draftError;
      delete state.draftErrorCode;
      this.persistFirstRun();
    } catch (err) {
      const message = String((err && (err.code || err.message)) || '');
      const denied = /unauthorized|permission|auth/i.test(message);
      state.stage = 'draft-error';
      state.draftError = denied
        ? '需要先登录，才能用你确认的记忆起草 Card。'
        : 'Vibe 暂时没起草成功。你的回答和已确认记忆都还在。';
      state.draftErrorCode = denied ? 'permission' : 'unavailable';
      firstRun.save(wx, state);
      this.setData({
        firstRunStage: 'draft-error',
        firstRunError: state.draftError,
        firstRunPermissionDenied: denied,
      });
    } finally {
      this.generatingFirstRunDraft = false;
      this.setData({ firstRunBusy: false });
    }
  },

  projectFirstRunAgentDraft(raw, confirmedIds) {
    const allowed = new Set(confirmedIds);
    const draft = { name: String(this.firstRunState.name || '').trim() };
    if (allowed.has('current')) {
      const bio = String(raw.currentFocus || raw.headline || '').trim();
      if (bio) draft.bio = bio;
    }
    if (allowed.has('work') && Array.isArray(raw.highlights) && raw.highlights.length) {
      draft.highlights = raw.highlights.map((item, index) => ({
        id: item.id || 'first-run-work-' + index,
        title: String(item.title || '').trim(),
        icon: '✨',
        link: item.url || '',
      })).filter((item) => item.title);
    }
    if (allowed.has('help') && Array.isArray(raw.canHelpWith)) {
      draft.canHelpWith = raw.canHelpWith.map((item) => String(item).trim()).filter(Boolean);
    }
    if (allowed.has('meet') && Array.isArray(raw.wantsToMeet)) {
      const lookingFor = raw.wantsToMeet.map((item) => String(item).trim()).filter(Boolean).join('、');
      if (lookingFor) draft.lookingFor = lookingFor;
    }
    // 结构合法但遗漏某个已确认区块时，用主人原话补齐；仍只来自已确认记忆，
    // 不会把跳过、拒绝或 boundary 内容投影到公开 Card。
    const grounded = firstRun.draftFromAnswers(this.firstRunState, true);
    if (allowed.has('current') && !draft.bio && grounded.bio) draft.bio = grounded.bio;
    if (allowed.has('work') && (!draft.highlights || !draft.highlights.length) && grounded.highlights) {
      draft.highlights = grounded.highlights;
    }
    if (allowed.has('help') && (!draft.canHelpWith || !draft.canHelpWith.length) && grounded.canHelpWith) {
      draft.canHelpWith = grounded.canHelpWith;
    }
    if (allowed.has('meet') && !draft.lookingFor && grounded.lookingFor) draft.lookingFor = grounded.lookingFor;
    return draft;
  },

  onRetryFirstRunDraft() {
    this.prepareFirstRunDraft();
  },

  onUseConfirmedAnswersDraft() {
    const state = this.firstRunState;
    state.draft = firstRun.draftFromAnswers(state, true);
    state.stage = 'draft';
    this.persistFirstRun();
  },

  onFirstRunDraftInput(e) {
    const key = e.currentTarget.dataset.key;
    if (!['name', 'bio', 'work', 'help', 'lookingFor'].includes(key)) return;
    const draft = Object.assign({}, this.firstRunState.draft || {});
    const value = e.detail.value;
    if (key === 'work') {
      draft.highlights = value.trim()
        ? [{ id: 'first-run-work', title: value, icon: '✨', link: '' }]
        : [];
    } else if (key === 'help') {
      draft.canHelpWith = value.trim() ? [value] : [];
    } else {
      draft[key] = value;
    }
    this.firstRunState.draft = draft;
    firstRun.save(wx, this.firstRunState);
    this.setData({ firstRunDraft: draft });
  },

  async onPublishFirstRunCard() {
    if (this.data.firstRunBusy) return;
    const draft = this.firstRunState.draft || {};
    const name = String(draft.name || '').trim();
    if (!name) {
      wx.showToast({ title: 'Card 需要一个名字', icon: 'none' });
      return;
    }
    this.setData({ firstRunBusy: true, firstRunError: '' });
    const updates = {
      name,
      handle: '',
      bio: String(draft.bio || '').trim(),
      tags: [],
      lookingFor: String(draft.lookingFor || '').trim(),
      canHelpWith: (draft.canHelpWith || []).map((item) => String(item).trim()).filter(Boolean),
      highlights: (draft.highlights || []).filter((item) => item && String(item.title || '').trim()),
      verified: { wallet: '', twitter: '', discord: '', wechat: '' },
    };
    // Production 先写权威 users 文档并取得 ownerId；只有显式 demo 才只写本地。
    // 云端 updateNamecard 是 upsert，响应丢失后的重试不会产生第二张 Card。
    try {
      const answered = firstRun.reviewIdsFor(this.firstRunState).length;
      if (!this.firstRunDemoMode) {
        const result = await cloud.callFunction('user', {
          action: 'updateNamecard',
          profile: updates,
        });
        const ownerId = result && (result.ownerId || result.openid);
        if (!ownerId) throw new Error('owner identity missing after publish');
        updates.ownerId = ownerId;
        updates.openid = ownerId;
      }
      store.setProfile(updates);
      this.firstRunState.published = true;
      firstRun.clear(wx);
      this.firstRunState = null;
      this.setData({ showOnboarding: false, firstRunBusy: false });
      track.event('first_run_card_published', { answered });
      this.loadProfile();
    } catch (err) {
      this.setData({
        firstRunBusy: false,
        firstRunError: 'Card 暂时没有发布成功，草稿还在，请重试。',
      });
    }
  },

  // 最近动态（任务 4.5）：主人视图尽力从云端拉取已发布未过期的动态；
  // 云不可用/未登录时保持空列表——空状态不渲染版块，也不编造内容
  async loadNowItems() {
    try {
      const profile = this.data.profile || {};
      const payload = { action: 'getActiveNowItems' };
      if (profile.ownerId || profile.openid) payload.ownerId = profile.ownerId || profile.openid;
      const res = await cloud.callFunction('now', payload);
      this.setData({ nowItems: toNowDisplayRows(res.nowItems || []) });
    } catch (err) {
      console.warn('[card] getActiveNowItems failed:', err && err.message);
    }
  },

  // 头像加载失败（外链图床不在白名单）时回退为首字头像
  onAvatarError() {
    this.setData({ avatarFailed: true });
  },

  // Edit
  openEdit() {
    const p = this.data.profile || {};
    const avatarUrl = p.avatar || '';
    const isCustom = avatarUrl && !avatarUrl.includes('dicebear');
    let seed = AVATAR_SEEDS[0];
    try {
      const m = avatarUrl.match(/seed=([^&]+)/);
      if (m) seed = m[1];
    } catch (e) {}
    this.setData({
      isEditing: true,
      editName: p.name || '',
      editHandle: p.handle || '',
      editBio: p.bio || '',
      editTags: (p.tags || []).map(t => t.label),
      editLookingFor: p.lookingFor || '',
      editCanHelpWith: (p.canHelpWith || []).join('\n'),
      editEvent: p.event || '',
      editHighlights: p.highlights || [],
      editCustomTag: '',
      editAvatar: avatarUrl,
      editAvatarSeed: seed,
      avatarMode: isCustom ? 'custom' : 'generated',
      editWallet: p.verified?.wallet || '',
      editTwitter: p.verified?.twitter || '',
      editDiscord: p.verified?.discord || '',
      editWechat: p.verified?.wechat || '',
    });
  },
  closeEdit() {
    this.setData({ isEditing: false });
  },
  onEditNameInput(e) { this.setData({ editName: e.detail.value }); },
  onEditHandleInput(e) { this.setData({ editHandle: e.detail.value }); },
  onEditBioInput(e) { this.setData({ editBio: e.detail.value }); },
  onEditTagSelect(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = this.data.editTags;
    if (tags.includes(tag)) {
      this.setData({ editTags: tags.filter(t => t !== tag) });
    } else if (tags.length < 5) {
      this.setData({ editTags: [...tags, tag] });
    }
  },
  onEditCustomTagInput(e) {
    this.setData({ editCustomTag: e.detail.value });
  },
  addEditCustomTag() {
    const tag = this.data.editCustomTag.trim();
    if (!tag) return;
    const tags = this.data.editTags;
    if (tags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    if (tags.length >= 5) {
      wx.showToast({ title: '最多5个标签', icon: 'none' });
      return;
    }
    this.setData({ editTags: [...tags, tag], editCustomTag: '' });
  },
  onEditLookingSelect(e) {
    this.setData({ editLookingFor: e.currentTarget.dataset.item });
  },
  onEditCanHelpInput(e) {
    this.setData({ editCanHelpWith: e.detail.value });
  },
  onEditEventSelect(e) {
    this.setData({ editEvent: e.currentTarget.dataset.item });
  },

  // Avatar
  chooseAvatar() {
    if (this.data.avatarMode !== 'custom') return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({ editAvatar: path });
      },
    });
  },
  setAvatarMode(e) {
    const mode = e.currentTarget.dataset.mode;
    let avatar = this.data.editAvatar;
    if (mode === 'generated' && (!avatar || !avatar.includes('dicebear'))) {
      avatar = avatarUrlFor('notionists', this.data.editAvatarSeed || AVATAR_SEEDS[0]);
    }
    this.setData({ avatarMode: mode, editAvatar: avatar });
  },
  selectAvatarSeed(e) {
    const { url, seed } = e.currentTarget.dataset;
    this.setData({ editAvatarSeed: seed || this.data.editAvatarSeed, editAvatar: url });
  },

  // Verified Accounts
  onEditWalletInput(e) { this.setData({ editWallet: e.detail.value }); },
  onEditTwitterInput(e) { this.setData({ editTwitter: e.detail.value }); },
  onEditDiscordInput(e) { this.setData({ editDiscord: e.detail.value }); },
  onEditWechatInput(e) { this.setData({ editWechat: e.detail.value }); },

  // Highlights
  addHighlight() {
    const highlights = this.data.editHighlights;
    const id = Date.now().toString();
    this.setData({ editHighlights: [...highlights, { id, icon: '', title: '' }] });
  },
  removeHighlight(e) {
    const id = e.currentTarget.dataset.id;
    const highlights = this.data.editHighlights.filter(h => h.id !== id);
    this.setData({ editHighlights: highlights });
  },
  onHighlightIconInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const highlights = this.data.editHighlights.map(h =>
      h.id === id ? { ...h, icon: value } : h
    );
    this.setData({ editHighlights: highlights });
  },
  onHighlightTitleInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const highlights = this.data.editHighlights.map(h =>
      h.id === id ? { ...h, title: value } : h
    );
    this.setData({ editHighlights: highlights });
  },

  async saveEdit() {
    const profile = {
      name: this.data.editName.trim(),
      handle: this.data.editHandle.trim(),
      bio: this.data.editBio.trim(),
      tags: this.data.editTags.map(t => ({ label: t, icon: '' })),
      lookingFor: this.data.editLookingFor,
      canHelpWith: String(this.data.editCanHelpWith || '').split('\n').map((item) => item.trim()).filter(Boolean),
      event: this.data.editEvent,
      highlights: this.data.editHighlights,
      verified: {
        wallet: this.data.editWallet,
        twitter: this.data.editTwitter,
        discord: this.data.editDiscord,
        wechat: this.data.editWechat,
      },
      avatar: this.data.editAvatar
        || avatarUrlFor('notionists', this.data.editAvatarSeed || AVATAR_SEEDS[0]),
    };
    try {
      const demoFlag = wx.getStorageSync && wx.getStorageSync('vibecard_demo_mode');
      if (!(demoFlag === true || demoFlag === '1')) {
        const result = await cloud.callFunction('user', { action: 'updateNamecard', profile });
        const ownerId = result && (result.ownerId || result.openid);
        if (!ownerId) throw new Error('owner identity missing after save');
        Object.assign(profile, { ownerId, openid: ownerId });
      }
      store.setProfile(profile);
      this.setData({ isEditing: false });
      this.loadProfile();
    } catch (err) {
      wx.showToast({ title: 'Card 没有保存，请重试', icon: 'none' });
    }
  },

  // Share
  openShare() {
    this.setData({ showShare: true });
  },
  closeShare() {
    this.setData({ showShare: false });
  },
  noop() {},
  goHome() {
    nav.showTabBar();
    // 分享卡片打开的就是 tab 页本体，switchTab 到当前 tab 不会重载；
    // 用 reLaunch 强制全新加载，访客才能进入自己的名片/onboarding
    nav.reLaunch('/pages/card/card');
  },

  // 访客视图入口：先和主人的 AI 分身聊聊（任务 0.4 mock + 任务 2.5 云链路）
  // 分享资料里带 ownerId/openid 时透传给分身页，走真实云对话。fixture
  // 只能由显式 demo 开关进入；缺 ownerId 的真实页面会显示链接不完整。
  goVisitorChat() {
    track.event('cta_click', { cta_id: 'go_visitor_chat', view: this.data.isSharedView ? 'visitor' : 'owner' });
    const p = this.data.profile || {};
    const ownerId = p.ownerId || p.openid || '';
    const demoFlag = wx.getStorageSync && wx.getStorageSync('vibecard_demo_mode');
    const query = ownerId
      ? '?ownerId=' + encodeURIComponent(ownerId)
      : (demoFlag === true || demoFlag === '1') ? '?demo=1' : '';
    nav.navigateTo('/pages/visitor-chat/visitor-chat' + query);
  },

  onShareAppMessage() {
    const profile = this.data.profile;
    if (!profile || !profile.name) {
      return { title: 'VibeCard · 一张会越来越懂你的 AI 名片', path: '/pages/card/card' };
    }
    try {
      // Contact details (verified.wechat etc.) are private by default: they must
      // never travel inside the share link, only through owner-approved exchange.
      const publicProfile = { ...profile, verified: undefined };
      if (publicProfile.avatar) publicProfile.avatar = publicProfile.avatar.replace('/svg?', '/png?');
      // 最近动态是公开数据，随分享负载一起走，访客看到同一份发布快照
      if (this.data.nowItems && this.data.nowItems.length > 0) {
        publicProfile.nowItems = this.data.nowItems.map((item) => ({
          id: item.id,
          text: item.text,
          topic: item.topic,
          publishedAt: item.publishedAt,
        }));
      }
      const data = encodeURIComponent(JSON.stringify(publicProfile));
      // 标题即名片的自我表达：这是「我的 AI 名片」，并告诉对方能做什么
      const title = `${profile.name}的 AI 名片 · 先和我的 Vibe 聊聊`;

      const promise = new Promise(resolve => {
        this.drawShareCanvas(profile).then(tempFilePath => {
          resolve({
            title,
            path: `/pages/card/card?shared=${data}`,
            imageUrl: tempFilePath
          });
        }).catch(err => {
          console.error('Draw canvas failed', err);
          resolve({
            title,
            path: `/pages/card/card?shared=${data}`
          });
        });
      });

      return {
        title,
        path: `/pages/card/card?shared=${data}`,
        promise
      };
    } catch (e) {
      return { title: 'VibeCard · 一张会越来越懂你的 AI 名片', path: '/pages/card/card' };
    }
  },

  // 朋友圈分享（v2 获客，2026-08-16）：访客点开仍是主人名片入口
  onShareTimeline() {
    const profile = this.data.profile || {};
    const title = profile.name
      ? `${profile.name}的 AI 名片 · 先和我的 Vibe 聊聊`
      : 'VibeCard · 一张会越来越懂你的 AI 名片';
    return {
      title,
      query: '',
      imageUrl: profile.avatar || '',
    };
  },

  drawShareCanvas(profile) {
    return new Promise((resolve, reject) => {
      if (!profile) return reject('No profile');
      const query = this.createSelectorQuery();
      query.select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) return reject('No canvas node');
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const width = 750;
        const height = 600;
        canvas.width = width;
        canvas.height = height;

        // 与 App 内名片一致的浅灰底 + 极淡 indigo 光晕；人是唯一主角，无品牌广告
        ctx.fillStyle = '#f7f7f8';
        ctx.fillRect(0, 0, width, height);

        let glow = ctx.createRadialGradient(width - 60, 40, 0, width - 60, 40, 420);
        glow.addColorStop(0, 'rgba(99,102,241,0.12)');
        glow.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        const renderContent = (img) => {
          // 大头像 + 光晕圆环
          const avatarCx = 140;
          const avatarCy = 150;
          const avatarR = 64;
          ctx.fillStyle = '#e6e6fb';
          ctx.beginPath(); ctx.arc(avatarCx, avatarCy, avatarR + 10, 0, Math.PI * 2); ctx.fill();
          if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
            ctx.restore();
          } else {
            const grd = ctx.createLinearGradient(avatarCx - avatarR, avatarCy - avatarR, avatarCx + avatarR, avatarCy + avatarR);
            grd.addColorStop(0, '#818cf8');
            grd.addColorStop(1, '#6366f1');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2); ctx.fill();
            const initial = profile.name ? profile.name.charAt(0).toUpperCase() : '?';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 58px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initial, avatarCx, avatarCy + 4);
          }
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';

          // 名字 + handle
          const textX = 248;
          const textMax = width - textX - 64;
          ctx.fillStyle = '#16161a';
          ctx.font = 'bold 60px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          ctx.fillText(fitCanvasText(ctx, profile.name, textMax), textX, 158);
          if (profile.handle) {
            ctx.fillStyle = '#8e8e93';
            ctx.font = '27px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText(fitCanvasText(ctx, profile.handle, textMax), textX, 202);
          }

          // 标签：玻璃 chips
          ctx.font = '23px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          const tags = profile.tags || [];
          const allTags = (profile.event ? [{ label: profile.event }, ...tags] : tags)
            .map(t => String(t.label || '')).filter(Boolean);
          let tagX = textX;
          const tagY = 226;
          const tagMaxRight = width - 64;
          for (const label of allTags.slice(0, 4)) {
            const chipWidth = ctx.measureText(label).width + 32;
            if (tagX + chipWidth > tagMaxRight) break;
            ctx.fillStyle = '#eceefe';
            ctx.beginPath();
            drawRoundRectPath(ctx, tagX, tagY, chipWidth, 40, 20);
            ctx.fill();
            ctx.fillStyle = '#4f46e5';
            ctx.fillText(label, tagX + 16, tagY + 28);
            tagX += chipWidth + 12;
          }

          // 分隔线
          ctx.strokeStyle = 'rgba(17,17,19,0.08)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(64, 320);
          ctx.lineTo(width - 64, 320);
          ctx.stroke();

          // 关于我：简介 > 最新动态（最多两行）
          const about = profile.bio || profile.latestMoment || '';
          if (about) {
            ctx.fillStyle = '#3f3f46';
            ctx.font = '28px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            const words = String(about).split('');
            const lines = [];
            let line = '';
            let truncated = false;
            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n];
              if (ctx.measureText(testLine).width > width - 128 && line) {
                lines.push(line);
                line = words[n];
                if (lines.length === 2) { truncated = true; break; }
              } else {
                line = testLine;
              }
            }
            if (!truncated && line && lines.length < 2) lines.push(line);
            let y = 380;
            lines.slice(0, 2).forEach((l, i) => {
              const isLast = truncated && i === 1;
              ctx.fillText(isLast ? fitCanvasText(ctx, l, width - 170) : l, 64, y);
              y += 44;
            });
          }

          // 想认识什么样的人（名片的灵魂）
          if (profile.lookingFor) {
            ctx.fillStyle = '#6366f1';
            ctx.font = 'bold 22px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText('LOOKING FOR', 64, 490);
            ctx.fillStyle = '#16161a';
            ctx.font = 'bold 31px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText(fitCanvasText(ctx, profile.lookingFor, width - 128), 64, 534);
          }

          // Export
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: width,
            height: height,
            destWidth: width,
            destHeight: height,
            success: res => resolve(res.tempFilePath),
            fail: err => reject(err)
          });
        };

        // dicebear 生成头像同样真实绘制：/svg -> /png；仅无头像时用首字母兜底
        const avatarUrl = profile.avatar
          ? profile.avatar.replace('/svg?', '/png?')
          : null;

        if (avatarUrl) {
          wx.getImageInfo({
            src: avatarUrl,
            success: (imageRes) => {
              try {
                const img = canvas.createImage();
                img.src = imageRes.path;
                img.onload = () => renderContent(img);
                img.onerror = () => renderContent(null);
              } catch (e) {
                renderContent(null);
              }
            },
            fail: (err) => {
              console.warn('[getImageInfo] avatar load fail:', err);
              renderContent(null);
            }
          });
        } else {
          renderContent(null);
        }
      });
    });
  },
});
