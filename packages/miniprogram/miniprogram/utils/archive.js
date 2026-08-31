/**
 * Archive cloud API wrapper (task 4.6).
 *
 * Wraps the three archive cloud functions (`archive/export`,
 * `archive/import`, `archive/deleteAll`) and normalises every response into
 * a small state machine:
 *
 *   { state: 'progress', message }
 *   { state: 'permission_denied', code, message }
 *   { state: 'failure', code, message }
 *   { state: 'retry', code, message }      // transient cloud failure
 *   { state: 'partial_cleanup', error, cleanup, leftovers }
 *   { state: 'success', payload }
 *
 * The state names map directly to the four acceptance criteria:
 *
 *   - Progress covers the long-running export / import / delete phases.
 *   - Permission-denied surfaces `unauthorized` and ownership mismatches.
 *   - Failure covers invalid archives, expired receipts, schema violations,
 *     and any non-transient error.
 *   - Retry covers network / cloud-function hiccups the client may retry.
 *   - Partial-cleanup is the explicit state when deleteAll finishes but the
 *     post-scan finds leftover records; the client MUST NOT silently treat
 *     this as success.
 *
 * No call path returns a `success` state unless the cloud function explicitly
 * reported success. No payload is silently swallowed.
 */

const cloud = require('./cloud.js');

const ARCHIVE_STATES = Object.freeze({
  PROGRESS: 'progress',
  PERMISSION_DENIED: 'permission_denied',
  FAILURE: 'failure',
  RETRY: 'retry',
  PARTIAL_CLEANUP: 'partial_cleanup',
  SUCCESS: 'success',
});

/** Map a cloud error code to one of our state machine values. */
function classifyError(code) {
  if (!code) return ARCHIVE_STATES.FAILURE;
  switch (code) {
    case 'unauthorized':
    case 'ownership_mismatch':
    case 'public_boundary_violation':
      return ARCHIVE_STATES.PERMISSION_DENIED;
    case 'token_expired':
    case 'token_already_used':
    case 'token_missing':
    case 'token_mismatch':
    case 'invalid_shape':
    case 'invalid_request':
    case 'invalid_action':
    case 'wrong_kind':
    case 'unsupported_version':
    case 'future_version':
    case 'section_version_mismatch':
    case 'checksum_mismatch':
    case 'encrypted_archive':
    case 'not_found':
    case 'partial_cleanup':
      return ARCHIVE_STATES.FAILURE;
    case 'rate_limited':
    case 'TIMEOUT':
    case 'network':
      return ARCHIVE_STATES.RETRY;
    case 'internal_error':
      return ARCHIVE_STATES.RETRY;
    default:
      return ARCHIVE_STATES.FAILURE;
  }
}

function normalizeCloudError(err) {
  if (!err) {
    return { state: ARCHIVE_STATES.FAILURE, code: 'unknown', message: 'unknown cloud error' };
  }
  const code = err.code || 'internal_error';
  const message = err.message || String(err);
  return { state: classifyError(code), code, message };
}

/**
 * Normalise a successful cloud response. The cloud functions wrap their
 * results in `{ ok: true, result: {...} }` — we unwrap and check for the
 * `state` field the cloud function returns inside `result`.
 */
function normalizeSuccess(payload) {
  if (!payload) {
    return { state: ARCHIVE_STATES.FAILURE, code: 'empty_response', message: 'cloud returned empty payload' };
  }
  const inner = (payload.result && typeof payload.result === 'object') ? payload.result : payload;
  if (typeof inner.state !== 'string') {
    // Cloud function did not declare a state — treat as failure, never silent success.
    return {
      state: ARCHIVE_STATES.FAILURE,
      code: 'missing_state',
      message: 'cloud response is missing the required state field',
      raw: inner,
    };
  }
  // partial_cleanup is the success-like path that still carries an error block.
  if (inner.state === 'partial_cleanup') {
    return {
      state: ARCHIVE_STATES.PARTIAL_CLEANUP,
      code: 'partial_cleanup',
      message: (inner.error && inner.error.message) || 'delete-all left leftovers',
      cleanup: inner.cleanup,
      leftovers: inner.leftovers,
      error: inner.error,
    };
  }
  if (inner.state === ARCHIVE_STATES.PERMISSION_DENIED
    || inner.state === ARCHIVE_STATES.FAILURE) {
    return {
      state: inner.state,
      code: (inner.error && inner.error.code) || 'unknown',
      message: (inner.error && inner.error.message) || 'cloud reported an error',
      error: inner.error,
    };
  }
  if (inner.state === ARCHIVE_STATES.SUCCESS) {
    return { state: ARCHIVE_STATES.SUCCESS, payload: inner };
  }
  return {
    state: ARCHIVE_STATES.FAILURE,
    code: 'unexpected_state',
    message: `cloud returned unexpected state "${inner.state}"`,
    raw: inner,
  };
}

