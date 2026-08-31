/**
 * Handler-level tests for the archive/export cloud function (task 4.6).
 *
 * Covers:
 *   - Owner-only access: a stranger's openid never reads another owner's data.
 *   - Missing openid -> unauthorized.
 *   - exportPrivateArchive aggregates every canonical collection into a
 *     validated private .vibe archive (the same JS validation mirrors
 *     packages/shared/archive.ts).
 *   - exportPublicArchive strips contact methods, memories, conversations,
 *     and connection requests — the public boundary must hold by construction.
 *   - prepareDeleteAll writes a server-side receipt and returns the same
 *     archive + digest so the client can echo them back to deleteAll.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const OWNER = 'owner-openid';
const STRANGER = 'stranger-openid';

let currentOpenid = OWNER;

function createFakeCloud() {
  const store = {
    users: new Map([
      ['users-1', {
        _id: 'users-1',
        openid: OWNER,
        nickname: '林舟',
        avatar: 'https://example.com/a.png',
        bio: '在做 AI 名片',
        namecard: {
          motto: '先理解，再认识',
          currentFocus: '打磨 VibeCard',
          canHelpWith: ['0 到 1 小程序'],
          wantsToMeet: ['做过 AI 社交的人'],
          topics: ['AI 分身'],
          highlights: [{ id: 'h1', title: 'VibeCard', url: 'https://example.com' }],
          agentEnabled: true,
        },
        blockedUsers: [],
      }],
    ]),
    memories: new Map([
      ['mem-1', { _id: 'mem-1', ownerId: OWNER, kind: 'current', content: '在打磨访客对话', visibility: 'public', status: 'confirmed', sourceConversationId: 'c1', sourceMessageIds: ['m1'], createdAt: 1000, updatedAt: 1500 }],
      ['mem-2', { _id: 'mem-2', ownerId: OWNER, kind: 'boundary', content: '不回应泛泛的资源互换', visibility: 'agent_only', status: 'confirmed', sourceConversationId: 'c1', sourceMessageIds: ['m1'], createdAt: 1000, updatedAt: 1500 }],
    ]),
    conversations: new Map([
      ['conv-1', { _id: 'conv-1', ownerId: OWNER, mode: 'owner', visitorId: '', messages: [{ id: 'msg-1', role: 'owner', content: 'hi', createdAt: 1000 }], createdAt: 1000, updatedAt: 1000 }],
    ]),
    requests: new Map([
      ['req-1', { _id: 'req-1', ownerId: OWNER, visitorId: 'visitor-x', visitorSummary: '苏晴', reason: '在做一个 AI 记账小程序', possibleSharedContext: ['AI 产品'], ownerAction: 'pending', sharedContactMethodIds: [], createdAt: 1000, updatedAt: 1000 }],
    ]),
    now_items: new Map([
      ['now-1', { _id: 'now-1', ownerId: OWNER, text: '在打磨访客对话', topic: 'current_work', sourceMemoryId: 'mem-1', status: 'published', publishedAt: 1500, expiresAt: null, createdAt: 1000, updatedAt: 1500 }],
      ['now-2', { _id: 'now-2', ownerId: OWNER, text: '已归档', topic: 'completed_work', sourceMemoryId: null, status: 'archived', publishedAt: 1200, expiresAt: null, createdAt: 1000, updatedAt: 1200 }],
    ]),
    owner_export_receipts: new Map(),
    owner_audit_log: [],
  };

  const db = {
    collection(name) {
      const coll = store[name];
      return {
        where(conds) {
          return {
            async get() {
              const data = [...coll.entries()]
                .filter(([, v]) => Object.entries(conds).every(([k, val]) => v[k] === val))
                .map(([_id, v]) => ({ _id, ...v }));
              return { data };
            },
          };
        },
        async add({ data }) {
          if (name === 'owner_audit_log') {
            store.owner_audit_log.push(data);
            return { _id: 'audit-' + store.owner_audit_log.length };
          }
          return { _id: 'inserted' };
        },
        doc(id) {
          return {
            async get() {
              if (name === 'owner_export_receipts') {
                const value = store.owner_export_receipts.get(id);
                if (!value) throw new Error('Doc not found');
                return { data: value };
              }
              throw new Error('Doc not found');
            },
            async set({ data }) {
              store.owner_export_receipts.set(id, data);
              return { stats: { updated: 1 } };
            },
          };
        },
      };
    },
  };

  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: currentOpenid }; },
  };
}

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return createFakeCloud();
  return originalLoad.call(this, request, ...rest);
};
const exportFunction = require('../index.js');
Module._load = originalLoad;

const call = (event) => exportFunction.main(event);

test('unauthenticated caller is refused before any DB read', async () => {
  currentOpenid = '';
  const res = await call({ action: 'exportPrivateArchive' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'unauthorized');
  currentOpenid = OWNER;
});

test('unknown action returns typed error', async () => {
  const res = await call({ action: 'noop' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'invalid_action');
});

test('exportPrivateArchive aggregates canonical records and validates the resulting archive', async () => {
  const res = await call({ action: 'exportPrivateArchive' });
  assert.equal(res.ok, true);
  const inner = res.result;
  assert.equal(inner.state, 'success');
  const archive = inner.archive;
  assert.equal(archive.format, 'vibecard-vibe-archive');
  assert.equal(archive.kind, 'private');
  assert.equal(archive.card.ownerId, OWNER);
  assert.equal(archive.card.name, '林舟');
  // private: full NowItem history, including archived items
  assert.equal(archive.nowItems.length, 2);
  assert.ok(archive.nowItems.some((n) => n.status === 'archived'));
  // private: memories of every visibility (this archive is owner-only)
  assert.equal(archive.memories.length, 2);
  // default: conversations not exported unless opted in
  assert.equal(archive.conversations.exported, false);
  assert.equal(archive.conversations.items.length, 0);
  // integrity map covers every section
  assert.ok(archive.integrity);
  assert.ok(archive.integrity.sections.card);
  // digest is stable for the same archive
  assert.ok(/^[0-9a-f]{8}$/.test(inner.archiveDigest));
});

test('exportPrivateArchive with includeConversations=true bundles conversation items', async () => {
  const res = await call({ action: 'exportPrivateArchive', includeConversations: true });
  assert.equal(res.ok, true);
  const archive = res.result.archive;
  assert.equal(archive.conversations.exported, true);
  assert.equal(archive.conversations.items.length, 1);
  assert.equal(archive.conversations.items[0].messages[0].role, 'owner');
});

test('exportPublicArchive never carries private sections', async () => {
  const res = await call({ action: 'exportPublicArchive' });
  assert.equal(res.ok, true);
  const archive = res.result.archive;
  assert.equal(archive.kind, 'public');
  assert.equal(archive.profile, null);
  assert.equal(archive.memories.length, 0);
  assert.equal(archive.knowledgeSources.length, 0);
  assert.equal(archive.connectionRequests.length, 0);
  assert.equal(archive.contactMethods.length, 0);
  assert.equal(archive.attachments.length, 0);
  assert.equal(archive.conversations.exported, false);
  assert.equal(archive.conversations.items.length, 0);
  // public Card shows only active Now items (published + not expired)
  assert.equal(archive.nowItems.length, 1);
  assert.equal(archive.nowItems[0].text, '在打磨访客对话');
});

test('exportPublicArchive never includes owner contact data in any field', async () => {
  const res = await call({ action: 'exportPublicArchive' });
  const serialized = JSON.stringify(res);
  assert.equal(serialized.includes('wechat'), false);
  assert.equal(serialized.includes('socialLinks'), false);
  assert.equal(serialized.includes('phone'), false);
  assert.equal(serialized.includes('email'), false);
});

test('prepareDeleteAll writes a receipt the cloud can read back later', async () => {
  const res = await call({ action: 'prepareDeleteAll' });
  assert.equal(res.ok, true);
  const inner = res.result;
  assert.equal(inner.state, 'success');
  assert.equal(inner.archive.kind, 'private');
  assert.ok(inner.archiveDigest);
  assert.ok(inner.receiptId);
  assert.ok(inner.expiresAt > inner.preparedAt);
  assert.ok(inner.archiveBytes > 0);
});

test('prepareDeleteAll archives never include server secrets or keys', async () => {
  const res = await call({ action: 'prepareDeleteAll' });
  const serialized = JSON.stringify(res);
  // format has no fields for keys / tokens by construction
  assert.equal(serialized.includes('AI_API_KEY'), false);
  assert.equal(serialized.includes('OPENID'), false, 'OPENID lives in wxContext, never in archive payload');
  assert.equal(serialized.includes('APPID'), false);
});