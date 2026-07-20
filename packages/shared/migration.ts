/**
 * V1 profile migration mapping (task 5.2 Core, ARCHITECTURE.md §9).
 *
 * Pure, platform-free TypeScript. Existing users carry v1 profile data in
 * Web local storage and in the Mini Program `users.namecard` record. This
 * module owns the pure mapping from that v1 shape onto a VibeCard draft base:
 *
 * - existing owner-written text (motto / bio / intro / interests) is kept
 *   verbatim — migration never rewrites the owner's words
 * - contact-bearing namecard keys (wechat / socialLinks / contacts / ...) are
 *   never mapped into a public object
 * - migration is additive: v1 data is read, not destroyed
 *
 * Storage coupling (wx storage, cloud DB writes) stays in the platform
 * adapters; only the pure mapping lives here.
 */

/**
 * v1 namecard keys that may carry contact details. Anything not in the
 * projection allow-list below is dropped; these are called out explicitly
 * because they look presentational but are contact data.
 */
export const V1_CONTACT_KEYS = [
  'wechat',
  'phone',
  'mobile',
  'email',
  'telegram',
  'qq',
  'whatsapp',
  'socialLinks',
  'contacts',
  'contactMethods',
] as const;

/** v1 namecard keys that are safe to read for a public projection. */
export const V1_PRESENTATIONAL_NAMECARD_KEYS = [
  'intro',
  'motto',
  'theme',
  'coverImage',
  'interests',
] as const;

/**
 * The v1 owner profile shape as stored by the legacy product. Only the fields
 * the migration reads are typed; everything else passes through untouched.
 */
export interface V1UserProfile {
  nickname?: string;
  avatar?: string;
  bio?: string;
  namecard?: Record<string, unknown>;
  deleted?: boolean;
  status?: string;
}

/** Presentational subset of a v1 namecard, contact keys stripped. */
export interface V1PresentationalNamecard {
  intro?: unknown;
  motto?: unknown;
  theme?: unknown;
  coverImage?: unknown;
  interests?: unknown;
}

/**
 * Keep only known-presentational namecard fields. Contact keys are stripped
 * even if a v1 document carries them.
 */
export function sanitizeV1Namecard(namecard: unknown): V1PresentationalNamecard {
  if (!namecard || typeof namecard !== 'object') return {};
  const source = namecard as Record<string, unknown>;
  const clean: V1PresentationalNamecard = {};
  for (const key of V1_PRESENTATIONAL_NAMECARD_KEYS) {
    if (source[key] !== undefined) clean[key] = source[key];
  }
  return clean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** A deleted owner profile means the Card is gone. */
export function isV1ProfileDeleted(user: V1UserProfile | null | undefined): boolean {
  return !!user && (user.deleted === true || user.status === 'deleted');
}

/** Owner-written text preserved from the v1 profile for the Card draft. */
export interface V1CardBase {
  name: string;
  avatarUrl: string;
  headline: string;
  topics: string[];
}

/**
 * Map a v1 owner profile onto the Card draft base fields. Priority mirrors
 * the deployed rule: headline = namecard.motto || bio || namecard.intro;
 * topics come from namecard.interests (at most 8). Owner-written strings are
 * carried over verbatim — never trimmed into different words, never
 * AI-rewritten.
 */
export function v1ProfileToCardBase(user: V1UserProfile | null | undefined): V1CardBase {
  const namecard = sanitizeV1Namecard(user && user.namecard);
  return {
    name: (user && typeof user.nickname === 'string' ? user.nickname : '') || '',
    avatarUrl: (user && typeof user.avatar === 'string' ? user.avatar : '') || '',
    headline:
      (isNonEmptyString(namecard.motto) && namecard.motto) ||
      (user && isNonEmptyString(user.bio) && user.bio) ||
      (isNonEmptyString(namecard.intro) && namecard.intro) ||
      '',
    topics: Array.isArray(namecard.interests)
      ? namecard.interests.filter(isNonEmptyString).slice(0, 8)
      : [],
  };
}
