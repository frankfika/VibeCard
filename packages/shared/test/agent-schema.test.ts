/**
 * Core tests: structured agent output schemas (task 5.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCardDraft,
  validateConnectionSummary,
  validateOwnerAgentResult,
  validateVisitorAgentResult,
} from '../agent-schema';

test('owner result: minimal valid shape passes', () => {
  assert.equal(validateOwnerAgentResult({ reply: '嗯，我听着。', cardUpdateSuggested: false }), null);
});

test('owner result: full shape with proposal, referencedMemoryIds, nowProposal passes', () => {
  assert.equal(
    validateOwnerAgentResult({
      reply: '这句话值得被记住。',
      cardUpdateSuggested: true,
      memoryProposal: {
        kind: 'preference',
        content: '最近更想认识真正做过 AI 社交产品的人。',
        suggestedVisibility: 'public',
        sourceMessageIds: ['m-1'],
      },
      referencedMemoryIds: ['fixture-memory-public-focus'],
      nowProposal: { text: '最近在验证 AI 分身的边界设计。', topic: 'current_work', expiresAt: null },
    }),
    null,
  );
});

test('owner result: rejects invalid proposals and drafts', () => {
  assert.equal(validateOwnerAgentResult(null), 'not_an_object');
  assert.equal(validateOwnerAgentResult({ reply: '', cardUpdateSuggested: false }), 'invalid_reply');
  assert.equal(
    validateOwnerAgentResult({ reply: 'x', cardUpdateSuggested: 'yes' }),
    'invalid_card_update_flag',
  );
  const base = { reply: 'x', cardUpdateSuggested: false };
  assert.equal(
    validateOwnerAgentResult({ ...base, memoryProposal: { kind: 'mood', content: 'c', suggestedVisibility: 'public' } }),
    'invalid_proposal_kind',
  );
  assert.equal(
    validateOwnerAgentResult({ ...base, memoryProposal: { kind: 'fact', content: 'c', suggestedVisibility: 'friends' } }),
    'invalid_proposal_visibility',
  );
  assert.equal(
    validateOwnerAgentResult({ ...base, nowProposal: { text: 'x'.repeat(201), topic: 'current_work' } }),
    'invalid_now_proposal_text',
  );
  assert.equal(
    validateOwnerAgentResult({ ...base, nowProposal: { text: 'ok', topic: 'rant' } }),
    'invalid_now_proposal_topic',
  );
  assert.equal(
    validateOwnerAgentResult({ ...base, referencedMemoryIds: [1] }),
    'invalid_referenced_memory_ids',
  );
});

test('visitor result: valid shapes pass, bad shapes are rejected', () => {
  assert.equal(
    validateVisitorAgentResult({ reply: '我是他的 AI 分身。', evidenceRefs: [], nextAction: 'continue' }),
    null,
  );
  assert.equal(
    validateVisitorAgentResult({
      reply: 'x',
      evidenceRefs: ['mem:1'],
      nextAction: 'invite_connection_reason',
      boundaryCode: 'contact_request',
    }),
    null,
  );
  assert.equal(validateVisitorAgentResult({ reply: 'x', evidenceRefs: 'all', nextAction: 'end' }), 'invalid_evidence_refs');
  assert.equal(validateVisitorAgentResult({ reply: 'x', evidenceRefs: [], nextAction: 'block' }), 'invalid_next_action');
  assert.equal(
    validateVisitorAgentResult({ reply: 'x', evidenceRefs: [], nextAction: 'end', boundaryCode: 7 }),
    'invalid_boundary_code',
  );
});

test('visitor result: sharedContext is shape-checked and normalized', () => {
  const value = {
    reply: 'x',
    evidenceRefs: [],
    nextAction: 'continue',
    sharedContext: ['  都在做微信生态的个人 AI 产品 ', '', 'b', 'c', 'd', 'x'.repeat(80)],
  };
  assert.equal(validateVisitorAgentResult(value), null);
  assert.deepEqual(value.sharedContext, ['都在做微信生态的个人 AI 产品', 'b', 'c']);
  // All-empty sharedContext is removed so the UI never renders an empty block.
  const empty = { reply: 'x', evidenceRefs: [], nextAction: 'continue', sharedContext: [' ', ''] };
  assert.equal(validateVisitorAgentResult(empty), null);
  assert.ok(!('sharedContext' in empty));
  assert.equal(
    validateVisitorAgentResult({ reply: 'x', evidenceRefs: [], nextAction: 'continue', sharedContext: [1] }),
    'invalid_shared_context',
  );
});

test('connection summary: never a score, why must be grounded', () => {
  assert.equal(
    validateConnectionSummary({
      recommendation: 'worth_a_conversation',
      why: ['对方认真了解过 VibeCard'],
      uncertainty: '对方更想合作还是只交流想法',
      suggestedTopic: '私人记忆与公开身份的边界',
      evidenceRefs: ['req:reason'],
    }),
    null,
  );
  assert.equal(
    validateConnectionSummary({
      recommendation: 'worth_a_conversation',
      score: 92,
      why: ['x'],
      uncertainty: 'y',
      suggestedTopic: 'z',
      evidenceRefs: [],
    }),
    'score_not_allowed',
  );
  assert.equal(
    validateConnectionSummary({
      recommendation: 'worth_a_conversation',
      why: [],
      uncertainty: 'y',
      suggestedTopic: 'z',
      evidenceRefs: [],
    }),
    'invalid_why',
  );
  assert.equal(
    validateConnectionSummary({
      recommendation: 'perfect_match',
      why: ['x'],
      uncertainty: 'y',
      suggestedTopic: 'z',
      evidenceRefs: [],
    }),
    'invalid_recommendation',
  );
});

test('card draft: valid draft is normalized, empty sections stripped', () => {
  const { draft, error } = validateCardDraft({
    headline: '  在做一张 AI 名片 ',
    currentFocus: '',
    canHelpWith: [' AI 社交产品的取舍 ', 7, ''],
    highlights: [{ title: ' VibeCard ', url: ' https://vibecard.example.com ' }, { title: 1 }, 'junk'],
  });
  assert.equal(error, undefined);
  assert.equal(draft!.headline, '在做一张 AI 名片');
  assert.ok(!('currentFocus' in draft!));
  assert.deepEqual(draft!.canHelpWith, ['AI 社交产品的取舍']);
  assert.deepEqual(draft!.highlights, [
    { id: 'draft-highlight-1', title: 'VibeCard', url: 'https://vibecard.example.com' },
  ]);
});

test('card draft: empty draft and bad types are rejected', () => {
  assert.deepEqual(validateCardDraft({}), { error: 'empty_draft' });
  assert.deepEqual(validateCardDraft(null), { error: 'not_an_object' });
  assert.deepEqual(validateCardDraft({ headline: 5 }), { error: 'invalid_headline' });
  assert.deepEqual(validateCardDraft({ topics: 'ai' }), { error: 'invalid_topics' });
  assert.deepEqual(validateCardDraft({ highlights: {} }), { error: 'invalid_highlights' });
});
