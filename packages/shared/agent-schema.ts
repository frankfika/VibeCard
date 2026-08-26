/**
 * Structured agent input/output schemas (task 5.2 Core).
 *
 * Pure, platform-free TypeScript types plus hand-rolled runtime validators —
 * no external validation dependency. Model output is untrusted until these
 * validators pass; clients must never parse free-form model text to decide
 * application state (AI_BEHAVIOR.md §5/§6/§8/§9/§13).
 *
 * The WeChat cloud function `cloudfunctions/agent/lib/schema.js` is the
 * platform adapter mirror; parity is enforced by `test/parity.test.ts`.
 */

import type { MemoryKind, MemoryVisibility } from './vibe';
import type { NowItemTopic } from './now';
import { isMemoryKind, isMemoryVisibility } from './memory';

export const NOW_ITEM_TOPICS = [
  'current_work',
  'completed_work',
  'exploring',
  'looking_for',
  'offer_help',
] as const;

export const VISITOR_NEXT_ACTIONS = [
  'continue',
  'invite_connection_reason',
  'offer_request_review',
  'end',
] as const;

export const SUMMARY_RECOMMENDATIONS = [
  'worth_a_conversation',
  'maybe_later',
  'need_more_context',
  'not_relevant_now',
] as const;

export type VisitorNextAction = (typeof VISITOR_NEXT_ACTIONS)[number];
export type SummaryRecommendation = (typeof SUMMARY_RECOMMENDATIONS)[number];

/* ---------------------------------------------------------------------------
 * Owner mode (AI_BEHAVIOR.md §5)
 * ------------------------------------------------------------------------- */

/** At most one memory proposal per owner response. */
export interface MemoryProposal {
  kind: MemoryKind;
  content: string;
  suggestedVisibility: MemoryVisibility;
  sourceMessageIds?: string[];
}

/**
 * Now draft proposal (task 4.5, AI_BEHAVIOR §13). The agent may only ever
 * propose a DRAFT — publishing is always a separate owner action.
 */
export interface NowProposal {
  text: string;
  topic: NowItemTopic;
  expiresAt?: number | null;
}

export interface OwnerAgentResult {
  reply: string;
  memoryProposal?: MemoryProposal | null;
  cardUpdateSuggested: boolean;
  /**
   * Recognition moment (task 3.3): ids of earlier confirmed memories the
   * reply genuinely calls back to (max 3). The server drops any id that is
   * not one of the owner's confirmed memories.
   */
  referencedMemoryIds?: string[];
  nowProposal?: NowProposal | null;
}

/* ---------------------------------------------------------------------------
 * Visitor mode (AI_BEHAVIOR.md §6)
 * ------------------------------------------------------------------------- */

export interface VisitorAgentResult {
  reply: string;
  evidenceRefs: string[];
  nextAction: VisitorNextAction;
  boundaryCode?: string;
  /**
   * Recognition moment (task 3.3): concrete overlap between what the visitor
   * explicitly said and the owner's public evidence (max 3 items, 60 chars
   * each). Omitted when there is no real overlap — never forced.
   */
  sharedContext?: string[];
}

/* ---------------------------------------------------------------------------
 * Connection summary (AI_BEHAVIOR.md §8) — not a score
 * ------------------------------------------------------------------------- */

export interface ConnectionSummary {
  recommendation: SummaryRecommendation;
  why: string[];
  uncertainty: string;
  suggestedTopic: string;
  evidenceRefs: string[];
}

/** Untrusted model output for task 2.6; server-owned source metadata is added later. */
export interface DecisionLearningAgentResult {
  proposal: {
    kind: 'preference' | 'boundary';
    content: string;
    suggestedVisibility: 'private' | 'agent_only';
  } | null;
}

/* ---------------------------------------------------------------------------
 * Card draft (AI_BEHAVIOR.md §9)
 * ------------------------------------------------------------------------- */

export interface CardDraftHighlight {
  id: string;
  title: string;
  url?: string;
}

export interface CardDraft {
  headline?: string;
  currentFocus?: string;
  canHelpWith?: string[];
  wantsToMeet?: string[];
  topics?: string[];
  highlights?: CardDraftHighlight[];
}

/* ---------------------------------------------------------------------------
 * Validators. Each returns an error-code string, or null when valid.
 * ------------------------------------------------------------------------- */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

/** Mirrors AI_BEHAVIOR.md §5 OwnerAgentResult. */
export function validateOwnerAgentResult(value: unknown): string | null {
  if (!isRecord(value)) return 'not_an_object';
  if (!isNonEmptyString(value.reply)) return 'invalid_reply';
  if (value.memoryProposal !== undefined && value.memoryProposal !== null) {
    const p = value.memoryProposal;
    if (!isRecord(p)) return 'invalid_proposal';
    if (!isMemoryKind(p.kind)) return 'invalid_proposal_kind';
    if (!isNonEmptyString(p.content) || p.content.length > 500) return 'invalid_proposal_content';
    if (!isMemoryVisibility(p.suggestedVisibility)) return 'invalid_proposal_visibility';
    if (p.sourceMessageIds !== undefined && !Array.isArray(p.sourceMessageIds)) {
      return 'invalid_proposal_sources';
    }
  }
  if (typeof value.cardUpdateSuggested !== 'boolean') return 'invalid_card_update_flag';
  // nowProposal (task 4.5): draft-only; publishing stays an owner action.
  if (value.nowProposal !== undefined && value.nowProposal !== null) {
    const p = value.nowProposal;
    if (!isRecord(p)) return 'invalid_now_proposal';
    if (!isNonEmptyString(p.text) || p.text.length > 200) return 'invalid_now_proposal_text';
    if (!(NOW_ITEM_TOPICS as readonly string[]).includes(p.topic as string)) {
      return 'invalid_now_proposal_topic';
    }
    if (p.expiresAt !== undefined && p.expiresAt !== null && typeof p.expiresAt !== 'number') {
      return 'invalid_now_proposal_expires_at';
    }
  }
  // referencedMemoryIds (task 3.3): shape-only check; the caller filters ids
  // down to memories that actually exist.
  if (value.referencedMemoryIds !== undefined && value.referencedMemoryIds !== null) {
    if (
      !Array.isArray(value.referencedMemoryIds) ||
      !value.referencedMemoryIds.every((id) => typeof id === 'string')
    ) {
      return 'invalid_referenced_memory_ids';
    }
  }
  return null;
}

