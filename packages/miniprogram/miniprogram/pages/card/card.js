const store = require('../../utils/store.js');

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
  },

  onLoad(options) {
    if (options.shared) {
      try {
        const sharedProfile = JSON.parse(decodeURIComponent(options.shared));
        this.setData({ profile: sharedProfile, isSetup: true, isSharedView: true });
        wx.hideTabBar(); // Hide tab bar in shared view
        return;
      } catch (e) {}
    }
    this.loadProfile();
  },

  onShow() {
    if (!this.data.isSharedView) {
      this.loadProfile();
    }
  },

  loadProfile() {
    const profile = store.getProfile();
    const isSetup = store.isProfileSetup();
    if (isSetup) {
      const threads = store.getThreads();
      if (threads && threads.length > 0) {
        profile.latestMoment = threads[0].content;
      }
    }
    this.setData({ profile, isSetup });
    if (!isSetup) {
      this.setData({ showOnboarding: true, onboardingStep: 0 });
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
  completeOnboarding() {
    const profile = {
      name: this.data.onboardingName.trim(),
      handle: this.data.onboardingHandle.trim(),
      bio: this.data.onboardingBio.trim(),
      tags: this.data.onboardingTags.map(t => ({ label: t, icon: '' })),
      lookingFor: this.data.onboardingLookingFor,
      event: this.data.onboardingEvent,
    };
    store.setProfile(profile);
    this.setData({ showOnboarding: false, isSetup: true });
    this.loadProfile();
  },

  // Edit
  openEdit() {
    const p = this.data.profile;
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
  saveEdit() {
    const profile = {
      name: this.data.editName.trim(),
      handle: this.data.editHandle.trim(),
      bio: this.data.editBio.trim(),
      tags: this.data.editTags.map(t => ({ label: t, icon: '' })),
      lookingFor: this.data.editLookingFor,
      event: this.data.editEvent,
      highlights: this.data.editHighlights,
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
    wx.showTabBar();
    wx.switchTab({ url: '/pages/card/card' });
  },

  onShareAppMessage() {
    const profile = this.data.profile;
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
      const query = this.createSelectorQuery();
      query.select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res[0] || !res[0].node) return reject('No canvas node');
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const width = 750;
        const height = 600;

        // Draw background (dark glassmorphism style)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        // Simple gradient
        const grd = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, height);
        grd.addColorStop(0, '#1a1a1a');
        grd.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);

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

          // Draw border
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          drawRoundRectPath(ctx, 80, 80, 160, 160, 32);
          ctx.stroke();

          // Draw Name
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 64px sans-serif';
          ctx.fillText(profile.name, 280, 140);

          // Draw Handle
          if (profile.handle) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText(profile.handle, 280, 190);
          }

          // Draw Tags
          let tagX = 280;
          let tagY = 230;
          ctx.font = 'bold 24px sans-serif';
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
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('✨ 最新动态', 120, 380);

            ctx.fillStyle = '#ffffff';
            ctx.font = '500 32px sans-serif';
            const momentText = profile.latestMoment.length > 30 ? profile.latestMoment.substring(0, 30) + '...' : profile.latestMoment;
            // Simple multiline
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

          // Export
          wx.canvasToTempFilePath({
            canvas,
            success: res => resolve(res.tempFilePath),
            fail: err => reject(err)
          });
        };

        // Only load external image if avatar exists and is not from dicebear
        const avatarUrl = profile.avatar && !profile.avatar.includes('dicebear.com')
          ? profile.avatar.replace('/svg?', '/png?')
          : null;

        if (avatarUrl) {
          wx.getImageInfo({
            src: avatarUrl,
            success: (imageRes) => {
              const img = canvas.createImage();
              img.src = imageRes.path;
              img.onload = () => renderContent(img);
              img.onerror = () => renderContent(null);
            },
            fail: () => renderContent(null)
          });
        } else {
          renderContent(null);
        }
      });
    });
  },
});
