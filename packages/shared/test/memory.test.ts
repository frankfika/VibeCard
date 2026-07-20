/**
 * Core tests: memory confirmation and lifecycle rules (task 5.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Memory } from '../vibe';
import {
  MemoryTransitionError,
  buildProposedMemory,
  confirmMemory,
  deleteMemory,
  editMemory,
  isMemoryActive,
  pauseMemory,
  rejectMemoryProposal,
  resumeMemory,
  validateMemoryPayload,
} from '../memory';

const T0 = 1_752_000_000_000;

function proposedMemory(): Memory {
  return buildProposedMemory(
    {
      ownerId: 'fixture-owner-linzhou',
      kind: 'preference',
      content: '  比起线上长聊，更喜欢先约一次二十分钟的语音。 ',
      visibility: 'private',
      sourceConversationId: 'conv-1',
      sourceMessageIds: ['m-1'],
    },
    T0,
    'mem-1',
  );
}

test('a proposal builds a proposed (not yet active) memory with trimmed content', () => {
  const memory = proposedMemory();
  assert.equal(memory.status, 'proposed');
  assert.equal(memory.schemaVersion, 1);
  assert.equal(memory.content, '比起线上长聊，更喜欢先约一次二十分钟的语音。');
  assert.equal(isMemoryActive(memory), false);
});

test('propose -> confirm produces an active memory', () => {
  const confirmed = confirmMemory(proposedMemory(), {}, T0 + 1);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(isMemoryActive(confirmed), true);
  assert.equal(confirmed.updatedAt, T0 + 1);
});

test('confirm applies owner edits made at confirm time', () => {
  const confirmed = confirmMemory(
    proposedMemory(),
    { content: ' 先语音，再长聊。 ', visibility: 'public' },
    T0 + 1,
  );
  assert.equal(confirmed.content, '先语音，再长聊。');
  assert.equal(confirmed.visibility, 'public');
});

test('only proposed memories can be confirmed', () => {
  const confirmed = confirmMemory(proposedMemory(), {}, T0 + 1);
  assert.throws(() => confirmMemory(confirmed, {}, T0 + 2), MemoryTransitionError);
  assert.throws(() => confirmMemory(deleteMemory(confirmed, T0 + 2), {}, T0 + 3), /deleted/);
});

test('reject discards a proposal and only a proposal', () => {
  const rejected = rejectMemoryProposal(proposedMemory(), T0 + 1);
  assert.equal(rejected.status, 'deleted');
  const confirmed = confirmMemory(proposedMemory(), {}, T0 + 1);
  assert.throws(() => rejectMemoryProposal(confirmed, T0 + 2), MemoryTransitionError);
});

test('pause and resume are legal only from confirmed and paused', () => {
  const confirmed = confirmMemory(proposedMemory(), {}, T0 + 1);
  assert.throws(() => pauseMemory(proposedMemory(), T0 + 1), MemoryTransitionError);
  const paused = pauseMemory(confirmed, T0 + 2);
  assert.equal(paused.status, 'paused');
  assert.equal(isMemoryActive(paused), false);
  assert.throws(() => resumeMemory(confirmed, T0 + 2), MemoryTransitionError);
  const resumed = resumeMemory(paused, T0 + 3);
  assert.equal(resumed.status, 'confirmed');
  assert.equal(isMemoryActive(resumed), true);
});

test('edit changes fields but never the status', () => {
  const confirmed = confirmMemory(proposedMemory(), {}, T0 + 1);
  const edited = editMemory(confirmed, { kind: 'boundary', content: ' 只语音。 ' }, T0 + 2);
  assert.equal(edited.status, 'confirmed');
  assert.equal(edited.kind, 'boundary');
  assert.equal(edited.content, '只语音。');
  const proposedEdited = editMemory(proposedMemory(), { visibility: 'public' }, T0 + 2);
  assert.equal(proposedEdited.status, 'proposed');
  assert.equal(proposedEdited.visibility, 'public');
});

test('delete is a tombstone from any state and blocks retrieval', () => {
  const confirmed = confirmMemory(proposedMemory(), {}, T0 + 1);
  const deleted = deleteMemory(confirmed, T0 + 2);
  assert.equal(deleted.status, 'deleted');
  assert.equal(isMemoryActive(deleted), false);
});

test('validateMemoryPayload mirrors the contract limits', () => {
  assert.equal(validateMemoryPayload(null), 'invalid_payload');
  assert.equal(validateMemoryPayload({ kind: 'mood', content: 'x', visibility: 'public' }), 'invalid_kind');
  assert.equal(validateMemoryPayload({ kind: 'fact', content: '  ', visibility: 'public' }), 'invalid_content');
  assert.equal(
    validateMemoryPayload({ kind: 'fact', content: 'x'.repeat(501), visibility: 'public' }),
    'invalid_content',
  );
  assert.equal(validateMemoryPayload({ kind: 'fact', content: 'ok', visibility: 'friends' }), 'invalid_visibility');
  assert.equal(validateMemoryPayload({ kind: 'fact', content: 'ok', visibility: 'public' }), null);
  // Partial validation for edit patches.
  assert.equal(validateMemoryPayload({ content: 'ok' }, { partial: true }), null);
  assert.equal(validateMemoryPayload({ visibility: 'everyone' }, { partial: true }), 'invalid_visibility');
});
