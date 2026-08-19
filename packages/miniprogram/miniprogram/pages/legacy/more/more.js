const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');

const APP_VERSION = '1.0.0';

Page({
  data: {
    profile: null,
    profileComplete: false,
    profileCompletePercent: 0,
    stats: {
      threads: 0,
      activities: 0,
      cardsDrawn: 0,
    },
    showAbout: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadData();
  },

  loadData() {
    const profile = store.getProfile();
    const complete = !!(profile.name && profile.bio && profile.tags && profile.tags.length >= 3);
    
    // Calculate completion percentage
    let percent = 0;
    if (profile.name) percent += 20;
    if (profile.bio) percent += 20;
    if (profile.tags && profile.tags.length > 0) percent += Math.min(profile.tags.length * 10, 20);
    if (profile.lookingFor) percent += 10;
    if (profile.event) percent += 10;
    if (profile.avatar) percent += 10;
    if (profile.highlights && profile.highlights.length > 0) percent += 10;
    
    const threads = store.getThreads();
    const activities = store.getActivities();
    const gameSession = store.getGameSession();
    
    this.setData({
      profile,
      profileComplete: complete,
      profileCompletePercent: percent,
      stats: {
        threads: threads.length,
        activities: activities.length,
        cardsDrawn: gameSession.history ? gameSession.history.length : 0,
      },
    });
  },

  goDiscover() {
    nav.navigateTo('/pages/legacy/discover/discover');
  },

  goGames() {
    nav.navigateTo('/pages/legacy/games/games');
  },

  goCard() {
    nav.switchTab('/pages/card/card');
  },

  showAboutModal() {
    this.setData({ showAbout: true });
  },

  closeAboutModal() {
    this.setData({ showAbout: false });
  },

  noop() {},

  clearLocalData() {
    wx.showModal({
      title: '清除本地数据',
      content: '这将清除所有名片数据、动态、活动和游戏记录，此操作不可恢复。',
      confirmText: '清除',
      confirmColor: '#ef4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            this.setData({
              profile: null,
              profileComplete: false,
              profileCompletePercent: 0,
              stats: { threads: 0, activities: 0, cardsDrawn: 0 },
            });
            wx.showToast({ title: '数据已清除', icon: 'success' });
            // Navigate to card page to restart onboarding
            setTimeout(() => {
              nav.switchTab('/pages/card/card');
            }, 1000);
          } catch (e) {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  },
});
