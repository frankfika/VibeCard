const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');
const cloud = require('../../utils/cloud.js');
const nowHelper = require('../../utils/now.js');
const track = require('../../utils/track.js');

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

const ONBOARDING_STEPS = [
  { title: '欢迎使用 vibecard', subtitle: '创建你的 AI 名片', hint: '让我们从基本信息开始' },
  { title: '选择标签', subtitle: '最多选 5 个，也可以自定义', hint: '标签帮助他人快速了解你' },
  { title: '完善资料', subtitle: '补充简介和意向', hint: '这些信息会展示在你的名片上' },
];

Page({
  data: {
    profile: null,
    isSetup: false,
    isEditing: false,
    showShare: false,
    isSharedView: false,
    showOnboarding: false,
    onboardingStep: 0,
    onboardingName: '',
    onboardingHandle: '',
    onboardingBio: '',
    onboardingTags: [],
    onboardingLookingFor: '',
    onboardingEvent: '',
    editName: '',
    editHandle: '',
    editBio: '',
    editTags: [],
    editLookingFor: '',
    editEvent: '',
    editHighlights: [],
    onboardingCustomTag: '',
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
    onboardingSteps: ONBOARDING_STEPS,
    nowItems: [], // 最近动态（任务 4.5）：≤3 条已发布未过期；空则不渲染
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
      this.setData({ showOnboarding: true, onboardingStep: 0, cardVisible: false });
    } else {
      // Trigger enter animation
      this.setData({ cardVisible: false });
      setTimeout(() => this.setData({ cardVisible: true }), 100);
      this.loadNowItems();
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

  // Onboarding
  onOnboardingNameInput(e) {
    this.setData({ onboardingName: e.detail.value });
  },
  onOnboardingHandleInput(e) {
    this.setData({ onboardingHandle: e.detail.value });
  },
  onOnboardingBioInput(e) {
    this.setData({ onboardingBio: e.detail.value });
  },
  onOnboardingTagSelect(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = this.data.onboardingTags;
    if (tags.includes(tag)) {
      this.setData({ onboardingTags: tags.filter(t => t !== tag) });
    } else if (tags.length < 5) {
      this.setData({ onboardingTags: [...tags, tag] });
    }
  },
  onOnboardingCustomTagInput(e) {
    this.setData({ onboardingCustomTag: e.detail.value });
  },
  addOnboardingCustomTag() {
    const tag = this.data.onboardingCustomTag.trim();
    if (!tag) return;
    const tags = this.data.onboardingTags;
    if (tags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    if (tags.length >= 5) {
      wx.showToast({ title: '最多5个标签', icon: 'none' });
      return;
    }
    this.setData({ onboardingTags: [...tags, tag], onboardingCustomTag: '' });
  },
  onOnboardingLookingSelect(e) {
    this.setData({ onboardingLookingFor: e.currentTarget.dataset.item });
  },
  onOnboardingEventSelect(e) {
    this.setData({ onboardingEvent: e.currentTarget.dataset.item });
  },
  nextOnboardingStep() {
    const step = this.data.onboardingStep;
    if (step === 0 && !this.data.onboardingName.trim()) {
      wx.showToast({ title: '请输入名字', icon: 'none' });
      return;
    }
    if (step >= 2) {
      this.completeOnboarding();
      return;
    }
    this.setData({ onboardingStep: step + 1 });
  },
  prevOnboardingStep() {
    const step = this.data.onboardingStep;
    if (step > 0) {
      this.setData({ onboardingStep: step - 1 });
    }
  },
  skipOnboarding() {
    wx.showModal({
      title: '跳过引导',
      content: '你可以随时在"编辑名片"中完善资料，是否跳过？',
      confirmText: '跳过',
      cancelText: '继续',
      success: (res) => {
        if (res.confirm) {
          const profile = {
            name: this.data.onboardingName.trim() || 'Viber',
            handle: this.data.onboardingHandle.trim(),
            bio: this.data.onboardingBio.trim(),
            tags: this.data.onboardingTags.map(t => ({ label: t, icon: '' })),
            lookingFor: this.data.onboardingLookingFor,
            event: this.data.onboardingEvent,
            highlights: [],
            verified: { wallet: '', twitter: '', discord: '', wechat: '' },
          };
          store.setProfile(profile);
          this.setData({ showOnboarding: false, isSetup: true });
          this.loadProfile();
        }
      }
    });
  },
  completeOnboarding() {
    const profile = {
      name: this.data.onboardingName.trim(),
      handle: this.data.onboardingHandle.trim(),
      bio: this.data.onboardingBio.trim(),
      tags: this.data.onboardingTags.map(t => ({ label: t, icon: '' })),
      lookingFor: this.data.onboardingLookingFor,
      event: this.data.onboardingEvent,
      highlights: [],
      verified: { wallet: '', twitter: '', discord: '', wechat: '' },
    };
    store.setProfile(profile);
    this.setData({ showOnboarding: false, isSetup: true });
    this.loadProfile();
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

  saveEdit() {
    const profile = {
      name: this.data.editName.trim(),
      handle: this.data.editHandle.trim(),
      bio: this.data.editBio.trim(),
      tags: this.data.editTags.map(t => ({ label: t, icon: '' })),
      lookingFor: this.data.editLookingFor,
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
    store.setProfile(profile);
    this.setData({ isEditing: false });
    this.loadProfile();
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
  // 分享资料里带 ownerId/openid 时透传给分身页，走真实云对话；否则回退 fixture 演示
  goVisitorChat() {
    track.event('cta_click', { cta_id: 'go_visitor_chat', view: this.data.isSharedView ? 'visitor' : 'owner' });
    const p = this.data.profile || {};
    const ownerId = p.ownerId || p.openid || '';
    const query = ownerId ? '?ownerId=' + encodeURIComponent(ownerId) : '';
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
