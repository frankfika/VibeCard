/**
 * Memory confirmation and lifecycle rules (task 5.2 Core).
 *
 * Pure, platform-free TypeScript: no WeChat APIs, no browser globals, no
 * Node-only modules, no model SDK, no DB client.
 *
 * Source of truth: docs/engineering/AI_BEHAVIOR.md §2–§4.
 * - A durable memory exists only after the owner confirms a proposal.
 * - Legal lifecycle: proposed -> confirmed -> paused -> confirmed -> deleted.
 *   Edit is allowed in any non-deleted state and never changes status.
 * - Only confirmed memories are active/retrievable.
 *
 * The WeChat cloud function `cloudfunctions/memory/lib/core.js` is the
 * platform adapter mirror of these rules; parity is enforced by
 * `test/parity.test.ts`.
 */

import type {
  Memory,
  MemoryKind,
  MemoryStatus,
  MemoryVisibility,
} from './vibe';

export const MEMORY_KINDS = ['fact', 'current', 'preference', 'boundary'] as const;
export const MEMORY_VISIBILITIES = ['public', 'agent_only', 'connected', 'private'] as const;
export const MEMORY_STATUSES = ['proposed', 'confirmed', 'paused', 'deleted'] as const;

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === 'string' && (MEMORY_KINDS as readonly string[]).includes(value);
}

export function isMemoryVisibility(value: unknown): value is MemoryVisibility {
  return typeof value === 'string' && (MEMORY_VISIBILITIES as readonly string[]).includes(value);
}

export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return typeof value === 'string' && (MEMORY_STATUSES as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a proposed/updated memory payload. Returns an error code string or
 * null. `partial` allows validating an edit patch.
 */
export function validateMemoryPayload(
  payload: unknown,
  { partial = false }: { partial?: boolean } = {},
): string | null {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  const p = payload as Record<string, unknown>;
  if (!partial || p.kind !== undefined) {
    if (!isMemoryKind(p.kind)) return 'invalid_kind';
  }
  if (!partial || p.content !== undefined) {
    if (!isNonEmptyString(p.content) || p.content.length > 500) return 'invalid_content';
  }
  if (!partial || p.visibility !== undefined) {
    if (!isMemoryVisibility(p.visibility)) return 'invalid_visibility';
  }
  return null;
}

/** Error thrown for illegal lifecycle transitions; `code` is machine-readable. */
export class MemoryTransitionError extends Error {
  readonly code = 'invalid_transition';
}

/**
 * Retrieval rule: only confirmed memories are active. Proposed, paused, and
 * deleted memories never feed conversations, Cards, or projections.
 */
export function isMemoryActive(memory: Readonly<Memory>): boolean {
  return memory.status === 'confirmed';
}

/** Alias kept for readability at retrieval call sites. */
export const isMemoryRetrievable = isMemoryActive;

export interface MemoryDraftInput {
  ownerId: string;
  kind: MemoryKind;
  content: string;
  visibility: MemoryVisibility;
  sourceConversationId?: string;
  sourceMessageIds?: string[];
}

/**
 * Build a memory in `proposed` status from an owner-agent memory proposal.
 * The id is injected so the Core stays deterministic and platform-free.
 */
export function buildProposedMemory(input: MemoryDraftInput, now: number, id: string): Memory {
  return {
    id,
    schemaVersion: 1,
    ownerId: input.ownerId,
    kind: input.kind,
    content: input.content.trim(),
    visibility: input.visibility,
    status: 'proposed',
    sourceConversationId: input.sourceConversationId ?? '',
    sourceMessageIds: Array.isArray(input.sourceMessageIds) ? [...input.sourceMessageIds] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface MemoryConfirmPatch {
  content?: string;
  visibility?: MemoryVisibility;
}

/**
 * proposed -> confirmed. The owner may adjust content/visibility at confirm
 * time ("改一下" then "记住"). Confirmation produces an active memory.
 */
export function confirmMemory(
  memory: Readonly<Memory>,
  patch: MemoryConfirmPatch = {},
  now: number,
): Memory {
  if (memory.status !== 'proposed') {
    throw new MemoryTransitionError(`cannot confirm a ${memory.status} memory`);
  }
  return {
    ...memory,
    content: isNonEmptyString(patch.content) ? patch.content.trim() : memory.content,
    visibility: patch.visibility ?? memory.visibility,
    status: 'confirmed',
    updatedAt: now,
  };
}

export interface MemoryEditPatch {
  kind?: MemoryKind;
  content?: string;
  visibility?: MemoryVisibility;
}

/** Owner edit of kind/content/visibility; status untouched. */
export function editMemory(
  memory: Readonly<Memory>,
  patch: MemoryEditPatch,
  now: number,
): Memory {
  return {
    ...memory,
    kind: patch.kind ?? memory.kind,
    content: isNonEmptyString(patch.content) ? patch.content.trim() : memory.content,
    visibility: patch.visibility ?? memory.visibility,
    updatedAt: now,
  };
}

/** confirmed -> paused: kept by the owner but excluded from retrieval. */
export function pauseMemory(memory: Readonly<Memory>, now: number): Memory {
  if (memory.status !== 'confirmed') {
    throw new MemoryTransitionError(`cannot pause a ${memory.status} memory`);
  }
  return { ...memory, status: 'paused', updatedAt: now };
}

/** paused -> confirmed: the memory becomes active again. */
export function resumeMemory(memory: Readonly<Memory>, now: number): Memory {
  if (memory.status !== 'paused') {
    throw new MemoryTransitionError(`cannot resume a ${memory.status} memory`);
  }
  return { ...memory, status: 'confirmed', updatedAt: now };
}

/** Soft delete from any state: tombstone, excluded from all retrieval. */
export function deleteMemory(memory: Readonly<Memory>, now: number): Memory {
  return { ...memory, status: 'deleted', updatedAt: now };
}

/** Reject a proposal: proposed -> deleted (the "别记这个" owner action). */
export function rejectMemoryProposal(memory: Readonly<Memory>, now: number): Memory {
  if (memory.status !== 'proposed') {
    throw new MemoryTransitionError(`cannot reject a ${memory.status} memory`);
  }
  return { ...memory, status: 'deleted', updatedAt: now };
}
