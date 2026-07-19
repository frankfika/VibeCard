const test = require('node:test');
const assert = require('node:assert/strict');
const { checkTextWithRetry, gateStrangerContent } = require('../lib/core');

function openapiReturning(behavior) {
  let calls = 0;
  return {
    get calls() { return calls; },
    security: {
      async msgSecCheck() {
        calls += 1;
        return behavior(calls);
      },
    },
  };
}

test('safe content passes', async () => {
  const api = openapiReturning(() => ({ errCode: 0 }));
  const result = await checkTextWithRetry(api, '你好');
  assert.equal(result.status, 'safe');
  assert.equal(result.safe, true);
  assert.equal(api.calls, 1);
});

test('unsafe fixture is blocked (errCode 87014 as result and as throw)', async () => {
  const asResult = openapiReturning(() => ({ errCode: 87014 }));
  assert.equal((await checkTextWithRetry(asResult, 'bad')).status, 'unsafe');

  const asThrow = openapiReturning(() => { const e = new Error('unsafe'); e.errCode = 87014; throw e; });
  const result = await checkTextWithRetry(asThrow, 'bad');
  assert.equal(result.status, 'unsafe');
  assert.equal(result.safe, false);
});

test('transient failure is retried and eventually succeeds', async () => {
  const api = openapiReturning((call) => {
    if (call < 3) { const e = new Error('busy'); e.errCode = -1; throw e; }
    return { errCode: 0 };
  });
  const result = await checkTextWithRetry(api, 'ok', { backoffMs: 1 });
  assert.equal(result.status, 'safe');
  assert.equal(api.calls, 3);
});

test('persistent failure returns unavailable, never defaults to safe', async () => {
  const api = openapiReturning(() => { const e = new Error('busy'); e.errCode = -1; throw e; });
  const result = await checkTextWithRetry(api, 'anything', { backoffMs: 1 });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.safe, null);
  assert.match(result.message, /unavailable/);
});

test('network-level error (no errCode) is transient, then unavailable', async () => {
  const api = openapiReturning(() => { throw new Error('socket hangup'); });
  const result = await checkTextWithRetry(api, 'anything', { retries: 1, backoffMs: 1 });
  assert.equal(result.status, 'unavailable');
  assert.equal(api.calls, 2);
});

test('gate: safe proceeds, unsafe blocks, unavailable blocks retryably', () => {
  assert.deepEqual(gateStrangerContent({ status: 'safe' }), { allowed: true });
  assert.equal(gateStrangerContent({ status: 'unsafe' }).code, 'moderation_blocked');
  const unavailable = gateStrangerContent({ status: 'unavailable' });
  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.code, 'moderation_unavailable');
});

test('empty content is a programming error, not a moderation pass', async () => {
  const api = openapiReturning(() => ({ errCode: 0 }));
  await assert.rejects(checkTextWithRetry(api, '   '), /content_required/);
});
