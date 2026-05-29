/**
 * Authentication utility for vibecard mini-program
 * Handles user login, logout, and session management
 */

const app = getApp();

/**
 * Login user by calling cloud function
 * @returns {Promise<Object>} User info object
 */
async function login() {
  try {
    wx.showLoading({
      title: '登录中...',
      mask: true
    });

    const res = await wx.cloud.callFunction({
      name: 'login',
      data: {}
    });

    if (res.result.success) {
      const userInfo = res.result.data;

      // Store user info in global data
      app.globalData.userInfo = userInfo;

      // Store in local storage as cache
      wx.setStorageSync('userInfo', userInfo);

      wx.hideLoading();
      return userInfo;
    } else {
      wx.hideLoading();
      wx.showToast({
        title: res.result.message || '登录失败',
        icon: 'none'
      });
      throw new Error(res.result.message || '登录失败');
    }
  } catch (error) {
    wx.hideLoading();
    wx.showToast({
      title: '登录失败，请重试',
      icon: 'none'
    });
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Get cached user info from app global data or local storage
 * @returns {Object|null} User info object or null if not logged in
 */
function getUserInfo() {
  // First check global data
  if (app.globalData.userInfo) {
    return app.globalData.userInfo;
  }

  // Then check local storage
  try {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      app.globalData.userInfo = userInfo;
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
  return userInfo !== null && userInfo.openid;
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
    app.globalData.userInfo = null;

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
