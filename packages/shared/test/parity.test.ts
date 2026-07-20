/**
 * Core tests: WeChat/Web parity (task 5.2).
 *
 * WeChat cloud functions are plain CommonJS and cannot import this TypeScript
 * package at deploy time, so `cloudfunctions/*\/lib/*.js` and
 * `miniprogram/utils/now.js` remain hand-maintained JS mirrors of the Core.
 * This suite runs BOTH implementations over the same fixture inputs and
 * asserts identical outputs, so any drift between the Core and the mirrors
 * fails loudly here instead of silently diverging in production.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  fixtureConnectionRequest,
  fixtureOwner,
  fixtureOwnerContactMethods,
  fixtureOwnerMemories,
  fixtureOwnerSensitiveMemories,
  fixtureV1UserProfile,
} from '../fixtures/vibe';
import { fixtureNowItems, fixtureNowReferenceNow } from '../fixtures/now';

import * as coreMemory from '../memory';
import * as coreVisibility from '../visibility';
import * as coreCard from '../public-card';
import * as coreNow from '../now';
import * as coreConnection from '../connection';
import * as coreSchema from '../agent-schema';
import * as coreMigration from '../migration';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const CF = (...parts: string[]) => require(join(HERE, '..', '..', 'miniprogram', ...parts));

const cfMemory = CF('cloudfunctions', 'memory', 'lib', 'core.js');
const cfCard = CF('cloudfunctions', 'card', 'lib', 'core.js');
const cfNow = CF('cloudfunctions', 'now', 'lib', 'core.js');
const cfRequests = CF('cloudfunctions', 'requests', 'lib', 'core.js');
const cfSchema = CF('cloudfunctions', 'agent', 'lib', 'schema.js');
const mpNow = CF('miniprogram', 'utils', 'now.js');

const NOW = fixtureNowReferenceNow;
const ALL_MEMORIES = [...fixtureOwnerMemories, ...fixtureOwnerSensitiveMemories];

/* ---------------------------------------------------------------------------
 * Memory rules
 * ------------------------------------------------------------------------- */

test('parity: memory payload validation', () => {
  const payloads = [
    null,
    {},
    { kind: 'fact', content: 'ok', visibility: 'public' },
    { kind: 'mood', content: 'x', visibility: 'public' },
    { kind: 'fact', content: ' ', visibility: 'public' },
    { kind: 'fact', content: 'x'.repeat(501), visibility: 'public' },
    { kind: 'fact', content: 'ok', visibility: 'friends' },
  ];
  for (const payload of payloads) {
    assert.equal(coreMemory.validateMemoryPayload(payload), cfMemory.validateMemoryPayload(payload));
    assert.equal(
      coreMemory.validateMemoryPayload(payload, { partial: true }),
      cfMemory.validateMemoryPayload(payload, { partial: true }),
    );
  }
});

test('parity: memory retrieval and visitor predicates', () => {
  for (const memory of ALL_MEMORIES) {
    assert.equal(coreMemory.isMemoryActive(memory), cfMemory.isRetrievable(memory));
    assert.equal(coreVisibility.isVisitorQuotable(memory), cfMemory.isVisitorQuotable(memory));
    assert.equal(
      coreVisibility.isVisitorQuotable(memory) || coreVisibility.isVisitorBoundaryUsable(memory),
      cfMemory.isAgentUsable(memory),
    );
  }
});

