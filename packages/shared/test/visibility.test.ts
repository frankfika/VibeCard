/**
 * Core tests: visibility and role filtering (task 5.2).
 *
 * These are the permission proofs required by the acceptance criteria:
 * - visitor context can never include private or connected memory
 * - agent_only content is usable for boundary decisions but never quotable
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Memory } from '../vibe';
import {
  fixtureOwnerMemories,
  fixtureOwnerSensitiveMemories,
} from '../fixtures/vibe';
import {
  forbiddenForVisitor,
  isVisitorBoundaryUsable,
  isVisitorQuotable,
  memoriesForOwner,
  memoriesForVisitorAgent,
  memoriesForVisitorBoundary,
  memoriesForVisitorQuote,
} from '../visibility';

const ALL_FIXTURE_MEMORIES: Memory[] = [
  ...fixtureOwnerMemories,
  ...fixtureOwnerSensitiveMemories,
];

test('owner context sees all visibilities, active (confirmed) memories only', () => {
  const owner = memoriesForOwner(ALL_FIXTURE_MEMORIES);
  const ids = owner.map((m) => m.id);
  assert.ok(ids.includes('fixture-memory-public-focus')); // public
  assert.ok(ids.includes('fixture-memory-agent-boundary')); // agent_only
  assert.ok(ids.includes('fixture-memory-connected-collaboration')); // connected
  assert.ok(ids.includes('fixture-memory-private-health-note')); // private
  // The proposed (not yet confirmed) memory is not active and stays out.
  assert.ok(!ids.includes('fixture-memory-proposed'));
  assert.ok(owner.every((m) => m.status === 'confirmed'));
});

test('visitor quotable context is public + confirmed ONLY', () => {
  const quotable = memoriesForVisitorQuote(ALL_FIXTURE_MEMORIES);
  assert.ok(quotable.length > 0);
  assert.ok(quotable.every((m) => m.visibility === 'public' && m.status === 'confirmed'));
  const ids = quotable.map((m) => m.id);
  assert.ok(ids.includes('fixture-memory-public-focus'));
  assert.ok(ids.includes('fixture-memory-public-meet'));
  assert.ok(!ids.includes('fixture-memory-agent-boundary'));
  assert.ok(!ids.includes('fixture-memory-connected-collaboration'));
  assert.ok(!ids.includes('fixture-memory-private-health-note'));
});

test('visitor boundary context is agent_only + confirmed and never overlaps quotable', () => {
  const boundary = memoriesForVisitorBoundary(ALL_FIXTURE_MEMORIES);
  assert.deepEqual(
    boundary.map((m) => m.id),
    ['fixture-memory-agent-boundary'],
  );
  const quotableIds = new Set(memoriesForVisitorQuote(ALL_FIXTURE_MEMORIES).map((m) => m.id));
  assert.ok(boundary.every((m) => !quotableIds.has(m.id)));
});

test('agent_only content is never quotable (AI_BEHAVIOR §4)', () => {
  const agentOnly = ALL_FIXTURE_MEMORIES.find((m) => m.visibility === 'agent_only')!;
  assert.equal(isVisitorQuotable(agentOnly), false);
  assert.equal(isVisitorBoundaryUsable(agentOnly), true);
});

test('full visitor context provably excludes connected and private memory', () => {
  const visitorContext = memoriesForVisitorAgent(ALL_FIXTURE_MEMORIES);
  assert.ok(visitorContext.every((m) => m.visibility === 'public' || m.visibility === 'agent_only'));
  assert.ok(visitorContext.every((m) => m.status === 'confirmed'));
  // The defensive second net confirms nothing forbidden slipped through.
  assert.deepEqual(forbiddenForVisitor(visitorContext), []);
  // Sanity: the raw collection does contain forbidden items, so the proof
  // above is not vacuous.
  assert.equal(forbiddenForVisitor(ALL_FIXTURE_MEMORIES).length, 3); // connected + private + proposed
});

test('paused and deleted memories are invisible to every role', () => {
  const paused: Memory = { ...ALL_FIXTURE_MEMORIES[0], status: 'paused' };
  const deleted: Memory = { ...ALL_FIXTURE_MEMORIES[0], status: 'deleted' };
  const memories = [paused, deleted];
  assert.equal(memoriesForOwner(memories).length, 0);
  assert.equal(memoriesForVisitorQuote(memories).length, 0);
  assert.equal(memoriesForVisitorBoundary(memories).length, 0);
});
