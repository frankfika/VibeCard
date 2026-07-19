/**
 * Moderation core (task 3.1) — pure logic, injectable openapi.
 *
 * Rules (AGENTS.md §9): stranger-generated content must never default to
 * safe. A moderation failure produces an explicit `unavailable` state, and
 * callers must treat it as "do not publish, let the user retry".
 *
 * Result shape:
 *   { status: 'safe' | 'unsafe' | 'unavailable', safe: true | false | null, message }
 */

const TRANSIENT_ERRCODES = new Set([-1, 87010, 87011]); // system busy / rate-ish transient failures
const UNSAFE_ERRCODE = 87014;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransient(error) {
  if (!error) return true;
  if (typeof error.errCode === 'number') return TRANSIENT_ERRCODES.has(error.errCode);
  // Network / SDK-level errors (no errCode) are treated as transient.
  return true;
}

/**
 * Check text with retry on transient failures. Never throws for moderation
 * outcomes; only programming errors (missing content) throw.
 */
async function checkTextWithRetry(openapi, content, { retries = 2, backoffMs = 300 } = {}) {
  if (typeof content !== 'string' || !content.trim()) {
    const err = new Error('content_required');
    err.code = 'content_required';
    throw err;
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      const result = await openapi.security.msgSecCheck({ content });
      if (result.errCode === 0) {
        return { status: 'safe', safe: true, message: 'Content is safe' };
      }
      return { status: 'unsafe', safe: false, message: 'Content contains illegal or sensitive information' };
    } catch (err) {
      if (err && err.errCode === UNSAFE_ERRCODE) {
        return { status: 'unsafe', safe: false, message: 'Content contains illegal or sensitive information' };
      }
      if (isTransient(err) && attempt <= retries) {
        await delay(backoffMs * attempt);
        continue;
      }
      // Never default stranger content to safe.
      return {
        status: 'unavailable',
        safe: null,
        message: 'Content check is temporarily unavailable; nothing was published',
      };
    }
  }
}

/**
 * Decide whether stranger-generated content may proceed.
 *   safe       -> proceed
 *   unsafe     -> block with moderation_blocked
 *   unavailable-> block with moderation_unavailable (retryable, draft preserved)
 */
function gateStrangerContent(result) {
  if (result.status === 'safe') return { allowed: true };
  if (result.status === 'unsafe') {
    return { allowed: false, code: 'moderation_blocked', message: '内容未通过安全审核，请修改后再试' };
  }
  return { allowed: false, code: 'moderation_unavailable', message: '内容安全检查暂时不可用，请稍后重试，内容已保留' };
}

module.exports = { checkTextWithRetry, gateStrangerContent, UNSAFE_ERRCODE };
