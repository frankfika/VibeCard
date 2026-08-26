import test from 'node:test';
import assert from 'node:assert/strict';
import { VibeApiError, VibeClient } from '../src/index.ts';
import { runOwnerExample, runVisitorExample } from '../examples/client-flows.ts';

const card = { id: 'card-1', schemaVersion: 1, ownerId: 'owner-1', name: 'Example', avatarUrl: '', headline: '', currentFocus: '', canHelpWith: [], wantsToMeet: [], topics: [], highlights: [], agentEnabled: true, updatedAt: 1 };
const publicCard = { ...card, now: [] };
const memory = { id: 'memory-1', schemaVersion: 1, ownerId: 'owner-1', kind: 'fact', content: 'confirmed text', visibility: 'private', status: 'confirmed', sourceConversationId: 'conversation-1', sourceMessageIds: [], createdAt: 1, updatedAt: 1 };
const nowItem = { id: 'now/1', schemaVersion: 1, ownerId: 'owner-1', text: 'building', topic: 'current_work', sourceMemoryId: null, status: 'draft', publishedAt: null, expiresAt: null, createdAt: 1, updatedAt: 1 };
const contact = { id: 'contact-1', schemaVersion: 1, ownerId: 'owner-1', kind: 'email', value: 'owner@example.test', label: 'Email', createdAt: 1, updatedAt: 1 };

test('SDK maps canonical public and owner calls without leaking provider fields', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/card') ? { ...publicCard, provider: 'leak', _id: 'db-row', contactMethods: ['secret'] } : { ...memory, provider: 'leak', _id: 'db-row' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = new VibeClient({ endpoint: 'https://vibe.example.test/', ownerToken: 'owner-token', fetch: fetcher });
  const projectedCard = await client.publicCard();
  const projectedMemory = await client.confirmMemory('memory-1', 'confirmed text');
  assert.equal(calls[0].url, 'https://vibe.example.test/api/v1/public/card');
  assert.equal((calls[1].init?.headers as Headers).get('authorization'), 'Bearer owner-token');
  assert.equal(String(calls[1].init?.body), JSON.stringify({ content: 'confirmed text' }));
  assert.equal(String(calls[1].init?.body).includes('provider'), false);
  assert.equal('provider' in projectedCard, false);
  assert.equal('_id' in projectedCard, false);
  assert.equal('contactMethods' in projectedCard, false);
  assert.equal('provider' in projectedMemory, false);
});

test('Now lifecycle uses canonical owner routes and a rotating auth adapter', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let tokenReads = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/card') ? publicCard : url.includes('?status=') ? [nowItem] : nowItem), { status: 200 });
  };
  const client = new VibeClient({
    endpoint: 'https://vibe.example.test',
    auth: { getToken: () => `rotating-${++tokenReads}` },
    fetch: fetcher,
  });

  await client.publicCard();
  await client.listNow('draft');
  await client.createNowDraft({ text: 'building', topic: 'current_work' });
  await client.publishNow('now/1');
  await client.archiveNow('now/1');
  await client.hideNow('now/1');
  await client.deleteNow('now/1');

  assert.equal(tokenReads, 6, 'public calls must not resolve owner credentials');
  assert.equal((calls[0].init?.headers as Headers).has('authorization'), false);
  assert.equal(calls[1].url, 'https://vibe.example.test/api/v1/owner/now?status=draft');
  assert.equal((calls[1].init?.headers as Headers).get('authorization'), 'Bearer rotating-1');
  assert.equal(calls[3].url.endsWith('/api/v1/owner/now/now%2F1/publish'), true);
  assert.equal(calls[6].init?.method, 'DELETE');
});

