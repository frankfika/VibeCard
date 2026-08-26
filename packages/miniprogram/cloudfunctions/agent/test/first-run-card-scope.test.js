const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const { filterPublicCardDraftMemories } = require('../lib/card-draft-scope');
const { runCardDraft } = require('../lib/agent');

test('first-run current + private boundary: boundary never reaches Card-draft model context', async () => {
  const records = [
    { _id: 'mem-current', status: 'confirmed', visibility: 'public', kind: 'current', content: '最近在做一个无障碍产品' },
    { _id: 'mem-boundary', status: 'confirmed', visibility: 'private', kind: 'boundary', content: '绝密住址是梧桐路 99 号' },
    { _id: 'mem-agent', status: 'confirmed', visibility: 'agent_only', kind: 'preference', content: '不公开的合作偏好' },
  ];
  const filtered = filterPublicCardDraftMemories(records, ['mem-current', 'mem-boundary', 'mem-agent']);
  assert.deepEqual(filtered.map(memory => memory._id), ['mem-current']);

  let seenSystem = '';
  const provider = {
    async complete({ system }) {
      seenSystem = system;
      return JSON.stringify({ currentFocus: '最近在做一个无障碍产品' });
    },
  };
  const outcome = await runCardDraft({ provider, memories: filtered, currentCard: {} });
  assert.equal(outcome.ok, true);
  assert.match(seenSystem, /无障碍产品/);
  assert.doesNotMatch(seenSystem, /梧桐路 99 号|不公开的合作偏好/);
  assert.doesNotMatch(JSON.stringify(outcome.result.draft), /梧桐路 99 号|不公开的合作偏好/);
});

test('first-run allowlist cannot select proposed or non-public memories', () => {
  const records = [
    { _id: 'public-proposed', status: 'proposed', visibility: 'public' },
    { _id: 'private-confirmed', status: 'confirmed', visibility: 'private' },
    { _id: 'public-confirmed', status: 'confirmed', visibility: 'public' },
  ];
  assert.deepEqual(
    filterPublicCardDraftMemories(records, records.map(record => record._id)).map(record => record._id),
    ['public-confirmed'],
  );
});

test('function entry queries public visibility for first-run while ordinary 1.4 keeps owner scope', async () => {
  const whereCalls = [];
  const allRecords = [
    { _id: 'mem-current', ownerId: 'owner-1', status: 'confirmed', visibility: 'public', kind: 'current', content: '公开当下' },
    { _id: 'mem-boundary', ownerId: 'owner-1', status: 'confirmed', visibility: 'private', kind: 'boundary', content: '绝密边界' },
  ];
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext() { return { OPENID: 'owner-1' }; },
    database() {
      return {
        collection(name) {
          assert.equal(name, 'memories');
          return {
            where(query) {
              whereCalls.push(query);
              return {
                async get() {
                  return {
                    data: allRecords.filter(record => Object.entries(query).every(([key, value]) => record[key] === value)),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, ...rest) {
    if (request === 'wx-server-sdk') return fakeCloud;
    return originalLoad.call(this, request, ...rest);
  };
  const indexPath = require.resolve('../index.js');
  delete require.cache[indexPath];
  const entry = require(indexPath);
  Module._load = originalLoad;

  const firstRun = await entry.main({
    action: 'generateCardDraft',
    cardDraftScope: 'public_only',
    memoryIds: ['mem-current', 'mem-boundary'],
    currentCard: {},
  });
  assert.equal(firstRun.ok, true);
  assert.deepEqual(whereCalls[0], { ownerId: 'owner-1', status: 'confirmed', visibility: 'public' });

  const ordinary = await entry.main({ action: 'generateCardDraft', currentCard: {} });
  assert.equal(ordinary.ok, true);
  assert.deepEqual(whereCalls[1], { ownerId: 'owner-1', status: 'confirmed' });
});
