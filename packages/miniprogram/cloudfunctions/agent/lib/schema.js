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

module.exports = {
  validateOwnerAgentResult,
  typedError,
  ok,
  MEMORY_KINDS,
  MEMORY_VISIBILITIES,
};
