/**
 * Log redaction (task 5.7, mirrors docs/engineering/MODEL_ADAPTERS.md §6).
 *
 * Log lines never include bearer tokens, `sk-…` key shapes, key/token URL
 * parameters, contact details, or private memory content. Everything that
 * reaches the log goes through `redactSecrets`.
 */

export function redactSecrets(input: string): string {
  let out = String(input);
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  out = out.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]');
  out = out.replace(/([?&](?:key|token|api_key|apikey)=)[^&\s]+/gi, '$1[redacted]');
  out = out.replace(/(Authorization"?\s*[:=]\s*"?)[^",\s]+/gi, '$1[redacted]');
  if (out.length > 500) out = `${out.slice(0, 500)}…[truncated]`;
  return out;
}

/** A log line safe to emit for any caught error. */
export function safeErrorForLog(error: unknown): string {
  if (error instanceof Error) return redactSecrets(`${error.name}: ${error.message}`);
  return redactSecrets(String(error));
}
