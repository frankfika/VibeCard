/**
 * settings 页面（任务 4.6）—— 数据与隐私。
 *
 * 三个独立流程：
 *   1. 导出我的 Vibe：选项（是否包含对话）→ 调用 archive-export exportPrivateArchive →
 *      写入 wx.getFileSystemManager 用户目录 → 状态机展示（progress / success / failure / retry）。
 *   2. 导入 Vibe：选 .vibe 文件 → 解析 → 二次确认覆盖 → 调用 archive-import importArchive。
 *   3. 删除我的 Vibe 数据：三步强制流程（fresh export + 备份 + 输入 DELETE）→
 *      调用 archive-export prepareDeleteAll → archive-deleteAll deleteAll；
 *      任何残留以红色 state-error 展示，绝不 silent success。
 *
 * 所有错误用结构化 state 报告，不弹原生 modal 把消息丢给用户。
 */

const track = require('../../utils/track.js');
const archiveApi = require('../../utils/archive.js');

const SECTION_LABELS = {
  memories: '记忆',
  nowItems: '最近动态',
  conversations: '对话',
  connectionRequests: '连接请求',
  contactMethods: '联系方式',
  attachments: '附件',
  knowledgeSources: '资料来源',
  users: '名片 / 用户档案',
};

let messageSeq = 0;
function nextId(prefix) {
  messageSeq += 1;
  return prefix + '-' + Date.now().toString(36) + '-' + messageSeq;
}

