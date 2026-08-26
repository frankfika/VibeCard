import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { TEXT_STRUCTURED_CAPABILITIES, vibeFixtures } from '../../shared/index';
import type { CompletionInput, ModelProvider } from '../../shared/index';
import { fixturePrivateArchive, owner, startApp } from './helpers';
import type { RunningApp } from './helpers';

const PRIVATE_FRAGMENT = '晚上十点以后不回复任何工作消息';
const BOUNDARY_FRAGMENT = '不想回应没有具体理由的合作邀请';
const CONNECTED_FRAGMENT = '尚未公开';
const PUBLIC_FRAGMENT = '最近在打磨 VibeCard 的访客对话';

let app: RunningApp;
const cardDraftPrompts: string[] = [];

const adversarialProvider: ModelProvider = {
  name: 'card-draft-privacy-probe',
  capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
  async complete(input: CompletionInput) {
    const system = input.system ?? '';
    cardDraftPrompts.push(system);
    const leaked = [PRIVATE_FRAGMENT, BOUNDARY_FRAGMENT, CONNECTED_FRAGMENT].find(fragment => system.includes(fragment));
    return JSON.stringify({
      currentFocus: leaked ? `LEAK:${leaked}` : '只使用公开记忆生成的安全草稿',
      keptFields: [],
    });
  },
};

before(async () => {
  app = await startApp({ provider: adversarialProvider });
  const imported = await owner(app.base, 'POST', '/api/v1/owner/import', { archive: fixturePrivateArchive() });
  assert.equal(imported.status, 200);
});

after(async () => app.close());

test('ordinary Card draft filters every non-public and boundary memory before model invocation', async () => {
  const response = await owner(app.base, 'POST', '/api/v1/owner/card/draft', {});
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.draft.currentFocus, '只使用公开记忆生成的安全草稿');
  const prompt = cardDraftPrompts.at(-1) ?? '';
  assert.match(prompt, new RegExp(PUBLIC_FRAGMENT));
  assert.doesNotMatch(prompt, new RegExp(PRIVATE_FRAGMENT));
  assert.doesNotMatch(prompt, new RegExp(BOUNDARY_FRAGMENT));
  assert.doesNotMatch(prompt, new RegExp(CONNECTED_FRAGMENT));
});

test('first-run scope uses only selected confirmed public ids, even when private ids are supplied', async () => {
  const publicId = vibeFixtures.fixtureOwnerMemories.find(memory => memory.id === 'fixture-memory-public-focus')!.id;
  const boundaryId = vibeFixtures.fixtureOwnerMemories.find(memory => memory.id === 'fixture-memory-agent-boundary')!.id;
  const privateId = vibeFixtures.fixtureOwnerSensitiveMemories.find(memory => memory.visibility === 'private')!.id;
  const connectedId = vibeFixtures.fixtureOwnerSensitiveMemories.find(memory => memory.visibility === 'connected')!.id;
  const response = await owner(app.base, 'POST', '/api/v1/owner/card/draft', {
    memoryIds: [publicId, boundaryId, privateId, connectedId, 'not-owned-or-missing'],
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.draft.currentFocus, '只使用公开记忆生成的安全草稿');
  const prompt = cardDraftPrompts.at(-1) ?? '';
  assert.match(prompt, new RegExp(PUBLIC_FRAGMENT));
  assert.doesNotMatch(prompt, new RegExp(PRIVATE_FRAGMENT));
  assert.doesNotMatch(prompt, new RegExp(BOUNDARY_FRAGMENT));
  assert.doesNotMatch(prompt, new RegExp(CONNECTED_FRAGMENT));
});

test('a scope containing only private or boundary memories cannot invoke the model', async () => {
  const beforeCalls = cardDraftPrompts.length;
  const response = await owner(app.base, 'POST', '/api/v1/owner/card/draft', {
    memoryIds: ['fixture-memory-agent-boundary', 'fixture-memory-private-health-note'],
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'no_confirmed_memories');
  assert.equal(cardDraftPrompts.length, beforeCalls);
});
