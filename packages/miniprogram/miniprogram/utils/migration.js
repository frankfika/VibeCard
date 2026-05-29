/**
 * Data migration utility for vibecard mini-program
 * Migrates local storage data to cloud database
 */

const cloudAPI = require('./cloud.js');
const auth = require('./auth.js');

/**
 * Check if migration is needed
 * Determines if local data exists that hasn't been migrated
 * @returns {Promise<Object>} Migration status object
 */
async function checkMigrationNeeded() {
  try {
    // Check for local progress data
    const localProgress = wx.getStorageSync('progress') || {};
    const localFavorites = wx.getStorageSync('favorites') || [];

    // Check migration flag
    const migrationCompleted = wx.getStorageSync('migrationCompleted');

    const hasLocalData = Object.keys(localProgress).length > 0 || localFavorites.length > 0;
    const needsMigration = hasLocalData && !migrationCompleted;

    return {
      needsMigration,
      hasLocalData,
      migrationCompleted,
      dataCount: {
        progress: Object.keys(localProgress).length,
        favorites: localFavorites.length
      }
    };
  } catch (error) {
    console.error('Check migration error:', error);
    return {
      needsMigration: false,
      hasLocalData: false,
      migrationCompleted: false,
      dataCount: {
        progress: 0,
        favorites: 0
      }
    };
  }
}

/**
 * Backup local data before migration
 * @returns {Object} Backup data object
 */
function backupLocalData() {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      progress: wx.getStorageSync('progress') || {},
      favorites: wx.getStorageSync('favorites') || [],
      settings: wx.getStorageSync('settings') || {}
    };

    // Store backup
    wx.setStorageSync('migrationBackup', backup);

    console.log('Local data backed up:', backup);
    return backup;
  } catch (error) {
    console.error('Backup local data error:', error);
    throw error;
  }
}

/**
 * Migrate local data to cloud database
 * @returns {Promise<Object>} Migration result
 */
async function migrateToCloud() {
  try {
    // Ensure user is logged in
    if (!auth.isLoggedIn()) {
      throw new Error('用户未登录，无法迁移数据');
    }

    // Check if migration is needed
    const migrationStatus = await checkMigrationNeeded();
    if (!migrationStatus.needsMigration) {
      return {
        success: true,
        message: '无需迁移',
        skipped: true
      };
    }

    wx.showLoading({
      title: '迁移数据中...',
      mask: true
    });

    // Backup data first
    const backup = backupLocalData();

    // Prepare migration data
    const migrationData = {
      progress: backup.progress,
      favorites: backup.favorites,
      settings: backup.settings
    };

    // Call cloud function to migrate data
    const result = await cloudAPI.callFunction('user', {
      action: 'migrateData',
      localData: migrationData
    });

    if (result.success) {
      // Mark migration as completed
      wx.setStorageSync('migrationCompleted', true);
      wx.setStorageSync('migrationDate', new Date().toISOString());

      wx.hideLoading();
      wx.showToast({
        title: '数据迁移成功',
        icon: 'success'
      });

      return {
        success: true,
        message: '数据迁移成功',
        migratedCount: result.migratedCount || {
          progress: Object.keys(backup.progress).length,
          favorites: backup.favorites.length
        }
      };
    } else {
      wx.hideLoading();
      wx.showModal({
        title: '迁移失败',
        content: result.message || '数据迁移失败，请重试',
        showCancel: false
      });

      throw new Error(result.message || '数据迁移失败');
    }
  } catch (error) {
    wx.hideLoading();
    console.error('Migration error:', error);

    wx.showModal({
      title: '迁移失败',
      content: '数据迁移过程中出现错误，本地数据已备份',
      showCancel: false
    });

    throw error;
  }
}

/**
 * Restore data from backup
 * @returns {boolean} Success status
 */
function restoreFromBackup() {
  try {
    const backup = wx.getStorageSync('migrationBackup');
    if (!backup) {
      wx.showToast({
        title: '无备份数据',
        icon: 'none'
      });
      return false;
    }

    wx.setStorageSync('progress', backup.progress);
    wx.setStorageSync('favorites', backup.favorites);
    wx.setStorageSync('settings', backup.settings);

    // Clear migration flag to allow re-migration
    wx.removeStorageSync('migrationCompleted');

    wx.showToast({
      title: '数据已恢复',
      icon: 'success'
    });

    return true;
  } catch (error) {
    console.error('Restore from backup error:', error);
    wx.showToast({
      title: '恢复失败',
      icon: 'none'
    });
    return false;
  }
}

/**
 * Clear local data after successful migration
 * @param {boolean} keepBackup - Whether to keep backup data
 */
function clearLocalData(keepBackup = true) {
  try {
    wx.removeStorageSync('progress');
    wx.removeStorageSync('favorites');

    if (!keepBackup) {
      wx.removeStorageSync('migrationBackup');
    }

    console.log('Local data cleared');
  } catch (error) {
    console.error('Clear local data error:', error);
  }
}

module.exports = {
  checkMigrationNeeded,
  backupLocalData,
  migrateToCloud,
  restoreFromBackup,
  clearLocalData
};