test('parity: memory build and lifecycle transitions', () => {
  const input = {
    ownerId: fixtureOwner.id,
    kind: 'preference',
    content: ' 先语音，再长聊。 ',
    visibility: 'private',
    sourceConversationId: 'conv-1',
    sourceMessageIds: ['m-1'],
  };
  const cfBuilt = cfMemory.buildMemory(input, NOW);
  const coreBuilt = coreMemory.buildProposedMemory(input, NOW, 'mem-1');
  const { id: _ignored, ...coreWithoutId } = coreBuilt;
  assert.deepEqual(coreWithoutId, cfBuilt);

  const confirmedCore = coreMemory.confirmMemory(coreBuilt, { content: '改过的内容' }, NOW + 1);
  const confirmedCf = cfMemory.applyConfirm(cfBuilt, { content: '改过的内容' }, NOW + 1);
  assert.deepEqual({ ...confirmedCore, id: undefined }, { ...confirmedCf, id: undefined });

  const editedCore = coreMemory.editMemory(confirmedCore, { kind: 'boundary' }, NOW + 2);
  const editedCf = cfMemory.applyEdit(confirmedCf, { kind: 'boundary' }, NOW + 2);
  assert.deepEqual({ ...editedCore, id: undefined }, { ...editedCf, id: undefined });

  assert.deepEqual(
    { ...coreMemory.deleteMemory(confirmedCore, NOW + 3), id: undefined },
    { ...cfMemory.applyDelete(confirmedCf, NOW + 3), id: undefined },
  );

  // Illegal transitions fail with the same coded error on both sides.
  let coreErr: { code?: string } | undefined;
  let cfErr: { code?: string } | undefined;
  try { coreMemory.confirmMemory(confirmedCore, {}, NOW + 4); } catch (e) { coreErr = e as Error; }
  try { cfMemory.applyConfirm(confirmedCf, {}, NOW + 4); } catch (e) { cfErr = e as Error; }
  assert.ok(coreErr && cfErr);
  assert.equal(coreErr!.code, cfErr!.code);
});

/* ---------------------------------------------------------------------------
 * Public Card projection
 * ------------------------------------------------------------------------- */

test('parity: namecard sanitization and deletion flag', () => {
  assert.deepEqual(
    coreMigration.sanitizeV1Namecard(fixtureV1UserProfile.namecard),
    cfCard.sanitizeNamecard(fixtureV1UserProfile.namecard),
  );
  for (const user of [fixtureV1UserProfile, null, { deleted: true }, { status: 'deleted' }, {}]) {
    assert.equal(coreMigration.isV1ProfileDeleted(user), cfCard.isCardDeleted(user));
  }
});

test('parity: projectable memory filter and Now projection', () => {
  assert.deepEqual(
    coreCard.filterProjectableMemories(ALL_MEMORIES),
    cfCard.filterProjectableMemories(ALL_MEMORIES),
  );
  for (const item of fixtureNowItems) {
    assert.equal(coreNow.isNowItemActive(item, NOW), cfNow.isActiveNowItem(item, NOW));
  }
  assert.deepEqual(
    coreCard.projectActiveNowItems(fixtureNowItems, NOW),
    cfCard.projectActiveNowItems(fixtureNowItems, NOW),
  );
  assert.deepEqual(coreCard.projectActiveNowItems(fixtureNowItems, NOW), cfNow.activeNowItems(fixtureNowItems, NOW));
});

test('parity: full public Card projection is byte-identical', () => {
  const input = {
    ownerId: fixtureOwner.id,
    user: fixtureV1UserProfile,
    memories: ALL_MEMORIES,
    nowItems: fixtureNowItems,
  };
  assert.deepEqual(coreCard.buildPublicCard(input, NOW), cfCard.buildPublicCard(input, NOW));
});

test('parity: miniprogram client Now helpers match the Core projection', () => {
  const coreProjected = coreCard.projectActiveNowItems(fixtureNowItems, NOW);
  const mpProjected = mpNow.activeNowItems(fixtureNowItems, NOW);
  assert.equal(coreProjected.length, mpProjected.length);
  coreProjected.forEach((item, i) => {
    assert.equal(mpProjected[i].id, item.id);
    assert.equal(mpProjected[i].text, item.text);
    assert.equal(mpProjected[i].topic, item.topic);
    assert.equal(mpProjected[i].publishedAt, item.publishedAt);
  });
  for (const item of fixtureNowItems) {
    assert.equal(coreNow.isNowItemActive(item, NOW), mpNow.isActiveNowItem(item, NOW));
  }
});

/* ---------------------------------------------------------------------------
 * Connection requests
 * ------------------------------------------------------------------------- */

