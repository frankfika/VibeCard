/**
 * Memory domain core (task 1.1) — pure logic, no cloud dependencies.
 *
 * Mirrors the contract in packages/shared/vibe.ts and docs/engineering/AI_BEHAVIOR.md:
 * - a memory becomes durable only after the owner confirms a proposal
 * - visibility decides who may ever see it (public / agent_only / connected / private)
 * - deleted memories are excluded from any future retrieval
 *
 * Kept separate from index.js so it can be unit-tested with plain node.
 */

const MEMORY_KINDS = ['fact', 'current', 'preference', 'boundary'];
const MEMORY_VISIBILITIES = ['public', 'agent_only', 'connected', 'private'];
const MEMORY_STATUSES = ['proposed', 'confirmed', 'paused', 'deleted'];

const CONVERSATION_MODES = ['owner', 'visitor'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate a proposed/updated memory payload. Returns an error string or null. */
function validateMemoryPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  if (!partial || payload.kind !== undefined) {
    if (!MEMORY_KINDS.includes(payload.kind)) return 'invalid_kind';
  }
  if (!partial || payload.content !== undefined) {
    if (!isNonEmptyString(payload.content) || payload.content.length > 500) return 'invalid_content';
  }
  if (!partial || payload.visibility !== undefined) {
    if (!MEMORY_VISIBILITIES.includes(payload.visibility)) return 'invalid_visibility';
  }
  return null;
}

/** Only the owner may ever read or mutate a memory. */
function isOwner(memory, openid) {
  return !!memory && memory.ownerId === openid;
}

/**
 * Retrieval filter: only confirmed (or explicitly paused-but-kept? no —
 * paused is hidden too) memories may feed future conversations or Cards.
 * Proposed and deleted memories never leave the store.
 */
function isRetrievable(memory) {
  return memory.status === 'confirmed';
}

/** Memories a visitor conversation may quote from. */
function isVisitorQuotable(memory) {
  return memory.status === 'confirmed' && memory.visibility === 'public';
}

/** Memories the agent may use internally but never quote. */
function isAgentUsable(memory) {
  return (
    memory.status === 'confirmed' &&
    (memory.visibility === 'public' || memory.visibility === 'agent_only')
  );
}

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function buildMemory({ ownerId, kind, content, visibility, sourceConversationId = '', sourceMessageIds = [] }, now) {
  return {
    schemaVersion: 1,
    ownerId,
    kind,
    content: content.trim(),
    visibility,
    status: 'proposed',
    sourceConversationId,
    sourceMessageIds: Array.isArray(sourceMessageIds) ? sourceMessageIds : [],
    createdAt: now,
    updatedAt: now,
  };
}

/** proposed -> confirmed; owner may adjust content/visibility at confirm time. */
function applyConfirm(memory, { content, visibility } = {}, now) {
  if (memory.status !== 'proposed') {
    const err = new Error('only_proposed_can_be_confirmed');
    err.code = 'invalid_transition';
    throw err;
  }
  return {
    ...memory,
    content: isNonEmptyString(content) ? content.trim() : memory.content,
    visibility: visibility || memory.visibility,
    status: 'confirmed',
    updatedAt: now,
  };
}

/** Owner edit of kind/content/visibility; status untouched. */
function applyEdit(memory, patch, now) {
  return {
    ...memory,
    kind: patch.kind || memory.kind,
    content: isNonEmptyString(patch.content) ? patch.content.trim() : memory.content,
    visibility: patch.visibility || memory.visibility,
    updatedAt: now,
  };
}

/** Soft delete: excluded from retrieval but auditable. */
function applyDelete(memory, now) {
  return { ...memory, status: 'deleted', updatedAt: now };
}

module.exports = {
  MEMORY_KINDS,
  MEMORY_VISIBILITIES,
  MEMORY_STATUSES,
  CONVERSATION_MODES,
  validateMemoryPayload,
  isOwner,
  isRetrievable,
  isVisitorQuotable,
  isAgentUsable,
  buildMemory,
  applyConfirm,
  applyEdit,
  applyDelete,
  nextId,
};
