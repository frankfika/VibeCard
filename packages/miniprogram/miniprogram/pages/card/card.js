const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');

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

const AVATAR_SEEDS = ['Alex', 'Luna', 'Max', 'Zoe', 'Kai', 'Nova', 'Aria', 'Leo', 'Mia', 'Finn', 'Sage', 'River'];
const TAG_OPTIONS = [
  'Builder', 'Designer', 'Founder', 'Developer', 'Researcher',
  'Community', 'Product', 'AI', 'Web3', 'Creator',
  'Investor', 'Indie Hacker', '🎨 Design', '🚀 Shipping',
  '🧠 Strategy', '💻 Full Stack', '📱 Mobile', '🌍 Remote',
  '🎤 Speaker', '☕ Coffee Chat'
];
const LOOKING_FOR_OPTIONS = [
  '🚀 找合伙人', '💼 寻找机会', '🤝 寻求投资',
  '☕️ 随便聊聊', '💡 交流想法', '👥 招募队友'
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
    avatarSeeds: AVATAR_SEEDS,
    editAvatar: '',
    editAvatarSeed: '',
    avatarMode: 'generated',
    editWallet: '',
    editTwitter: '',
    editDiscord: '',
    editWechat: '',
    cardVisible: false,
    onboardingSteps: ONBOARDING_STEPS,
  },

  onLoad(options) {
    if (options.shared) {
      try {
        const sharedProfile = JSON.parse(decodeURIComponent(options.shared));
        this.setData({ profile: sharedProfile, isSetup: true, isSharedView: true, cardVisible: true });
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
    let profile = store.getProfile() || {};
    if (!profile.verified) profile = { ...profile, verified: { wallet: '', twitter: '', discord: '', wechat: '' } };
    if (!profile.highlights) profile = { ...profile, highlights: [] };
    if (!profile.avatar && profile.name) {
      profile = { ...profile, avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name}&backgroundColor=transparent` };
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
    if (mode === 'generated') {
      avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${this.data.editAvatarSeed}&backgroundColor=transparent`;
    }
    this.setData({ avatarMode: mode, editAvatar: avatar });
  },
  selectAvatarSeed(e) {
    const seed = e.currentTarget.dataset.seed;
    this.setData({
      editAvatarSeed: seed,
      editAvatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`,
    });
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
      avatar: this.data.avatarMode === 'custom' && this.data.editAvatar
        ? this.data.editAvatar
        : `https://api.dicebear.com/7.x/notionists/svg?seed=${this.data.editAvatarSeed}&backgroundColor=transparent`,
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
    nav.switchTab('/pages/card/card');
  },

  // 访客视图入口：先和主人的 AI 分身聊聊（任务 0.4 mock + 任务 2.5 云链路）
  // 分享资料里带 ownerId/openid 时透传给分身页，走真实云对话；否则回退 fixture 演示
  goVisitorChat() {
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
      const data = encodeURIComponent(JSON.stringify(publicProfile));
      const handleStr = profile.handle ? ` @${profile.handle}` : '';
      const lookingStr = profile.lookingFor ? ` · ${profile.lookingFor}` : '';
      const tagStr = profile.tags && profile.tags.length > 0 ? ` · ${profile.tags.map(t => t.label).join(' ')}` : '';
      const title = `${profile.name}${handleStr}${lookingStr}${tagStr}`;

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

        // 浅色背景 + 白色卡片，与 App 内视觉一致
        ctx.fillStyle = '#f7f7f8';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        drawRoundRectPath(ctx, 40, 40, width - 80, height - 80, 32);
        ctx.fill();
        ctx.strokeStyle = 'rgba(17,17,19,0.06)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const renderContent = (img) => {
          // 头像（圆形，indigo 渐变兜底）
          const avatarCx = 160;
          const avatarCy = 170;
          const avatarR = 70;
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
            ctx.beginPath();
            ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
            ctx.fill();
            const initial = profile.name ? profile.name.charAt(0).toUpperCase() : '?';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 64px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initial, avatarCx, avatarCy + 4);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          }

          // 名字（宽度过长时截断，避免溢出卡片）
          const textX = 270;
          const textMaxWidth = width - 80 - textX - 30;
          ctx.fillStyle = '#16161a';
          ctx.font = 'bold 52px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          ctx.fillText(fitCanvasText(ctx, profile.name, textMaxWidth), textX, 155);

          // Handle
          if (profile.handle) {
            ctx.fillStyle = '#8e8e93';
            ctx.font = '28px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText(fitCanvasText(ctx, profile.handle, textMaxWidth), textX, 200);
          }

          // 标签（chips，超出右边界即停止，不换行不重叠）
          let tagX = textX;
          const tagY = 224;
          const tagMaxRight = width - 80 - 30;
          ctx.font = '24px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          const tags = profile.tags || [];
          const allTags = profile.event ? [{ label: profile.event }, ...tags] : tags;
          for (const tag of allTags.slice(0, 4)) {
            const label = String(tag.label || '');
            if (!label) continue;
            const chipWidth = ctx.measureText(label).width + 32;
            if (tagX + chipWidth > tagMaxRight) break;
            ctx.fillStyle = '#eceefe';
            ctx.beginPath();
            drawRoundRectPath(ctx, tagX, tagY, chipWidth, 44, 22);
            ctx.fill();
            ctx.fillStyle = '#4f46e5';
            ctx.fillText(label, tagX + 16, tagY + 31);
            tagX += chipWidth + 16;
          }

          // 中部：简介优先，其次最新动态，再次 lookingFor
          const midText = profile.bio || profile.latestMoment || profile.lookingFor || '';
          if (midText) {
            ctx.fillStyle = '#3f3f46';
            ctx.font = '28px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            const words = String(midText).split('');
            const lines = [];
            let line = '';
            let truncated = false;
            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n];
              if (ctx.measureText(testLine).width > 570 && line) {
                lines.push(line);
                line = words[n];
                if (lines.length === 2) { truncated = true; break; }
              } else {
                line = testLine;
              }
            }
            if (!truncated && line && lines.length < 2) lines.push(line);
            let y = 350;
            lines.slice(0, 2).forEach((l, i) => {
              const isLast = truncated && i === 1;
              ctx.fillText(isLast ? fitCanvasText(ctx, l, 540) : l, 90, y);
              y += 44;
            });
          }

          // Looking For 独立一行（与中部文字拉开距离）
          if (profile.lookingFor && (profile.bio || profile.latestMoment)) {
            ctx.fillStyle = '#6366f1';
            ctx.font = 'bold 22px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText('LOOKING FOR', 90, 470);
            ctx.fillStyle = '#16161a';
            ctx.font = 'bold 28px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText(fitCanvasText(ctx, profile.lookingFor, 570), 90, 508);
          }

          // 底部品牌
          ctx.fillStyle = '#b6b6bd';
          ctx.font = '22px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('VibeCard · 会越来越懂你的 AI 名片', width / 2, height - 66);
          ctx.textAlign = 'left';

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

        const avatarUrl = profile.avatar && !profile.avatar.includes('dicebear.com')
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
