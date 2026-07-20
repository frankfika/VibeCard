/**
 * Schema validation for AI business outputs (task 1.2).
 *
 * Model output is untrusted until these validators pass. Anything invalid is
 * rejected server-side; clients must never parse free-form model text.
 */

const MEMORY_KINDS = ['fact', 'current', 'preference', 'boundary'];
const MEMORY_VISIBILITIES = ['public', 'agent_only', 'connected', 'private'];
const NOW_ITEM_TOPICS = ['current_work', 'completed_work', 'exploring', 'looking_for', 'offer_help'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Mirrors AI_BEHAVIOR.md §5 OwnerAgentResult. Returns error string or null. */
function validateOwnerAgentResult(value) {
  if (!value || typeof value !== 'object') return 'not_an_object';
  if (!isNonEmptyString(value.reply)) return 'invalid_reply';
  if (value.memoryProposal !== undefined && value.memoryProposal !== null) {
    const p = value.memoryProposal;
    if (typeof p !== 'object') return 'invalid_proposal';
    if (!MEMORY_KINDS.includes(p.kind)) return 'invalid_proposal_kind';
    if (!isNonEmptyString(p.content) || p.content.length > 500) return 'invalid_proposal_content';
    if (!MEMORY_VISIBILITIES.includes(p.suggestedVisibility)) return 'invalid_proposal_visibility';
    if (p.sourceMessageIds !== undefined && !Array.isArray(p.sourceMessageIds)) return 'invalid_proposal_sources';
  }
  if (typeof value.cardUpdateSuggested !== 'boolean') return 'invalid_card_update_flag';
  // nowProposal (task 4.5, AI_BEHAVIOR §13): optional Now draft proposal.
  // The agent may only ever propose a draft — publishing is an owner action.
  if (value.nowProposal !== undefined && value.nowProposal !== null) {
    const p = value.nowProposal;
    if (typeof p !== 'object') return 'invalid_now_proposal';
    if (!isNonEmptyString(p.text) || p.text.length > 200) return 'invalid_now_proposal_text';
    if (!NOW_ITEM_TOPICS.includes(p.topic)) return 'invalid_now_proposal_topic';
    if (p.expiresAt !== undefined && p.expiresAt !== null && typeof p.expiresAt !== 'number') {
      return 'invalid_now_proposal_expires_at';
    }
  }
  // referencedMemoryIds (task 3.3): optional; shape-only check here. The
  // caller filters the ids down to memories that actually exist.
  if (value.referencedMemoryIds !== undefined && value.referencedMemoryIds !== null) {
    if (!Array.isArray(value.referencedMemoryIds) || !value.referencedMemoryIds.every(id => typeof id === 'string')) {
      return 'invalid_referenced_memory_ids';
    }
  }
  return null;
}

const VISITOR_NEXT_ACTIONS = ['continue', 'invite_connection_reason', 'offer_request_review', 'end'];

/** Mirrors AI_BEHAVIOR.md §6 VisitorAgentResult. Returns error string or null. */
function validateVisitorAgentResult(value) {
  if (!value || typeof value !== 'object') return 'not_an_object';
  if (!isNonEmptyString(value.reply)) return 'invalid_reply';
  if (!Array.isArray(value.evidenceRefs) || !value.evidenceRefs.every(r => typeof r === 'string')) {
    return 'invalid_evidence_refs';
  }
  if (!VISITOR_NEXT_ACTIONS.includes(value.nextAction)) return 'invalid_next_action';
  if (value.boundaryCode !== undefined && value.boundaryCode !== null && typeof value.boundaryCode !== 'string') {
    return 'invalid_boundary_code';
  }
  // sharedContext (task 3.3): optional overlap between what the visitor said
  // and the public evidence. Shape-checked, then normalized in place: trim,
  // drop empties, cap each item at 60 chars and the list at 3; an empty
  // result deletes the field so the UI never renders an empty block.
  if (value.sharedContext !== undefined && value.sharedContext !== null) {
    if (!Array.isArray(value.sharedContext) || !value.sharedContext.every(s => typeof s === 'string')) {
      return 'invalid_shared_context';
    }
    const normalized = value.sharedContext
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.slice(0, 60))
      .slice(0, 3);
    if (normalized.length > 0) value.sharedContext = normalized;
    else delete value.sharedContext;
  }
  return null;
}

