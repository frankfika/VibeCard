/**
 * Schema validation for AI business outputs (task 1.2).
 *
 * Model output is untrusted until these validators pass. Anything invalid is
 * rejected server-side; clients must never parse free-form model text.
 */

const MEMORY_KINDS = ['fact', 'current', 'preference', 'boundary'];
const MEMORY_VISIBILITIES = ['public', 'agent_only', 'connected', 'private'];

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
  validateCardDraft,
  typedError,
  ok,
  MEMORY_KINDS,
  MEMORY_VISIBILITIES,
};
