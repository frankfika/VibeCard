const cloud = require('wx-server-sdk');
const { checkTextWithRetry, gateStrangerContent, UNSAFE_ERRCODE } = require('./lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * content-check (task 3.1).
 *
 * checkText / checkImage now return a typed three-state result:
 *   { status: 'safe' | 'unsafe' | 'unavailable', safe: true|false|null, message }
 * Transient failures are retried; on persistent failure nothing defaults to
 * safe. `gateStrangerContent` is what publishing flows should consult.
 */
exports.main = async (event) => {
  const { action } = event || {};

  try {
    switch (action) {
      case 'checkText': {
        const result = await checkTextWithRetry(cloud.openapi, event.content);
        return result;
      }

      case 'checkImage': {
        const { fileID } = event;
        if (!fileID) throw new Error('FileID is required');
        try {
          const res = await cloud.downloadFile({ fileID });
          const check = await cloud.openapi.security.imgSecCheck({
            media: { contentType: 'image/png', value: res.fileContent },
          });
          if (check.errCode === 0) return { status: 'safe', safe: true, message: 'Image is safe' };
          return { status: 'unsafe', safe: false, message: 'Image contains illegal or sensitive content' };
        } catch (err) {
          if (err && err.errCode === UNSAFE_ERRCODE) {
            return { status: 'unsafe', safe: false, message: 'Image contains illegal or sensitive content' };
          }
          return { status: 'unavailable', safe: null, message: 'Image check is temporarily unavailable' };
        }
      }

      // Server-to-server gate used by stranger-content flows (e.g. requests).
      case 'gateText': {
        const result = await checkTextWithRetry(cloud.openapi, event.content);
        const gate = gateStrangerContent(result);
        return { ...result, gate };
      }

      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Content check error:', error && error.message);
    throw error;
  }
};
