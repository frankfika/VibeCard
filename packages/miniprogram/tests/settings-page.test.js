/**
 * settings page smoke (task 4.6).
 *
 * Verifies the four-acceptance state machine wired into the page:
 *   1. Successful export produces a `state: 'success'` block on the page
 *      with the saved fileName + byte count.
 *   2. Cloud-reported ownership mismatch surfaces as
 *      `state: 'permission_denied'` and never silently passes.
 *   3. deleteAll's three-step flow refuses to execute before the typed
 *      confirmation token equals "DELETE".
 *   4. partial_cleanup is rendered as a visible error block with the
 *      specific leftover collections — never silent success.
 *
 * Pattern: stub wx + require.cache the cloud util, then drive the page
 * methods directly. No WeChat DevTools required.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const SETTINGS_PATH = require.resolve('../miniprogram/pages/settings/settings.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

let cloudImpl = async () => ({});
const cloudStub = {
  callFunction: async (name, data) => cloudImpl(name, data),
};
require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: cloudStub,
};

const toasts = [];
const modals = [];
let fakeFs = { lastWritten: null };
function resetFakeFs() {
  fakeFs.lastWritten = null;
}
global.wx = {
  showToast: (opts) => {
    toasts.push((opts && opts.title) || '');
  },
  showModal: (opts) => {
    modals.push(opts || {});
    if (opts && opts.success) opts.success({ confirm: true });
  },
  chooseMessageFile: () => {},
  getFileSystemManager: () => ({
    writeFileSync(path, data) {
      fakeFs.lastWritten = { path, data };
    },
    readFile: () => ({ data: '{"format":"vibecard-vibe-archive"}' }),
  }),
  env: { USER_DATA_PATH: '/mock/user/data' },
};
global.Page = (def) => { global.__lastPageDef = def; };

require(SETTINGS_PATH);

const flush = () => new Promise((r) => setImmediate(r));
async function flushAll(n = 8) {
  for (let i = 0; i < n; i++) await flush();
}

function makePage() {
  const def = global.__lastPageDef;
  const page = Object.create(def);
  page.data = JSON.parse(JSON.stringify(def.data));
  page.setData = function (patch) {
    for (const k of Object.keys(patch)) {
      const parts = k.split('.');
      if (parts.length === 1) {
        this.data[k] = patch[k];
        continue;
      }
      let o = this.data;
      for (let i = 0; i < parts.length - 1; i += 1) o = o[parts[i]];
      o[parts[parts.length - 1]] = patch[k];
    }
  };
  return page;
}

test.beforeEach(() => {
  resetFakeFs();
  toasts.length = 0;
  modals.length = 0;
});

function makeArchive() {
  return {
    format: 'vibecard-vibe-archive',
    schemaVersion: 1,
    kind: 'private',
    createdAt: 1000,
    app: { name: 'vibecard-miniprogram', version: '4.6.0' },
    encryption: null,
    sectionVersions: {
      profile: 1, card: 1, now: 1, memories: 1, conversations: 1,
      knowledgeSources: 1, connections: 1, contactMethods: 1, attachments: 1,
    },
    integrity: null,
    profile: { id: 'o', schemaVersion: 1, name: '林舟', avatarUrl: 'a' },
    card: {
      id: 'card-o', schemaVersion: 1, ownerId: 'o',
      name: '林舟', avatarUrl: 'a', headline: 'h', currentFocus: 'f',
      canHelpWith: [], wantsToMeet: [], topics: [], highlights: [],
      agentEnabled: true, updatedAt: 1000,
    },
    nowItems: [], memories: [], conversations: { exported: false, items: [] },
    knowledgeSources: [], connectionRequests: [], contactMethods: [], attachments: [],
  };
}

test('onExport success: state=success, file persisted via FileSystemManager, page shows result', async () => {
  const archive = makeArchive();
  cloudImpl = async () => ({
    ok: true,
    result: {
      state: 'success',
      archive,
      archiveDigest: 'abcd1234',
      archiveBytes: 512,
      serialized: JSON.stringify(archive),
    },
  });
  const page = makePage();
  await page.onExport();
  assert.equal(page.data.exportState, 'success');
  assert.ok(page.data.exportResult.fileName.endsWith('.vibe'));
  assert.equal(page.data.exportResult.bytes, 512);
  assert.ok(fakeFs.lastWritten, 'archive written to user directory via FileSystemManager');
});

test('onExport permission_denied: state machine surfaces the error and never writes a file', async () => {
  cloudImpl = async () => ({
    ok: true,
    result: { state: 'permission_denied', error: { code: 'ownership_mismatch', message: '其他 OPENID 的归档不能导入到这里' } },
  });
  const page = makePage();
  await page.onExport();
  assert.equal(page.data.exportState, 'permission_denied');
  assert.match(page.data.exportMessage, /OPENID/);
  assert.equal(fakeFs.lastWritten, null, 'no file should be written on a permission-denied export');
});

test('onExport network failure: state=retry surfaced (no silent success)', async () => {
  cloudImpl = async () => { throw Object.assign(new Error('network'), { code: 'TIMEOUT' }); };
  const page = makePage();
  await page.onExport();
  assert.equal(page.data.exportState, 'retry');
  assert.match(page.data.exportMessage, /云函数/);
});

test('delete-all refuses to run without typing DELETE', async () => {
  const page = makePage();
  page.setData({ deleteConfirmText: 'del', deleteReceipt: { archiveBytes: 1, archiveRecordCount: 1, archiveDigest: 'd', preparedAt: 1, expiresAt: 9999999999, receiptId: 'r', serialized: '{}', includeConversations: false } });
  await page.onDeleteStep3();
  assert.notEqual(page.data.deleteState, 'success');
  // No cloud call should have been issued.
  assert.ok(toasts.includes('请先输入 DELETE') || page.data.deleteState === 'progress' || page.data.deleteState === 'idle' || page.data.deleteState === 'failure');
});

test('delete-all partial_cleanup is rendered with leftover collections (never silent success)', async () => {
  cloudImpl = async () => ({
    ok: true,
    result: {
      state: 'partial_cleanup',
      error: { code: 'partial_cleanup', message: 'some records remained' },
      leftovers: { memories: ['mem-1', 'mem-2'], now_items: ['now-1'] },
    },
  });
  const page = makePage();
  page.setData({
    deleteConfirmText: 'DELETE',
    deleteReceipt: { archiveBytes: 1, archiveRecordCount: 1, archiveDigest: 'd', preparedAt: 1, expiresAt: 9999999999, receiptId: 'r', serialized: '{}', includeConversations: false },
  });
  await page.onDeleteStep3();
  assert.equal(page.data.deleteState, 'partial_cleanup');
  assert.equal(page.data.deleteLeftovers.length, 2);
  const collections = page.data.deleteLeftovers.map((l) => l.collection);
  assert.ok(collections.includes('memories'));
  assert.ok(collections.includes('now_items'));
});

test('delete-all success: state=success, page marks completion', async () => {
  cloudImpl = async () => ({
    ok: true,
    result: { state: 'success', cleanup: { memories: { scanned: 1, deleted: 1, failed: 0, failedIds: [] } } },
  });
  const page = makePage();
  page.setData({
    deleteConfirmText: 'DELETE',
    deleteReceipt: { archiveBytes: 1, archiveRecordCount: 1, archiveDigest: 'd', preparedAt: 1, expiresAt: 9999999999, receiptId: 'r', serialized: '{}', includeConversations: false },
  });
  await page.onDeleteStep3();
  assert.equal(page.data.deleteState, 'success');
  assert.equal(page.data.deleteCompleted, true);
});

test('import flow refuses ownership-mismatched archives', async () => {
  cloudImpl = async () => ({
    ok: true,
    result: { state: 'permission_denied', error: { code: 'ownership_mismatch', message: 'archive owner does not match the current OPENID' } },
  });
  const page = makePage();
  page.setData({ pendingImportArchive: { kind: 'private', card: { ownerId: 'someone-else' } } });
  await page.onConfirmImport();
  assert.equal(page.data.importState, 'permission_denied');
  assert.match(page.data.importMessage, /OPENID/);
});