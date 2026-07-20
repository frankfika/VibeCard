/**
 * Connection-request state transitions (task 5.2 Core).
 *
 * Pure, platform-free TypeScript. Mirrors AI_BEHAVIOR.md §7:
 * - a request carries a specific reason; weak reasons are rejected
 * - one pending/new request per visitor-owner pair per 24h
 * - a declined visitor cools down for 24h; a blocked visitor cannot request
 * - legal owner transitions: pending|later -> connect | later | decline;
 *   connect and decline are terminal
 * - sharedContactMethodIds is set ONLY on connect, and connect requires at
 *   least one selected contact method
 *
 * The WeChat cloud function `cloudfunctions/requests/lib/core.js` is the
 * platform adapter mirror; parity is enforced by `test/parity.test.ts`.
 */

import type { ConnectionAction, ConnectionRequest, ContactMethod } from './vibe';

export const CONNECTION_DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_REASON_LENGTH = 10;
export const OWNER_ACTIONS = ['connect', 'later', 'decline'] as const;

/** Owner actions that may still change (non-terminal states). */
export const ACTIONABLE_STATES: readonly ConnectionAction[] = ['pending', 'later'];

export type OwnerAction = (typeof OWNER_ACTIONS)[number];

export class ConnectionTransitionError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface ConnectionRequestPayload {
  ownerId: string;
  reason: string;
  visitorSummary?: string | null;
  possibleSharedContext?: string[] | null;
  visitorWorkUrl?: string | null;
}

/**
 * Validate a createRequest payload. Returns an error code or null. A reason
 * under MIN_REASON_LENGTH characters is a `weak_reason` — the client uses
 * that code to guide the visitor toward a specific reason.
 */
export function validateConnectionRequestPayload(payload: ConnectionRequestPayload): string | null {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  if (!isNonEmptyString(payload.ownerId)) return 'invalid_owner';
  if (!isNonEmptyString(payload.reason)) return 'weak_reason';
  if (payload.reason.trim().length < MIN_REASON_LENGTH) return 'weak_reason';
  if (
    payload.visitorSummary !== undefined &&
    payload.visitorSummary !== null &&
    typeof payload.visitorSummary !== 'string'
  ) {
    return 'invalid_summary';
  }
  if (
    payload.possibleSharedContext !== undefined &&
    payload.possibleSharedContext !== null &&
    !Array.isArray(payload.possibleSharedContext)
  ) {
    return 'invalid_shared_context';
  }
  if (
    payload.visitorWorkUrl !== undefined &&
    payload.visitorWorkUrl !== null &&
    typeof payload.visitorWorkUrl !== 'string'
  ) {
    return 'invalid_work_url';
  }
  return null;
}

export interface BuildConnectionRequestInput {
  ownerId: string;
  visitorId: string;
  visitorSummary?: string | null;
  reason: string;
  possibleSharedContext?: string[] | null;
  visitorWorkUrl?: string | null;
}

/**
 * Build a pending ConnectionRequest (schemaVersion 1). The id is injected so
 * the Core stays deterministic and platform-free.
 */
