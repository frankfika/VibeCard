App({
  onLaunch() {
    // 使用非废弃的 wx.getAppBaseInfo 获取基础信息（替代 wx.getSystemInfoSync）
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
    const majorMinor = (info.SDKVersion || '').split('.');
    const major = parseInt(majorMinor[0], 10) || 0;
    const minor = parseInt(majorMinor[1], 10) || 0;
    if (major < 2 || (major === 2 && minor < 20)) {
      wx.showModal({
        title: '提示',
        content: '当前微信版本较低，部分界面可能显示异常，建议升级微信以获得最佳体验。',
        showCancel: false,
      });
    }

    // 捕获并屏蔽部分无法处理的运行时内部报错，保持控制台整洁
    if (typeof wx.onError === 'function') {
      wx.onError((err) => {
        // 忽略微信内部 worker / 实时上报等已知系统级错误
        const ignored = [
          'reportRealtimeAction',
          'appLaunch with an already exist webviewId',
          'SharedArrayBuffer',
        ];
        if (ignored.some(k => String(err).includes(k))) {
          return;
        }
        console.error('MiniProgram runtime error:', err);
      });
    }

    // 初始化云开发（如当前环境支持）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: wx.cloud.DYNAMIC_CURRENT_ENV,
          traceUser: true,
        });
      } catch (e) {
        console.warn('[cloud] init failed:', e);
      }
    }

    // 初始化本地存储默认值
    const profile = wx.getStorageSync('vibecard_profile');
    if (!profile) {
      wx.setStorageSync('vibecard_profile', {
        name: '', handle: '', avatar: '', bio: '', tags: [],
        lookingFor: '', highlights: [],
        verified: { wallet: '', twitter: '', discord: '', wechat: '' },
        event: ''
      });
    }
    const threads = wx.getStorageSync('vibecard_threads');
    if (!threads) wx.setStorageSync('vibecard_threads', []);
    const activities = wx.getStorageSync('vibecard_activities');
    if (!activities) wx.setStorageSync('vibecard_activities', []);
    const gameSession = wx.getStorageSync('vibecard_game');
    if (!gameSession) {
      wx.setStorageSync('vibecard_game', { presetId: null, selectedTags: [], history: [], favorites: [] });
    }
  },
  globalData: {}
});