/**
 * Mirrors AI_BEHAVIOR.md §6 VisitorAgentResult. On success, sharedContext is
 * normalized in place (trim, drop empties, cap each item at 60 chars and the
 * list at 3; an empty result deletes the field) so the UI never renders an
 * empty block.
 */
export function validateVisitorAgentResult(value: unknown): string | null {
  if (!isRecord(value)) return 'not_an_object';
  if (!isNonEmptyString(value.reply)) return 'invalid_reply';
  if (
    !Array.isArray(value.evidenceRefs) ||
    !value.evidenceRefs.every((r) => typeof r === 'string')
  ) {
    return 'invalid_evidence_refs';
  }
  if (!(VISITOR_NEXT_ACTIONS as readonly string[]).includes(value.nextAction as string)) {
    return 'invalid_next_action';
  }
  if (
    value.boundaryCode !== undefined &&
    value.boundaryCode !== null &&
    typeof value.boundaryCode !== 'string'
  ) {
    return 'invalid_boundary_code';
  }
  if (value.sharedContext !== undefined && value.sharedContext !== null) {
    if (
      !Array.isArray(value.sharedContext) ||
      !value.sharedContext.every((s) => typeof s === 'string')
    ) {
      return 'invalid_shared_context';
    }
    const normalized = (value.sharedContext as string[])
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 60))
      .slice(0, 3);
    if (normalized.length > 0) value.sharedContext = normalized;
    else delete value.sharedContext;
  }
  return null;
}

/**
 * Mirrors AI_BEHAVIOR.md §8 ConnectionSummary. The summary is not a score:
 * any `score` field is rejected outright, and `why` must be non-empty
 * whenever evidence is cited.
 */
export function validateConnectionSummary(value: unknown): string | null {
  if (!isRecord(value)) return 'not_an_object';
  if ('score' in value) return 'score_not_allowed';
  if (!(SUMMARY_RECOMMENDATIONS as readonly string[]).includes(value.recommendation as string)) {
    return 'invalid_recommendation';
  }
  if (!Array.isArray(value.why) || value.why.length === 0 || !value.why.every(isNonEmptyString)) {
    return 'invalid_why';
  }
  if (!isNonEmptyString(value.uncertainty)) return 'invalid_uncertainty';
  if (!isNonEmptyString(value.suggestedTopic)) return 'invalid_suggested_topic';
  if (
    !Array.isArray(value.evidenceRefs) ||
    !value.evidenceRefs.every((r) => typeof r === 'string')
  ) {
    return 'invalid_evidence_refs';
  }
  return null;
}

export function validateDecisionLearningAgentResult(value: unknown): string | null {
  if (!isRecord(value)) return 'not_an_object';
  if (value.proposal === null) return null;
  if (!isRecord(value.proposal)) return 'invalid_proposal';
  const proposal = value.proposal;
  if (proposal.kind !== 'preference' && proposal.kind !== 'boundary') return 'invalid_proposal_kind';
  if (!isNonEmptyString(proposal.content) || proposal.content.length > 500) {
    return 'invalid_proposal_content';
  }
  if (proposal.suggestedVisibility !== 'private' && proposal.suggestedVisibility !== 'agent_only') {
    return 'invalid_proposal_visibility';
  }
  return null;
}

const CARD_DRAFT_STRING_FIELDS = ['headline', 'currentFocus'] as const;
const CARD_DRAFT_LIST_FIELDS = ['canHelpWith', 'wantsToMeet', 'topics'] as const;

export type CardDraftValidation = { draft: CardDraft; error?: never } | { draft?: never; error: string };

/**
 * Validate + normalize a Card draft (AI_BEHAVIOR.md §9). The draft never
 * carries name/avatar/contact details; empty sections are stripped so a
 * draft never renders a blank block on the Card.
 */
export function validateCardDraft(value: unknown): CardDraftValidation {
  if (!isRecord(value)) return { error: 'not_an_object' };
  const draft: CardDraft = {};

  for (const field of CARD_DRAFT_STRING_FIELDS) {
    const raw = value[field];
    if (raw !== undefined && raw !== null) {
      if (typeof raw !== 'string') return { error: `invalid_${field}` };
      const trimmed = raw.trim();
      if (trimmed) draft[field] = trimmed.slice(0, 200);
    }
  }

  for (const field of CARD_DRAFT_LIST_FIELDS) {
    const raw = value[field];
    if (raw !== undefined && raw !== null) {
      if (!Array.isArray(raw)) return { error: `invalid_${field}` };
      const items = raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 60))
        .slice(0, 8);
      if (items.length > 0) draft[field] = items;
    }
  }

  const rawHighlights = value.highlights;
  if (rawHighlights !== undefined && rawHighlights !== null) {
    if (!Array.isArray(rawHighlights)) return { error: 'invalid_highlights' };
    const highlights = rawHighlights
      .filter((h): h is { title: string; url?: unknown } => isRecord(h) && typeof (h as Record<string, unknown>).title === 'string' && ((h as Record<string, unknown>).title as string).trim().length > 0)
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
