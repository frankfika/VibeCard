/**
 * Cloud API wrapper for vibecard mini-program
 * Provides simplified interfaces for cloud functions and storage
 */

/**
 * Call a cloud function with error handling, timeout and retry.
 *
 * 安全重试策略（v2，2026-08-16）：
 *   - 默认按「读操作」处理：允许重试（GET 类，重复读不会改变状态）。
 *   - 写/非幂等调用必须显式声明 `idempotent: false`，此时默认 retries=0，
 *     避免重复 createMemoryProposal / createRequest / connect 等产生重复数据。
 *   - 调用方可显式覆盖 retries；显式声明优先级最高。
 *
 * @param {string} name - Cloud function name
 * @param {Object} data - Data to pass to the function
 * @param {Object} options - Optional { timeout: ms, retries: count, idempotent: bool }
 * @returns {Promise<any>} Function result
 */
async function callFunction(name, data = {}, options = {}) {
  const isWrite = options.idempotent === false;
  // 显式 retries 优先；未显式指定时：读操作默认 2，写操作默认 0
  const retries = (typeof options.retries === 'number')
    ? options.retries
    : (isWrite ? 0 : 2);
  const { timeout = 15000 } = options;

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

      cloudCall.then((res) => {
        clearTimeout(timer);
        if (res.result && res.result.success === false) {
          reject(new Error(res.result.message || '云函数调用失败'));
        } else {
          resolve(res.result);
        }
      }).catch((err) => {
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
 * Upload file to cloud storage
 * @param {string} filePath - Local file path
 * @param {string} cloudPath - Cloud storage path
 * @returns {Promise<Object>} Upload result with fileID
 */
async function uploadFile(filePath, cloudPath) {
  try {
    wx.showLoading({
      title: '上传中...',
      mask: true
    });

    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath
    });

    wx.hideLoading();

    if (res.fileID) {
      return {
        success: true,
        fileID: res.fileID
      };
    } else {
      throw new Error('上传失败，未返回文件ID');
    }
  } catch (error) {
    wx.hideLoading();
    wx.showToast({
      title: '上传失败',
      icon: 'none'
    });
    console.error('Upload file error:', error);
    throw error;
  }
}

/**
 * Delete file from cloud storage
 * @param {string} fileID - File ID to delete
 * @returns {Promise<Object>} Delete result
 */
async function deleteFile(fileID) {
  try {
    const res = await wx.cloud.deleteFile({
      fileList: [fileID]
    });

    if (res.fileList && res.fileList[0] && res.fileList[0].status === 0) {
      return {
        success: true
      };
    } else {
      throw new Error('删除文件失败');
    }
  } catch (error) {
    console.error('Delete file error:', error);
    throw error;
  }
}

/**
 * Get temporary download URL for cloud file
 * @param {string|Array<string>} fileID - File ID or array of file IDs
 * @returns {Promise<Object>} Temporary file URL(s)
 */
async function getTempFileURL(fileID) {
  try {
    const fileList = Array.isArray(fileID) ? fileID : [fileID];

    const res = await wx.cloud.getTempFileURL({
      fileList
    });

    if (res.fileList && res.fileList.length > 0) {
      // Return single URL if single fileID was provided
      if (!Array.isArray(fileID)) {
        return res.fileList[0].tempFileURL;
      }
      // Return array of URLs
      return res.fileList.map(file => file.tempFileURL);
    } else {
      throw new Error('获取文件URL失败');
    }
  } catch (error) {
    console.error('Get temp file URL error:', error);
    throw error;
  }
}

/**
 * Get database reference
 * @returns {Object} Database reference
 */
function db() {
  return wx.cloud.database();
}

/**
 * Batch call cloud functions with concurrency control
 * @param {Array<{name: string, data: Object}>} calls - Array of function calls
 * @param {number} concurrency - Max concurrent calls (default: 5)
 * @returns {Promise<Array>} Array of results
 */
async function batchCallFunctions(calls, concurrency = 5) {
  const results = [];
  const executing = [];

  for (const call of calls) {
    const promise = callFunction(call.name, call.data).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Download file from cloud storage to local
 * @param {string} fileID - Cloud file ID
 * @returns {Promise<string>} Local file path
 */
async function downloadFile(fileID) {
  try {
    wx.showLoading({
      title: '下载中...',
      mask: true
    });

    const res = await wx.cloud.downloadFile({
      fileID
    });

    wx.hideLoading();

    if (res.tempFilePath) {
      return res.tempFilePath;
    } else {
      throw new Error('下载失败');
    }
  } catch (error) {
    wx.hideLoading();
    wx.showToast({
      title: '下载失败',
      icon: 'none'
    });
    console.error('Download file error:', error);
    throw error;
  }
}

module.exports = {
  callFunction,
  uploadFile,
  deleteFile,
  getTempFileURL,
  db,
  batchCallFunctions,
  downloadFile
};
