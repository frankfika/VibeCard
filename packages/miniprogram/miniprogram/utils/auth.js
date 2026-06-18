/**
 * Authentication utility for vibecard mini-program
 * Handles user login, logout, and session management
 */

const app = () => {
  try {
    return getApp();
  } catch (e) {
    console.warn('[auth] getApp failed:', e);
    return null;
  }
};

/**
 * Safe wrapper to get app global data
 */
function getAppGlobalData() {
  const a = app();
  return a ? a.globalData : {};
}

/**
 * Safe wrapper to set app global data
 */
function setAppGlobalData(key, value) {
  const a = app();
  if (a) {
    a.globalData[key] = value;
  }
}

/**
 * Call a cloud function with timeout and retry
 */
function callCloudFunction(name, data, options = {}) {
  const { timeout = 15000, retries = 2 } = options;

  return new Promise((resolve, reject) => {
    let attempts = 0;

    const doCall = () => {
      attempts += 1;
      const cloudCall = wx.cloud.callFunction({ name, data });

      const timer = setTimeout(() => {
        const err = new Error(`云函数 ${name} 调用超时`);
        err.code = 'TIMEOUT';
        if (attempts <= retries) {
          console.warn(`[cloud] ${name} timeout, retrying ${attempts}/${retries}`);
          doCall();
        } else {
          reject(err);
        }
      }, timeout);

      cloudCall.then(res => {
        clearTimeout(timer);
        resolve(res);
      }).catch(err => {
        clearTimeout(timer);
        console.warn(`[cloud] ${name} failed (attempt ${attempts}/${retries + 1}):`, err);
        if (attempts <= retries) {
          doCall();
        } else {
          reject(err);
        }
      });
    };

    doCall();
  });
}

/**
 * Login user by calling cloud function
 * @returns {Promise<Object>} User info object
 */
async function login() {
  let loadingShown = false;
  try {
    wx.showLoading({
      title: '登录中...',
      mask: true
    });
    loadingShown = true;

    const res = await callCloudFunction('login', {}, { timeout: 15000, retries: 2 });

    if (res.result && res.result.success) {
      const userInfo = res.result.data;

      // Store user info in global data
      setAppGlobalData('userInfo', userInfo);

      // Store in local storage as cache
      wx.setStorageSync('userInfo', userInfo);

      return userInfo;
    } else {
      throw new Error(res.result?.message || '登录失败');
    }
  } catch (error) {
    console.error('Login error:', error);
    wx.showToast({
      title: error.message || '登录失败，请重试',
      icon: 'none'
    });
    throw error;
  } finally {
    if (loadingShown) {
      wx.hideLoading();
    }
  }
}

/**
 * Get cached user info from app global data or local storage
 * @returns {Object|null} User info object or null if not logged in
 */
function getUserInfo() {
  // First check global data
  const global = getAppGlobalData();
  if (global.userInfo) {
    return global.userInfo;
  }

  // Then check local storage
  try {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      setAppGlobalData('userInfo', userInfo);
      return userInfo;
    }
  } catch (error) {
    console.error('Error getting user info from storage:', error);
  }

  return null;
}

/**
 * Check if user is logged in
 * @returns {boolean} True if user is logged in
 */
function isLoggedIn() {
  const userInfo = getUserInfo();
  return !!(userInfo && userInfo.openid);
}

/**
 * Ensure user is logged in, prompt login if not
 * @param {Function} callback - Function to call after login is confirmed
 */
function requireLogin(callback) {
  if (isLoggedIn()) {
    // User already logged in
    if (typeof callback === 'function') {
      callback(getUserInfo());
    }
    return;
  }

  // Show login prompt
  wx.showModal({
    title: '登录提示',
    content: '此功能需要登录后使用',
    confirmText: '去登录',
    cancelText: '取消',
    success: async (res) => {
      if (res.confirm) {
        try {
          const userInfo = await login();
          if (typeof callback === 'function') {
            callback(userInfo);
          }
        } catch (error) {
          console.error('Login failed:', error);
        }
      }
    }
  });
}

/**
 * Logout user and clear all user data
 */
function logout() {
  try {
    // Clear global data
    setAppGlobalData('userInfo', null);

    // Clear local storage
    wx.removeStorageSync('userInfo');

    wx.showToast({
      title: '已退出登录',
      icon: 'success'
    });

    return true;
  } catch (error) {
    console.error('Logout error:', error);
    wx.showToast({
      title: '退出登录失败',
      icon: 'none'
    });
    return false;
  }
}

module.exports = {
  login,
  getUserInfo,
  isLoggedIn,
  requireLogin,
  logout
};