export function buildConnectionRequest(
  input: BuildConnectionRequestInput,
  now: number,
  id: string,
): ConnectionRequest {
  return {
    id,
    schemaVersion: 1,
    ownerId: input.ownerId,
    visitorId: input.visitorId,
    visitorSummary:
      typeof input.visitorSummary === 'string' ? input.visitorSummary.trim().slice(0, 500) : '',
    reason: input.reason.trim().slice(0, 500),
    possibleSharedContext: (Array.isArray(input.possibleSharedContext) ? input.possibleSharedContext : [])
      .filter(isNonEmptyString)
      .map((s) => s.trim().slice(0, 100))
      .slice(0, 5),
    ...(isNonEmptyString(input.visitorWorkUrl)
      ? { visitorWorkUrl: input.visitorWorkUrl.trim().slice(0, 300) }
      : {}),
    ownerAction: 'pending',
    sharedContactMethodIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** The owner's users document carries a blockedUsers array of ids. */
export interface OwnerBlockState {
  blockedUsers?: string[];
}

export function isVisitorBlocked(ownerUser: OwnerBlockState | null | undefined, visitorId: string): boolean {
  return (
    Array.isArray(ownerUser && ownerUser.blockedUsers) &&
    ownerUser!.blockedUsers!.includes(visitorId)
  );
}

export interface CreateGateInput {
  requests: readonly ConnectionRequest[];
  ownerId: string;
  visitorId: string;
  now: number;
  windowMs?: number;
}

/**
 * Gate for createRequest. Returns 'declined_cooldown' | 'rate_limited' | null.
 *
 * - declined_cooldown: the owner declined this visitor within the window
 * - rate_limited: this visitor already sent a request to this owner within
 *   the window (at most one pending/new request per 24h)
 */
export function checkConnectionCreateAllowed({
  requests,
  ownerId,
  visitorId,
  now,
  windowMs = CONNECTION_DAY_MS,
}: CreateGateInput): 'declined_cooldown' | 'rate_limited' | null {
  const mine = (requests ?? []).filter((r) => r && r.ownerId === ownerId && r.visitorId === visitorId);
  const declined = mine.some((r) => r.ownerAction === 'decline' && now - (r.updatedAt || 0) < windowMs);
  if (declined) return 'declined_cooldown';
  const recent = mine.some((r) => now - (r.createdAt || 0) < windowMs);
  if (recent) return 'rate_limited';
  return null;
}

/** Owner and the requesting visitor may read a request; nobody else. */
export function canViewConnectionRequest(request: ConnectionRequest | null | undefined, actorId: string): boolean {
  return !!request && (request.ownerId === actorId || request.visitorId === actorId);
}

/**
 * Apply an owner decision. Allowed from pending or later; connect and decline
 * are terminal.
 *
 * `sharedContactMethodIds` rules:
 * - connect REQUIRES at least one selected contact method and records the
 *   selection (deduped, at most 10)
 * - any other action clears the selection — pending/later/decline requests
 *   never carry contact data
 *
 * Throws ConnectionTransitionError with a machine-readable `code` otherwise.
 */
export function applyOwnerAction(
  request: ConnectionRequest,
  action: OwnerAction,
  sharedContactMethodIds: readonly string[] | undefined,
  now: number,
): ConnectionRequest {
  if (!(OWNER_ACTIONS as readonly string[]).includes(action)) {
    throw new ConnectionTransitionError('invalid_action', 'action must be connect, later, or decline');
  }
  if (request.ownerAction !== 'pending' && request.ownerAction !== 'later') {
    throw new ConnectionTransitionError(
      'invalid_transition',
      `cannot act on a ${request.ownerAction} request`,
    );
  }
  if (action === 'connect') {
    const ids = (Array.isArray(sharedContactMethodIds) ? sharedContactMethodIds : []).filter(isNonEmptyString);
    if (ids.length === 0) {
      throw new ConnectionTransitionError(
        'invalid_contact_selection',
        'connect requires at least one contact method',
      );
    }
    return {
      ...request,
      ownerAction: 'connect',
      sharedContactMethodIds: [...new Set(ids)].slice(0, 10),
      updatedAt: now,
    };
  }
  return { ...request, ownerAction: action, sharedContactMethodIds: [], updatedAt: now };
}

/**
 * Blocking a visitor declines the request while it is still actionable
 * (pending / later). Terminal states (connect / decline) are returned
 * unchanged so blocking stays idempotent.
 */
export function applyBlockToRequest(request: ConnectionRequest, now: number): ConnectionRequest {
  if (request.ownerAction === 'pending' || request.ownerAction === 'later') {
    return applyOwnerAction(request, 'decline', undefined, now);
  }
  return request;
}

/** The owner-side store of contact methods, keyed by id. */
export interface OwnerContactState {
  contactMethods?: ContactMethod[];
}

export interface SharedContact {
  id: string;
  kind: ContactMethod['kind'];
  label: string;
  value: string;
}

/**
 * Resolve contact values for a connected request. Returns undefined for any
 * other state — pending / later / decline never carry contact data. Unknown
 * ids are dropped silently.
 */
export function resolveSharedContacts(
  request: ConnectionRequest | null | undefined,
  ownerUser: OwnerContactState | null | undefined,
): SharedContact[] | undefined {
  if (!request || request.ownerAction !== 'connect') return undefined;
  const methods = Array.isArray(ownerUser && ownerUser.contactMethods) ? ownerUser!.contactMethods! : [];
  return request.sharedContactMethodIds
    .map((id) => methods.find((m) => m && m.id === id))
    .filter((m): m is ContactMethod => !!m)
    .map((m) => ({ id: m.id, kind: m.kind, label: m.label || '', value: m.value }));
}