test('parity: request payload validation and build', () => {
  const payloads = [
    { ownerId: 'o', reason: '想交流一次权限设计的具体实现。' },
    { ownerId: 'o', reason: '想认识一下' },
    { ownerId: '', reason: 'x'.repeat(20) },
    { ownerId: 'o', reason: 'x'.repeat(20), possibleSharedContext: 'nope' },
    { ownerId: 'o', reason: 'x'.repeat(20), visitorWorkUrl: 5 },
  ];
  for (const payload of payloads) {
    assert.equal(
      coreConnection.validateConnectionRequestPayload(payload),
      cfRequests.validateRequestPayload(payload),
    );
  }

  const input = {
    ownerId: fixtureOwner.id,
    visitorId: 'v-1',
    visitorSummary: ' 苏晴，独立开发者。 ',
    reason: ' 想交流一次权限设计。 ',
    possibleSharedContext: ['都在做个人 AI 产品', 1, ''],
    visitorWorkUrl: ' https://suqing.example.com/ai-ledger ',
  };
  const coreBuilt = coreConnection.buildConnectionRequest(input, NOW, 'req-1');
  const cfBuilt = cfRequests.buildRequest(input, NOW);
  const { id: _ignored, ...coreWithoutId } = coreBuilt;
  assert.deepEqual(coreWithoutId, cfBuilt);
});

test('parity: owner actions, gates, blocking, and contact resolution', () => {
  const base = { ...fixtureConnectionRequest };
  for (const action of ['connect', 'later', 'decline']) {
    for (const ids of [undefined, [], ['fixture-contact-wechat'], ['fixture-contact-wechat', 'fixture-contact-wechat']]) {
      let coreResult, coreErr, cfResult, cfErr;
      try { coreResult = coreConnection.applyOwnerAction(base, action, ids, NOW); } catch (e) { coreErr = e; }
      try { cfResult = cfRequests.applyOwnerAction(base, action, ids, NOW); } catch (e) { cfErr = e; }
      assert.equal(coreErr?.code, cfErr?.code, `${action}/${JSON.stringify(ids)} error code`);
      assert.deepEqual(coreResult, cfResult, `${action}/${JSON.stringify(ids)} result`);
    }
  }

  assert.deepEqual(
    coreConnection.applyBlockToRequest(base, NOW),
    cfRequests.applyBlock(base, NOW),
  );

  const connected = coreConnection.applyOwnerAction(base, 'connect', ['fixture-contact-email'], NOW);
  assert.deepEqual(
    coreConnection.resolveSharedContacts(connected, { contactMethods: fixtureOwnerContactMethods }),
    cfRequests.resolveSharedContacts(connected, { contactMethods: fixtureOwnerContactMethods }),
  );
  assert.equal(
    coreConnection.resolveSharedContacts(base, { contactMethods: fixtureOwnerContactMethods }),
    cfRequests.resolveSharedContacts(base, { contactMethods: fixtureOwnerContactMethods }),
  );

  const gateInput = { requests: [base], ownerId: fixtureOwner.id, visitorId: base.visitorId, now: NOW };
  assert.equal(coreConnection.checkConnectionCreateAllowed(gateInput), cfRequests.checkCreateAllowed(gateInput));
  assert.equal(coreConnection.isVisitorBlocked({ blockedUsers: ['v-1'] }, 'v-1'), cfRequests.isBlocked({ blockedUsers: ['v-1'] }, 'v-1'));
  assert.equal(coreConnection.canViewConnectionRequest(base, fixtureOwner.id), cfRequests.canViewRequest(base, fixtureOwner.id));
});

/* ---------------------------------------------------------------------------
 * Agent output schemas
 * ------------------------------------------------------------------------- */

const OWNER_RESULT_CASES: unknown[] = [
  null,
  {},
  { reply: '嗯。', cardUpdateSuggested: false },
  { reply: '嗯。', cardUpdateSuggested: 'no' },
  {
    reply: '这句话值得被记住。',
    cardUpdateSuggested: true,
    memoryProposal: { kind: 'preference', content: '想认识做过 AI 社交产品的人。', suggestedVisibility: 'public', sourceMessageIds: ['m-1'] },
    referencedMemoryIds: ['fixture-memory-public-focus'],
    nowProposal: { text: '最近在验证 AI 分身边界。', topic: 'current_work', expiresAt: null },
  },
  { reply: 'x', cardUpdateSuggested: false, memoryProposal: { kind: 'mood', content: 'c', suggestedVisibility: 'public' } },
  { reply: 'x', cardUpdateSuggested: false, nowProposal: { text: 'x'.repeat(201), topic: 'current_work' } },
  { reply: 'x', cardUpdateSuggested: false, nowProposal: { text: 'ok', topic: 'rant' } },
  { reply: 'x', cardUpdateSuggested: false, referencedMemoryIds: 'all' },
];

