/**
 * Core tests: public Card projection (task 5.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Memory } from '../vibe';
import {
  fixtureOwner,
  fixtureOwnerMemories,
  fixtureOwnerSensitiveMemories,
  fixtureV1UserProfile,
} from '../fixtures/vibe';
import { fixtureNowItems, fixtureNowReferenceNow } from '../fixtures/now';
import {
  buildPublicCard,
  filterProjectableMemories,
  projectActiveNowItems,
  PUBLIC_NOW_LIMIT,
} from '../public-card';

const NOW = fixtureNowReferenceNow;

test('projection keeps at most 3 newest published non-expired Now items', () => {
  const projected = projectActiveNowItems(fixtureNowItems, NOW);
  assert.equal(projected.length, 2); // only 2 fixture items are published AND non-expired
  assert.deepEqual(
    projected.map((i) => i.id),
    ['fixture-now-published-focus', 'fixture-now-published-expiring'],
  );
  assert.ok(projected.length <= PUBLIC_NOW_LIMIT);
});

test('expired, draft, archived, hidden, and deleted Now items never project', () => {
  const ids = projectActiveNowItems(fixtureNowItems, NOW).map((i) => i.id);
  for (const forbidden of [
    'fixture-now-published-expired',
    'fixture-now-draft-vibe-proposal',
    'fixture-now-archived',
    'fixture-now-hidden',
    'fixture-now-deleted',
  ]) {
    assert.ok(!ids.includes(forbidden), `${forbidden} must not project`);
  }
});

test('projected Now items carry public-safe fields only', () => {
  for (const item of projectActiveNowItems(fixtureNowItems, NOW)) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'publishedAt', 'text', 'topic']);
  }
});

test('empty Now input projects to an empty list — nothing is invented', () => {
  assert.deepEqual(projectActiveNowItems([], NOW), []);
  assert.deepEqual(projectActiveNowItems(null, NOW), []);
});

test('projection drops non-public and non-confirmed memory (second net)', () => {
  const all: Memory[] = [...fixtureOwnerMemories, ...fixtureOwnerSensitiveMemories];
  const projectable = filterProjectableMemories(all);
  assert.ok(projectable.every((m) => m.visibility === 'public' && m.status === 'confirmed'));
  const ids = projectable.map((m) => m.id);
  assert.ok(!ids.includes('fixture-memory-agent-boundary'));
  assert.ok(!ids.includes('fixture-memory-connected-collaboration'));
  assert.ok(!ids.includes('fixture-memory-private-health-note'));
  assert.ok(!ids.includes('fixture-memory-proposed'));
});

test('public Card contains owner text, public memory content, and no contact data', () => {
  const card = buildPublicCard(
    {
      ownerId: fixtureOwner.id,
      user: fixtureV1UserProfile,
      memories: [...fixtureOwnerMemories, ...fixtureOwnerSensitiveMemories],
      nowItems: fixtureNowItems,
    },
    NOW,
  );

  assert.equal(card.schemaVersion, 1);
  assert.equal(card.name, fixtureOwner.name);
  // Owner-written v1 motto wins over bio for the headline, verbatim.
  assert.equal(card.headline, fixtureV1UserProfile.namecard.motto);
  assert.equal(card.currentFocus, fixtureOwnerMemories[0].content);
  assert.ok(card.wantsToMeet.includes(fixtureOwnerMemories[1].content));
  assert.deepEqual(card.topics, fixtureV1UserProfile.namecard.interests);
  assert.equal(card.now.length, 2);

  // No contact details anywhere in the projection.
  const serialized = JSON.stringify(card);
  assert.ok(!serialized.includes('fixture-wechat-linzhou'));
  assert.ok(!serialized.includes('linzhou@mail.example.com'));
  assert.ok(!serialized.includes('socialLinks'));
  // No non-public memory content.
  assert.ok(!serialized.includes('合写一篇关于个人数据主权')); // connected
  assert.ok(!serialized.includes('陪家人的时间')); // private
  assert.ok(!serialized.includes('资源互换')); // agent_only
});

test('a v1 profile without namecard still projects a valid empty-state Card', () => {
  const card = buildPublicCard(
    { ownerId: 'o-1', user: { nickname: '阿舟' }, memories: [], nowItems: [] },
    NOW,
  );
  assert.equal(card.name, '阿舟');
  assert.equal(card.headline, '');
  assert.equal(card.currentFocus, '');
  assert.deepEqual(card.canHelpWith, []);
  assert.deepEqual(card.now, []);
});
