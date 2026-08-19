/**
 * 轻量埋点层（v2 获客 + 增长，2026-08-16）
 *
 * 设计原则：
 *   - 零依赖：只在本地 storage 维护一个事件队列 + 控制台日志。
 *   - 零阻塞：任何上报失败都不影响业务；track.event 是 fire-and-forget。
 *   - 上报友好：后续接入云开发统计或第三方时，只需替换 `flush` 的实现。
 *   - 用户可控：尊重全局开关（可在 app.js 关闭埋点）。
 *
 * 关键事件命名约定（snake_case）：
 *   - page_view            进入页面
 *   - cta_click            关键按钮点击（带 cta_id 属性）
 *   - share_clicked        分享入口点击（朋友/朋友圈分别用 share_target 区分）
 *   - share_done           分享成功回调
 *   - request_submitted    访客提交连接请求
 *   - memory_confirmed     主人确认一条记忆
 *   - card_draft_accepted  主人接受 Card 草稿
 *   - now_published        主人发布一条 Now
 *   - connection_made      主人与访客握手成功（核心北极星事件）
 */

const QUEUE_KEY = 'vibecard_track_queue';
const QUEUE_MAX = 200; // 本地最多保留 200 条，避免 storage 爆掉

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (e) {
    return '';
  }
}

function getSystemInfo() {
  try {
    const info = (wx.getAppBaseInfo && wx.getAppBaseInfo()) || {};
    return {
      sdk: info.SDKVersion || '',
      platform: info.platform || '',
      version: info.version || '',
    };
  } catch (e) {
    return {};
  }
}

function readQueue() {
  try {
    const q = wx.getStorageSync(QUEUE_KEY);
    return Array.isArray(q) ? q : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(queue) {
  try {
    // 防止超长：保留最后 QUEUE_MAX 条
    const trimmed = queue.length > QUEUE_MAX
      ? queue.slice(queue.length - QUEUE_MAX)
      : queue;
    wx.setStorageSync(QUEUE_KEY, trimmed);
  } catch (e) {
    // 静默失败：埋点永远不能阻塞业务
  }
}

/**
 * 上报一个事件。
 * @param {string} name - 事件名（snake_case）
 * @param {Object} [props] - 任意附加属性（避免放 PII，如手机号/邮箱/openid 明文）
 * @param {Object} [options] - { sync: true 表示立刻 flush（默认 false）}
 */
function event(name, props = {}, options = {}) {
  if (!name || typeof name !== 'string') return;
  try {
    const entry = {
      event: name,
      props: props || {},
      ts: nowIso(),
      sys: getSystemInfo(),
    };
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);

    // 开发期可见的日志；上线后可关掉
    if (wx.getStorageSync('vibecard_track_verbose')) {
      console.log('[track]', name, props);
    }

    if (options.sync) flush();
  } catch (e) {
    // 全兜底
  }
}

/**
 * 把队列上报到后端。当前版本仅打印日志；
 * 接入云开发统计 / 自建上报服务时，把这里的实现替换成真实网络请求。
 */
function flush() {
  const queue = readQueue();
  if (!queue.length) return;
  // TODO（接入后端时替换）: wx.cloud.callFunction({ name: 'track', data: { events: queue } })
  // 暂保留在本地，便于离线调试与漏斗复盘
  console.log('[track] flush', queue.length, 'events (local-only for now)');
}

/**
 * 读取本地事件队列（供调试 / 后续上报使用）。
 */
function getQueue() {
  return readQueue();
}

/**
 * 清空本地事件队列。
 */
function clear() {
  writeQueue([]);
}

module.exports = {
  event,
  flush,
  getQueue,
  clear,
};