const VISITOR_RESULT_CASES: unknown[] = [
  null,
  { reply: '我是他的 AI 分身。', evidenceRefs: [], nextAction: 'continue' },
  { reply: 'x', evidenceRefs: ['mem:1'], nextAction: 'offer_request_review', boundaryCode: 'contact_request' },
  { reply: 'x', evidenceRefs: 'all', nextAction: 'end' },
  { reply: 'x', evidenceRefs: [], nextAction: 'block' },
  { reply: 'x', evidenceRefs: [], nextAction: 'end', boundaryCode: 7 },
  { reply: 'x', evidenceRefs: [], nextAction: 'continue', sharedContext: [' 共同点 ', '', 'b', 'c', 'd'] },
  { reply: 'x', evidenceRefs: [], nextAction: 'continue', sharedContext: [' ', ''] },
  { reply: 'x', evidenceRefs: [], nextAction: 'continue', sharedContext: [1] },
];

const SUMMARY_CASES: unknown[] = [
  null,
  {
    recommendation: 'worth_a_conversation',
    why: ['对方认真了解过 VibeCard'],
    uncertainty: '对方更想合作还是只交流想法',
    suggestedTopic: '权限设计',
    evidenceRefs: ['req:reason'],
  },
  { recommendation: 'worth_a_conversation', score: 92, why: ['x'], uncertainty: 'y', suggestedTopic: 'z', evidenceRefs: [] },
  { recommendation: 'perfect_match', why: ['x'], uncertainty: 'y', suggestedTopic: 'z', evidenceRefs: [] },
  { recommendation: 'maybe_later', why: [], uncertainty: 'y', suggestedTopic: 'z', evidenceRefs: [] },
];

const CARD_DRAFT_CASES: unknown[] = [
  null,
  {},
  { headline: ' 在做一张 AI 名片 ', canHelpWith: [' 取舍 ', 7, ''], highlights: [{ title: ' VibeCard ', url: ' https://example.com ' }, { title: 1 }] },
  { headline: 5 },
  { topics: 'ai' },
  { highlights: {} },
  { currentFocus: ' 打磨访客对话 ', wantsToMeet: ['做过 AI 社交产品的人'] },
];

test('parity: owner agent result validation', () => {
  for (const value of OWNER_RESULT_CASES) {
    assert.equal(
      coreSchema.validateOwnerAgentResult(value),
      cfSchema.validateOwnerAgentResult(value),
      JSON.stringify(value),
    );
  }
});

test('parity: visitor agent result validation incl. sharedContext normalization', () => {
  for (const value of VISITOR_RESULT_CASES) {
    const forCore = value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value));
    const forCf = value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value));
    assert.equal(
      coreSchema.validateVisitorAgentResult(forCore),
      cfSchema.validateVisitorAgentResult(forCf),
      JSON.stringify(value),
    );
    assert.deepEqual(forCore, forCf, `post-validation shape for ${JSON.stringify(value)}`);
  }
});

test('parity: connection summary validation', () => {
  for (const value of SUMMARY_CASES) {
    assert.equal(
      coreSchema.validateConnectionSummary(value),
      cfSchema.validateConnectionSummary(value),
      JSON.stringify(value),
    );
  }
});

test('parity: card draft validation and normalization', () => {
  for (const value of CARD_DRAFT_CASES) {
    const coreResult = coreSchema.validateCardDraft(value);
    const cfResult = cfSchema.validateCardDraft(value);
    assert.equal(coreResult.error, cfResult.error, JSON.stringify(value));
    assert.deepEqual(coreResult.draft, cfResult.draft, JSON.stringify(value));
  }
});
