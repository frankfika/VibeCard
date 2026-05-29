/**
 * Cloud API wrapper for vibecard mini-program
 * Provides simplified interfaces for cloud functions and storage
 */

/**
 * Call a cloud function with error handling
 * @param {string} name - Cloud function name
 * @param {Object} data - Data to pass to the function
 * @returns {Promise<any>} Function result
 */
async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name,
      data
    });

    if (res.result && res.result.success === false) {
      throw new Error(res.result.message || '云函数调用失败');
    }

    return res.result;
  } catch (error) {
    console.error(`Cloud function ${name} error:`, error);
    throw error;
  }
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
