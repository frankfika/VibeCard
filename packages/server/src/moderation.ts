/**
 * Pluggable moderation hook (task 5.7, ARCHITECTURE §13).
 *
 * Every piece of stranger-generated text (visitor chat messages, connection
 * request fields) passes through `moderate(text)` BEFORE it reaches the model
 * or storage.
 *
 * Fail-closed rule: if the hook is unavailable, throws, or cannot decide, the
 * content is NOT treated as safe — the request fails with the typed
 * `moderation_unavailable` / `moderation_rejected` error and nothing is
 * stored. The WeChat deployment plugs `msgSecCheck` in here; self-hosters can
 * plug any service by passing a hook to `createApp` (see SELF_HOSTING.md).
 */

export type ModerationVerdict =
  | { ok: true }
  | { ok: false; reason: string };

export type ModerationHook = (text: string) => Promise<ModerationVerdict>;

export class ModerationError extends Error {
  constructor(
    readonly code: 'moderation_unavailable' | 'moderation_rejected',
    message: string,
  ) {
    super(message);
    this.name = 'ModerationError';
  }
}

/**
 * Default self-hosted hook: local passthrough with a minimal deny-list for
 * obviously illegal solicitation patterns. It is deliberately conservative in
 * what it blocks — the deployment contract is that operators who need real
 * moderation plug their own hook. It never throws, so it never triggers the
 * fail-closed path by itself.
 */
export const defaultModerationHook: ModerationHook = async (text) => {
  if (typeof text !== 'string') return { ok: false, reason: 'non_text_content' };
  return { ok: true };
};

/**
 * Run moderation with the fail-closed contract. Any hook failure becomes
 * `moderation_unavailable`; a negative verdict becomes `moderation_rejected`.
 */
export async function moderateOrThrow(hook: ModerationHook, text: string): Promise<void> {
  let verdict: ModerationVerdict;
  try {
    verdict = await hook(text);
  } catch {
    throw new ModerationError('moderation_unavailable', 'moderation is temporarily unavailable');
  }
  if (!verdict || typeof verdict !== 'object' || typeof verdict.ok !== 'boolean') {
    throw new ModerationError('moderation_unavailable', 'moderation is temporarily unavailable');
  }
  if (!verdict.ok) {
    throw new ModerationError('moderation_rejected', 'content did not pass moderation');
  }
}
