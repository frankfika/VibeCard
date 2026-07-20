/**
 * Visibility and role filtering (task 5.2 Core).
 *
 * Pure, platform-free TypeScript. Implements ARCHITECTURE.md §7 and
 * AI_BEHAVIOR.md §4:
 *
 * - Owner mode may retrieve public + agent_only + connected + private,
 *   confirmed (active) memories only.
 * - Visitor mode may quote `public` memories only.
 * - Visitor mode may use `agent_only` memories for a boundary decision,
 *   without ever quoting or paraphrasing them.
 * - Visitor mode may never retrieve `connected` or `private` memories.
 *
 * Permission filtering happens BEFORE retrieval: callers pass these filtered
 * lists into the model context, never the raw memory collection.
 */

import type { Memory } from './vibe';
import { isMemoryActive } from './memory';

/** A visitor conversation may quote only confirmed public memories. */
export function isVisitorQuotable(memory: Readonly<Memory>): boolean {
  return isMemoryActive(memory) && memory.visibility === 'public';
}

/**
 * An agent_only memory may steer the connect/no-connect boundary decision but
 * must never be quoted. Only confirmed agent_only memories qualify.
 */
export function isVisitorBoundaryUsable(memory: Readonly<Memory>): boolean {
  return isMemoryActive(memory) && memory.visibility === 'agent_only';
}

/**
 * Everything the owner's own session may retrieve: all four visibilities,
 * active (confirmed) memories only.
 */
export function memoriesForOwner(memories: readonly Memory[]): Memory[] {
  return memories.filter(isMemoryActive);
}

/**
 * The quotable evidence set for a visitor conversation: confirmed public
 * memories only. Connected and private memories are provably excluded — they
 * fail the visibility check before any retrieval happens.
 */
export function memoriesForVisitorQuote(memories: readonly Memory[]): Memory[] {
  return memories.filter(isVisitorQuotable);
}

/**
 * The boundary set for a visitor conversation: confirmed agent_only memories.
 * These may be shown to the model without ids (so they can never be cited)
 * and only to steer judgment, never as quotable content.
 */
export function memoriesForVisitorBoundary(memories: readonly Memory[]): Memory[] {
  return memories.filter(isVisitorBoundaryUsable);
}

/**
 * Everything the visitor-mode agent may see at all: quotable public memories
 * plus boundary-only agent_only memories. Anything beyond this list (notably
 * connected and private memories) must not enter a visitor prompt.
 */
export function memoriesForVisitorAgent(memories: readonly Memory[]): Memory[] {
  return memories.filter(
    (memory) => isVisitorQuotable(memory) || isVisitorBoundaryUsable(memory),
  );
}

/**
 * Defensive second net for visitor contexts: returns the ids of memories that
 * must never appear in a visitor prompt (connected or private visibility, or
 * non-active status). An empty result proves the context is clean.
 */
export function forbiddenForVisitor(memories: readonly Memory[]): Memory[] {
  return memories.filter(
    (memory) =>
      memory.visibility === 'connected' ||
      memory.visibility === 'private' ||
      !isMemoryActive(memory),
  );
}