test('the same owner and visitor examples use managed namespaces without leaking auth publicly', async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, authorization: (init?.headers as Headers).get('authorization') });
    const data = url.endsWith('/now')
      ? { ...nowItem, id: 'now-managed' }
      : url.endsWith('/publish')
        ? { ...nowItem, id: 'now-managed', status: 'published', publishedAt: 2 }
        : url.endsWith('/vibe/messages')
          ? { reply: '我记下了一条建议。', memoryProposalId: 'memory-managed' }
          : url.endsWith('/memories/memory-managed/confirm')
            ? { ...memory, id: 'memory-managed', status: 'confirmed' }
        : url.endsWith('/chat')
          ? { conversationId: 'conversation-1', reply: 'grounded reply' }
          : url.includes('/owner/card') ? card : publicCard;
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const namespace = { kind: 'managed' as const, accountId: 'account/1', cardSlug: 'owner card' };
  await runOwnerExample({ endpoint: 'https://cloud.example.test', namespace, auth: { getToken: () => 'managed-token' }, fetch: fetcher });
  await runVisitorExample({ endpoint: 'https://cloud.example.test', namespace, fetch: fetcher });

  assert.deepEqual(calls.map(call => call.url), [
    'https://cloud.example.test/api/v1/cloud/accounts/account%2F1/owner/card',
    'https://cloud.example.test/api/v1/cloud/accounts/account%2F1/owner/vibe/messages',
    'https://cloud.example.test/api/v1/cloud/accounts/account%2F1/owner/memories/memory-managed/confirm',
    'https://cloud.example.test/api/v1/cloud/accounts/account%2F1/owner/now',
    'https://cloud.example.test/api/v1/cloud/accounts/account%2F1/owner/now/now-managed/publish',
    'https://cloud.example.test/api/v1/cloud/cards/owner%20card/card',
    'https://cloud.example.test/api/v1/cloud/cards/owner%20card/chat',
  ]);
  assert.deepEqual(calls.map(call => call.authorization), [
    'Bearer managed-token', 'Bearer managed-token', 'Bearer managed-token', 'Bearer managed-token', 'Bearer managed-token', null, null,
  ]);
  assert.equal(JSON.stringify(calls).includes('provider'), false);
  assert.equal(JSON.stringify(calls).includes('database'), false);
});

test('visitor response enums are strict and malformed evidence cannot be silently dropped', async () => {
  for (const response of [
    { conversationId: 'conversation-1', reply: 'reply', nextAction: 'execute_owner_action' },
    { conversationId: 'conversation-1', reply: 'reply', evidenceRefs: 'not-an-array' },
  ]) {
    const client = new VibeClient({ endpoint: 'https://example.test', fetch: async () => new Response(JSON.stringify(response), { status: 200 }) });
    await assert.rejects(client.visitorChat('visitor-1', 'hello'), (error: unknown) => error instanceof VibeApiError && error.code === 'invalid_response');
  }
});

test('request inputs are projected onto canonical allowlists before transport', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const url = String(input);
    const data = url.endsWith('/requests')
      ? { id: 'request-1', ownerAction: 'pending' }
      : url.endsWith('/now') ? nowItem : contact;
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const client = new VibeClient({ endpoint: 'https://example.test', ownerToken: 'owner-token', fetch: fetcher });
  await client.submitConnectionRequest({ visitorId: 'visitor-1', reason: 'A specific reason that is long enough.', provider: 'leak', _id: 'row' } as never);
  await client.createNowDraft({ text: 'building', topic: 'current_work', provider: 'leak', contactMethods: ['secret'] } as never);
  await client.createContact({ kind: 'email', value: 'owner@example.test', label: 'Email', databaseRecord: { id: 1 } } as never);
  assert.deepEqual(bodies, [
    { visitorId: 'visitor-1', reason: 'A specific reason that is long enough.' },
    { text: 'building', topic: 'current_work' },
    { kind: 'email', value: 'owner@example.test', label: 'Email' },
  ]);
});

test('typed errors preserve status/code/retry metadata and auth modes cannot conflict', async () => {
  assert.throws(() => new VibeClient({ endpoint: 'https://example.test', ownerToken: 'static', auth: { getToken: () => 'session' } }), /not both/);
  const client = new VibeClient({ endpoint: 'https://example.test', fetch: async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } }), { status: 429, headers: { 'retry-after': '10' } }) });
  await assert.rejects(client.publicCard(), error => {
    assert.equal(error instanceof VibeApiError, true);
    assert.equal((error as VibeApiError).status, 429);
    assert.equal((error as VibeApiError).code, 'rate_limited');
    assert.equal((error as VibeApiError).retryAfter, '10');
    return true;
  });
});
