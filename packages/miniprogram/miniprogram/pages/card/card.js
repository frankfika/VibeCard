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
  { title: '欢迎使用 vibecard', subtitle: '创建你的 Web3 社交名片', hint: '让我们从基本信息开始' },
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
        this.setData({ profile: sharedProfile, isSetup: true, isSharedView: true });
        nav.hideTabBar();
        return;
      } catch (e) {}
    }
    this.loadProfile();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (!this.data.isSharedView) {
      this.loadProfile();
    }
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
    this.setData({ profile, isSetup });
    if (!isSetup) {
      this.setData({ showOnboarding: true, onboardingStep: 0, cardVisible: false });
    } else {
      // Trigger enter animation
      this.setData({ cardVisible: false });
      setTimeout(() => this.setData({ cardVisible: true }), 100);
    }
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

  // 访客视图入口：先和主人的 AI 分身聊聊（任务 0.4 mock 故事）
  goVisitorChat() {
    nav.navigateTo('/pages/visitor-chat/visitor-chat');
  },

  onShareAppMessage() {
    const profile = this.data.profile;
    if (!profile || !profile.name) {
      return { title: 'vibecard - Web3 社交名片', path: '/pages/card/card' };
    }
    try {
      const data = encodeURIComponent(JSON.stringify(profile));
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
      return { title: 'vibecard - Web3 社交名片', path: '/pages/card/card' };
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

        // Draw background
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        // Radial gradient
        const grd = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, height);
        grd.addColorStop(0, '#1a1a1a');
        grd.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);

        // Decorative dots
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < 20; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const r = 2 + Math.random() * 4;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Top accent line
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(60, 40);
        ctx.lineTo(690, 40);
        ctx.stroke();

        const renderContent = (img) => {
          // Draw Avatar
          if (img) {
            ctx.save();
            ctx.beginPath();
            drawRoundRectPath(ctx, 80, 80, 160, 160, 32);
            ctx.clip();
            ctx.drawImage(img, 80, 80, 160, 160);
            ctx.restore();
          } else {
            const initial = profile.name ? profile.name.charAt(0).toUpperCase() : '?';
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
            const color = colors[profile.name ? profile.name.charCodeAt(0) % colors.length : 0];
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(160, 160, 80, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 72px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initial, 160, 160);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          }

          // Avatar border
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          drawRoundRectPath(ctx, 80, 80, 160, 160, 32);
          ctx.stroke();

          // Draw Name
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 64px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          ctx.fillText(profile.name, 280, 140);

          // Draw Handle
          if (profile.handle) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = 'bold 32px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText(profile.handle, 280, 190);
          }

          // Draw Tags
          let tagX = 280;
          let tagY = 230;
          ctx.font = 'bold 24px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          const tags = profile.tags || [];
          const allTags = profile.event ? [{label: `📍 ${profile.event}`}, ...tags] : tags;

          allTags.slice(0, 3).forEach(tag => {
            const textWidth = ctx.measureText(tag.label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            drawRoundRectPath(ctx, tagX, tagY, textWidth + 32, 48, 24);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(tag.label, tagX + 16, tagY + 34);
            tagX += textWidth + 48;
          });

          // Draw Moment Preview Box
          if (profile.latestMoment) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            drawRoundRectPath(ctx, 80, 320, 590, 200, 32);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = 'bold 24px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            ctx.fillText('✨ 最新动态', 120, 380);

            ctx.fillStyle = '#ffffff';
            ctx.font = '500 32px -apple-system, SF Pro Display, PingFang SC, sans-serif';
            const momentText = profile.latestMoment.length > 30 ? profile.latestMoment.substring(0, 30) + '...' : profile.latestMoment;
            const words = momentText.split('');
            let line = '';
            let y = 440;
            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n];
              const metrics = ctx.measureText(testLine);
              if (metrics.width > 500 && n > 0) {
                ctx.fillText(line, 120, y);
                line = words[n];
                y += 44;
              } else {
                line = testLine;
              }
            }
            ctx.fillText(line, 120, y);
          }

          // Bottom brand
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '24px -apple-system, SF Pro Display, PingFang SC, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('vibecard · Web3 社交名片', width / 2, height - 40);
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