/**
 * Internal: invoke a cloud function with state normalisation. Calls go
 * through the existing `cloud.callFunction` so retries / timeouts / WRITE
 * classification stay consistent with the rest of the app.
 */
async function invoke(name, data, options) {
  let raw;
  try {
    raw = await cloud.callFunction(name, data, options || { idempotent: false });
  } catch (err) {
    return normalizeCloudError(err);
  }
  if (raw && raw.ok === false && raw.error) {
    return normalizeCloudError(raw.error);
  }
  return normalizeSuccess(raw);
}

/**
 * Export the owner's private archive. Returns the archive JSON, digest,
 * serialized form (ready to save to disk), and per-section metadata.
 *
 * Options:
 *   includeConversations: bool — only true when the owner explicitly opted in.
 */
function exportPrivateArchive(options) {
  const includeConversations = !!(options && options.includeConversations);
  return invoke('archive-export', {
    action: 'exportPrivateArchive',
    includeConversations,
  });
}

function exportPublicArchive(options) {
  const ownerId = options && options.ownerId;
  return invoke('archive-export', {
    action: 'exportPublicArchive',
    ...(ownerId ? { ownerId } : {}),
  });
}

/**
 * Prepare a fresh archive AND write a server-side receipt that authorizes a
 * subsequent deleteAll call. The receipt lives 5 minutes and is single-use.
 *
 * The serialized JSON returned here is the data the client should write to
 * disk (so the owner has a local backup BEFORE deleting).
 */
function prepareDeleteAll(options) {
  const includeConversations = !!(options && options.includeConversations);
  return invoke('archive-export', {
    action: 'prepareDeleteAll',
    includeConversations,
  });
}

/**
 * Import a previously-exported archive. `archive` MUST be the parsed JSON
 * document, not a stringified envelope. `rekeyToOpenid` is optional and only
 * honored when the archive was originally exported by this OPENID.
 */
function importArchive(archive, options) {
  if (!archive) {
    return Promise.resolve({
      state: ARCHIVE_STATES.FAILURE,
      code: 'invalid_request',
      message: 'archive is required',
    });
  }
  const payload = { action: 'importArchive', archive };
  if (options && options.rekeyToOpenid) {
    payload.rekeyToOpenid = options.rekeyToOpenid;
  }
  return invoke('archive-import', payload);
}

/**
 * Delete all owner-scoped cloud data. The confirmation MUST come from a
 * prepareDeleteAll call earlier in the same session; the cloud function
 * refuses everything else.
 */
function deleteAll(confirmation) {
  return invoke('archive-deleteAll', {
    action: 'deleteAll',
    confirmation: confirmation || null,
  });
}

/**
 * State-machine helpers. UI surfaces call these to render explicit states.
 * Each helper accepts the normalised result envelope (an object with a
 * `state` field) and returns whether the envelope is in that state.
 */
function isSuccess(result) {
  return !!result && result.state === ARCHIVE_STATES.SUCCESS;
}
function isFailure(result) {
  return !!result && (
    result.state === ARCHIVE_STATES.FAILURE
    || result.state === ARCHIVE_STATES.PERMISSION_DENIED
    || result.state === ARCHIVE_STATES.PARTIAL_CLEANUP
  );
}
function isRetryable(result) {
  return !!result && result.state === ARCHIVE_STATES.RETRY;
}
function isPartialCleanup(result) {
  return !!result && result.state === ARCHIVE_STATES.PARTIAL_CLEANUP;
}
function isInProgress(result) {
  return !!result && result.state === ARCHIVE_STATES.PROGRESS;
}

module.exports = {
  ARCHIVE_STATES,
  exportPrivateArchive,
  exportPublicArchive,
  prepareDeleteAll,
  importArchive,
  deleteAll,
  classifyError,
  isSuccess,
  isFailure,
  isRetryable,
  isPartialCleanup,
  isInProgress,
};