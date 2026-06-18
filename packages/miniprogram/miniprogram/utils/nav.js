/**
 * 安全路由封装，减少 webviewId 冲突与热重载时的 page route 报错
 */

const MAX_RETRY = 2;

function noop() {}

function safeNavigate(fn, url, options = {}) {
  const { success, fail, complete, ...rest } = options;
  let attempts = 0;

  const tryRun = () => {
    attempts += 1;
    fn({
      url,
      ...rest,
      success: (res) => {
        if (typeof success === 'function') success(res);
      },
      fail: (err) => {
        const msg = String(err && err.errMsg);
        // 忽略已存在 webviewId / page register failed 等微信内部热重载错误，不重试、不抛给业务方
        if (msg.includes('already exist webviewId') || msg.includes('page register failed')) {
          console.warn('[nav] ignored internal error:', msg);
          if (typeof complete === 'function') complete();
          return;
        }
        if (attempts <= MAX_RETRY) {
          setTimeout(tryRun, 50);
          return;
        }
        console.warn('[nav] fail:', url, err);
        if (typeof fail === 'function') fail(err);
        if (typeof complete === 'function') complete();
      },
      complete,
    });
  };

  tryRun();
}

function navigateTo(url, options = {}) {
  return safeNavigate(wx.navigateTo, url, options);
}

function redirectTo(url, options = {}) {
  return safeNavigate(wx.redirectTo, url, options);
}

function switchTab(url, options = {}) {
  return safeNavigate(wx.switchTab, url, options);
}

function reLaunch(url, options = {}) {
  return safeNavigate(wx.reLaunch, url, options);
}

function navigateBack(options = {}) {
  const delta = options.delta || 1;
  wx.navigateBack({
    ...options,
    delta,
    fail: (err) => {
      console.warn('[nav] navigateBack fail:', err);
      if (typeof options.fail === 'function') options.fail(err);
      // 若返回失败，兜底到首页
      if (getCurrentPages && getCurrentPages().length <= 1) {
        switchTab('/pages/card/card');
      }
    },
  });
}

function hideTabBar(options = {}) {
  if (!wx.hideTabBar) return;
  wx.hideTabBar({ animation: false, fail: noop, ...options });
}

function showTabBar(options = {}) {
  if (!wx.showTabBar) return;
  wx.showTabBar({ animation: false, fail: noop, ...options });
}

module.exports = {
  navigateTo,
  redirectTo,
  switchTab,
  reLaunch,
  navigateBack,
  hideTabBar,
  showTabBar,
};