Page({
  data: {
    optIncludeConversations: false,

    exportState: 'idle', // 'idle' | 'progress' | 'success' | 'failure' | 'retry' | 'permission_denied'
    exportMessage: '',
    exportResult: null, // { fileName, bytes, records, includeConversations }

    importFileName: '',
    importState: 'idle',
    importMessage: '',
    importReport: null,
    importPerCollection: [],
    importConfirmVisible: false,
    pendingImportArchive: null,

    deleteStep: 0, // 0 = idle, 1 = preparing fresh export, 2 = receipt ready, 3 = confirmation
    deleteState: 'idle',
    deleteMessage: '',
    deleteReceipt: null, // { archiveBytes, archiveRecordCount, archiveDigest, preparedAt, expiresAt, receiptId }
    deleteConfirmText: '',
    deleteExecuting: false,
    deleteCompleted: false,
    deleteLeftovers: [],
  },

  onLoad() {
    track.event('page_view', { page: 'settings' });
  },

  // ============================================================
  // 导出
  // ============================================================

  onToggleIncludeConversations() {
    this.setData({ optIncludeConversations: !this.data.optIncludeConversations });
  },

  async onExport() {
    this.setData({ exportState: 'progress', exportMessage: '', exportResult: null });
    const includeConversations = this.data.optIncludeConversations === true;
    const result = await archiveApi.exportPrivateArchive({ includeConversations });
    if (!archiveApi.isSuccess(result)) {
      this.setData({
        exportState: result.state || 'failure',
        exportMessage: friendlyMessage(result, '导出失败，请稍后再试'),
      });
      return;
    }
    const payload = result.payload || {};
    const archive = payload.archive;
    const serialized = payload.serialized || JSON.stringify(archive);
    const recordCount = (archive.memories || []).length
      + (archive.nowItems || []).length
      + ((archive.conversations && archive.conversations.items) || []).length
      + (archive.connectionRequests || []).length
      + (archive.contactMethods || []).length
      + (archive.attachments || []).length
      + (archive.knowledgeSources || []).length
      + (archive.profile ? 1 : 0)
      + (archive.card ? 1 : 0);
    const written = await this.writeArchiveToUserDir(serialized, includeConversations);
    if (!written.ok) {
      this.setData({
        exportState: 'failure',
        exportMessage: '归档已生成，但写入本地失败：' + written.message,
      });
      return;
    }
    this.setData({
      exportState: 'success',
      exportResult: {
        fileName: written.fileName,
        bytes: payload.archiveBytes || written.bytes,
        records: recordCount,
        includeConversations,
      },
      exportMessage: '',
    });
    track.event('archive_exported', {
      bytes: payload.archiveBytes || written.bytes,
      records: recordCount,
      includeConversations,
    });
  },

  /**
   * 把归档 JSON 写到用户目录（wx.env.USER_DATA_PATH），不在云函数返回的临时路径上落地，
   * 因为云函数返回的临时路径可能被运行环境清理。
   */
  writeArchiveToUserDir(serialized, includeConversations) {
    return new Promise((resolve) => {
      if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
        resolve({ ok: false, message: '当前环境不支持本地文件写入' });
        return;
      }
      const fsm = wx.getFileSystemManager();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `vibecard-${ts}${includeConversations ? '-with-conversations' : ''}.vibe`;
      const fullPath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      try {
        fsm.writeFileSync(fullPath, serialized, 'utf8');
        resolve({ ok: true, fileName, bytes: serialized.length, path: fullPath });
      } catch (err) {
        resolve({ ok: false, message: (err && err.errMsg) || '写入失败' });
      }
    });
  },

  // ============================================================
  // 导入
  // ============================================================

  onPickImportFile() {
    if (!wx.chooseMessageFile) {
      this.setData({ importState: 'failure', importMessage: '当前微信版本不支持选择文件' });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['vibe', 'json'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.path) {
          this.setData({ importState: 'failure', importMessage: '未选择文件' });
          return;
        }
        this.readImportFile(file);
      },
      fail: (err) => {
        this.setData({
          importState: 'failure',
          importMessage: '文件选择失败：' + ((err && err.errMsg) || '用户取消'),
        });
      },
    });
  },

  readImportFile(file) {
    const fsm = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fsm) {
      this.setData({ importState: 'failure', importMessage: '当前环境不支持文件读取' });
      return;
    }
    fsm.readFile({
      filePath: file.path,
      encoding: 'utf8',
      success: (res) => {
        let parsed;
        try {
          parsed = JSON.parse(res.data);
        } catch (err) {
          this.setData({ importState: 'failure', importMessage: '文件不是合法的 JSON' });
          return;
        }
        this.setData({
          importFileName: file.name || 'archive.vibe',
          pendingImportArchive: parsed,
          importReport: null,
          importPerCollection: [],
          importState: 'idle',
          importMessage: '',
          importConfirmVisible: true,
        });
      },
      fail: (err) => {
        this.setData({
          importState: 'failure',
          importMessage: '读取文件失败：' + ((err && err.errMsg) || '未知错误'),
        });
      },
    });
  },

  onCancelImportConfirm() {
    this.setData({ importConfirmVisible: false, pendingImportArchive: null });
  },

  async onConfirmImport() {
    const archive = this.data.pendingImportArchive;
    if (!archive) {
      this.setData({
        importState: 'failure',
        importMessage: '没有可导入的内容',
        importConfirmVisible: false,
      });
      return;
    }
    this.setData({ importConfirmVisible: false, importState: 'progress', importMessage: '' });
    const result = await archiveApi.importArchive(archive);
    if (!archiveApi.isSuccess(result)) {
      this.setData({
        importState: result.state || 'failure',
        importMessage: friendlyMessage(result, '导入失败'),
      });
      return;
    }
    const report = (result.payload && result.payload.report) || {};
    const perCollection = Object.keys(report.perCollection || {}).map((key) => ({
      key,
      label: SECTION_LABELS[key] || key,
      collection: report.perCollection[key].collection,
      created: report.perCollection[key].created,
      updated: report.perCollection[key].updated,
      skipped: report.perCollection[key].skipped,
    }));
    this.setData({
      importState: 'success',
      importReport: report.totals || { created: 0, updated: 0, skipped: 0 },
      importPerCollection: perCollection,
      pendingImportArchive: null,
    });
    track.event('archive_imported', { totals: report.totals });
  },

  // ============================================================
  // 删除全部
  // ============================================================

  /**
   * Step 1: 让 cloud 先做一份新的归档 + 写一份 5 分钟有效的删除授权 receipt。
   * 客户端必须保留 receipt（archiveDigest / preparedAt / receiptId），下一步用它们证明
   * 「我确实刚刚做过新的归档」。
   */
  async onDeleteStep1() {
    this.setData({ deleteStep: 1, deleteState: 'progress', deleteMessage: '' });
    const includeConversations = this.data.optIncludeConversations === true;
    const result = await archiveApi.prepareDeleteAll({ includeConversations });
    if (!archiveApi.isSuccess(result)) {
      this.setData({
        deleteState: result.state || 'failure',
        deleteMessage: friendlyMessage(result, '生成归档失败'),
        deleteStep: 0,
      });
      return;
    }
    const payload = result.payload || {};
    // 顺手把本地归档保存下来，让用户在确认删除前下载一份。
    let savedPath = null;
    try {
      const written = await this.writeArchiveToUserDir(payload.serialized || JSON.stringify(payload.archive), includeConversations);
      if (written && written.ok) savedPath = written.path;
    } catch (err) {
      savedPath = null;
    }
    this.setData({
      deleteStep: 2,
      deleteState: 'success',
      deleteReceipt: {
        archiveBytes: payload.archiveBytes,
        archiveRecordCount: payload.archiveRecordCount,
        archiveDigest: payload.archiveDigest,
        preparedAt: payload.preparedAt,
        expiresAt: payload.expiresAt,
        receiptId: payload.receiptId,
        serialized: payload.serialized,
        includeConversations,
        savedPath,
      },
      deleteMessage: '',
    });
    track.event('archive_delete_prepared', {
      bytes: payload.archiveBytes,
      records: payload.archiveRecordCount,
    });
  },

  onDownloadPreDeleteBackup() {
    const receipt = this.data.deleteReceipt;
    if (!receipt || !receipt.serialized) {
      wx.showToast({ title: '没有可下载的归档', icon: 'none' });
      return;
    }
    this.writeArchiveToUserDir(receipt.serialized, !!receipt.includeConversations)
      .then((written) => {
        if (written && written.ok) {
          wx.showToast({ title: '已保存：' + written.fileName, icon: 'none' });
        } else {
          wx.showToast({ title: '写入失败', icon: 'none' });
        }
      });
  },

  onDeleteConfirmInput(e) {
    this.setData({ deleteConfirmText: e.detail.value || '' });
  },

  async onDeleteStep3() {
    if (this.data.deleteConfirmText !== 'DELETE') {
      wx.showToast({ title: '请先输入 DELETE', icon: 'none' });
      return;
    }
    if (!this.data.deleteReceipt) {
      this.setData({ deleteStep: 1, deleteState: 'failure', deleteMessage: '没有可用的归档授权' });
      return;
    }
    this.setData({ deleteExecuting: true, deleteState: 'progress', deleteMessage: '', deleteStep: 3 });
    const confirmation = {
      id: this.data.deleteReceipt.receiptId,
      archiveDigest: this.data.deleteReceipt.archiveDigest,
      preparedAt: this.data.deleteReceipt.preparedAt,
    };
    const result = await archiveApi.deleteAll(confirmation);
    this.setData({ deleteExecuting: false });
    if (archiveApi.isPartialCleanup(result)) {
      const leftovers = Object.keys(result.leftovers || {}).map((key) => ({
        collection: key,
        count: (result.leftovers[key] || []).length,
        ids: (result.leftovers[key] || []).slice(0, 8).join(', ')
          + ((result.leftovers[key] || []).length > 8 ? ' …' : ''),
      }));
      this.setData({
        deleteState: 'partial_cleanup',
        deleteLeftovers: leftovers,
        deleteMessage: friendlyMessage(result, '部分记录残留，请重试或联系我们'),
        deleteCompleted: false,
      });
      track.event('archive_delete_partial', { leftoverCollections: leftovers.map((l) => l.collection) });
      return;
    }
    if (!archiveApi.isSuccess(result)) {
      this.setData({
        deleteState: result.state || 'failure',
        deleteMessage: friendlyMessage(result, '删除未执行，请稍后再试'),
        deleteCompleted: false,
      });
      return;
    }
    this.setData({
      deleteState: 'success',
      deleteCompleted: true,
      deleteMessage: '云端你的所有数据已清理；公共名片已收回。',
    });
    track.event('archive_deleted', {});
  },

  noop() {},
});

/**
 * Map a normalised archive envelope to a Chinese UI string. Network / retry
 * failures share one copy; permission / schema failures share another. We
 * never show the raw cloud error to the owner — the wrapper code stays in
 * the result.code field for diagnostics, while the message is localised.
 */
function friendlyMessage(result, fallback) {
  if (!result) return fallback;
  if (result.state === 'retry') return '云函数暂时连不上，请稍后重试';
  if (result.state === 'permission_denied') return '权限不足：' + (result.message || '请确认你登录的是当前 OPENID');
  if (result.state === 'partial_cleanup') return '部分记录未能删除，需要人工对账';
  return result.message || fallback;
}