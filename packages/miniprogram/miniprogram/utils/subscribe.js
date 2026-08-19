/**
 * 订阅消息工具（v2 获客 + 留存，2026-08-16）
 *
 * 微信小程序订阅消息必须在用户发生交互（tap）的同一 tick 内调用
 * wx.requestSubscribeMessage 才会弹出授权框；因此本工具的设计是：
 *   - 页面在关键转化点（如「提交请求」「通过连接」）按钮回调里直接调用
 *   - 模板 ID 集中管理，未配置时安全降级（直接 resolve 空结果，不阻塞业务）
 *   - 用户拒绝/关闭授权也不影响主流程，只埋一条本地日志
 *
 * 上线前需要在微信公众平台 → 订阅消息 里申请下面两个模板，
 * 然后把真实的 tmplId 填到下方对应字段。
 */

// 订阅消息模板（占位 ID，上线前替换为真实模板）
const TMPL = {
  // 主人侧：有新的连接请求送达
  OWNER_NEW_REQUEST: 'OWNER_NEW_REQUEST_TMPL_ID',
  // 访客侧：主人通过了你的连接请求
  VISITOR_REQUEST_ACCEPTED: 'VISITOR_REQUEST_ACCEPTED_TMPL_ID',
};

/**
 * 请求订阅消息授权。
 * @param {string|string[]} tmplKeys - 模板 key 或 key 数组（见上方 TMPL）
 * @returns {Promise<{ accepted: string[], rejected: string[], result: Object }>}
 *          accepted 是被接受的模板 key 列表（已映射回 key 方便上层处理）
 */
function requestSubscribe(tmplKeys) {
  const keys = Array.isArray(tmplKeys) ? tmplKeys : [tmplKeys];
  const tmplIds = keys.map((k) => TMPL[k]).filter(Boolean);

  // 没配置真实模板 ID 时安全降级：什么都不弹，业务继续
  if (tmplIds.length === 0) {
    console.warn('[subscribe] no tmplId configured for', keys);
    return Promise.resolve({ accepted: [], rejected: [], result: {}, skipped: true });
  }

  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || typeof wx.requestSubscribeMessage !== 'function') {
      console.warn('[subscribe] wx.requestSubscribeMessage unavailable');
      return resolve({ accepted: [], rejected: keys, result: {}, unavailable: true });
    }

    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        // res 形如 { 'tmplId_xxx': 'accept' | 'reject' | 'ban', ... }
        const accepted = [];
        const rejected = [];
        keys.forEach((k, i) => {
          const id = tmplIds[i];
          if (res[id] === 'accept') accepted.push(k);
          else rejected.push(k);
        });
        console.log('[subscribe] result', { accepted, rejected, raw: res });
        resolve({ accepted, rejected, result: res });
      },
      fail: (err) => {
        console.warn('[subscribe] failed', err && err.errMsg);
        resolve({ accepted: [], rejected: keys, result: {}, error: err });
      },
    });
  });
}

module.exports = {
  TMPL,
  requestSubscribe,
};