const SUMMARY_RECOMMENDATIONS = [
  'worth_a_conversation',
  'maybe_later',
  'need_more_context',
  'not_relevant_now',
];

/**
 * Mirrors AI_BEHAVIOR.md §8 ConnectionSummary. The summary is not a score:
 * any `score` field is rejected outright, and `why` must be non-empty
 * whenever evidence is cited. Returns error string or null.
 */
function validateConnectionSummary(value) {
  if (!value || typeof value !== 'object') return 'not_an_object';
  if ('score' in value) return 'score_not_allowed';
  if (!SUMMARY_RECOMMENDATIONS.includes(value.recommendation)) return 'invalid_recommendation';
  if (!Array.isArray(value.why) || value.why.length === 0 || !value.why.every(isNonEmptyString)) {
    return 'invalid_why';
  }
  if (!isNonEmptyString(value.uncertainty)) return 'invalid_uncertainty';
  if (!isNonEmptyString(value.suggestedTopic)) return 'invalid_suggested_topic';
  if (!Array.isArray(value.evidenceRefs) || !value.evidenceRefs.every(r => typeof r === 'string')) {
    return 'invalid_evidence_refs';
  }
  return null;
}

function typedError(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(result) {
  return { ok: true, result };
}

const CARD_DRAFT_STRING_FIELDS = ['headline', 'currentFocus'];
const CARD_DRAFT_LIST_FIELDS = ['canHelpWith', 'wantsToMeet', 'topics'];

/**
 * Validate + normalize a Card draft (AI_BEHAVIOR.md §9).
 *
 * The draft never carries name/avatar/contact details — those belong to the
 * owner's profile, not to model output. Empty sections are stripped so a
 * draft never renders a blank block on the Card. Returns { draft } or
 * { error }.
 */
function validateCardDraft(value) {
  if (!value || typeof value !== 'object') return { error: 'not_an_object' };
  const draft = {};

  for (const field of CARD_DRAFT_STRING_FIELDS) {
    if (value[field] !== undefined && value[field] !== null) {
      if (typeof value[field] !== 'string') return { error: `invalid_${field}` };
      const trimmed = value[field].trim();
      if (trimmed) draft[field] = trimmed.slice(0, 200);
    }
  }

  for (const field of CARD_DRAFT_LIST_FIELDS) {
    if (value[field] !== undefined && value[field] !== null) {
      if (!Array.isArray(value[field])) return { error: `invalid_${field}` };
      const items = value[field]
        .filter(item => typeof item === 'string' && item.trim())
        .map(item => item.trim().slice(0, 60))
        .slice(0, 8);
      if (items.length > 0) draft[field] = items;
    }
  }

  if (value.highlights !== undefined && value.highlights !== null) {
    if (!Array.isArray(value.highlights)) return { error: 'invalid_highlights' };
    const highlights = value.highlights
      .filter(h => h && typeof h.title === 'string' && h.title.trim())
      .map((h, i) => ({
        id: `draft-highlight-${i + 1}`,
        title: h.title.trim().slice(0, 80),
        ...(typeof h.url === 'string' && h.url.trim() ? { url: h.url.trim().slice(0, 300) } : {}),
      }))
      .slice(0, 3);
    if (highlights.length > 0) draft.highlights = highlights;
  }

  if (Object.keys(draft).length === 0) return { error: 'empty_draft' };
  return { draft };
}

module.exports = {
  validateOwnerAgentResult,
  validateVisitorAgentResult,
  validateConnectionSummary,
  validateCardDraft,
  typedError,
  ok,
  MEMORY_KINDS,
  MEMORY_VISIBILITIES,
  NOW_ITEM_TOPICS,
  VISITOR_NEXT_ACTIONS,
  SUMMARY_RECOMMENDATIONS,
};
