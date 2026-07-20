# Security Policy

VibeCard handles private memory and contact data by design, so we treat
security reports with priority.

## Supported Versions

| Version / branch | Supported |
|---|---|
| `main` (latest) | ✅ |
| Latest tagged release | ✅ |
| Older releases and historical `docs/archive/` code | ❌ |

The competition MVP is pre-1.0; fixes land on `main` and the next tag.

## Reporting A Vulnerability

**Do not open a public issue for a vulnerability.**

Report privately through either channel:

1. **GitHub Security Advisories** on this repository
   (Security → Advisories → "Report a vulnerability") — preferred.
2. Email: **security@vibecard.example** (placeholder — replace with the
   project security contact before public launch).

Please include: affected package/surface, reproduction steps, what data or
boundary is exposed, and whether you believe the issue is already being
exploited. You may encrypt sensitive details if a project PGP key is
published here later.

## What Counts As A Security Issue In VibeCard

Beyond generic web/cloud vulnerabilities, the following are
security issues in this product specifically:

- **Memory-visibility leaks**: `private` or `agent_only` memory exposed to a
  visitor, a public Card, logs, or another owner session.
- **Public Card contact exposure**: owner contact details (WeChat ID, phone,
  email) returned from any public Card or visitor-facing endpoint without an
  approved connection request.
- **Agent prompt-injection paths**: visitor- or owner-supplied content that
  can steer the agent into revealing private memory, bypassing visibility
  filters, or emitting unvalidated structured output that changes
  application state.
- **Cloud function permission bypass**: any path where a caller can read or
  write another user's memories, cards, `now_items`, conversations, or
  connection requests, or act as the owner.
- **Moderation/report/block bypass**: stranger-generated content reaching a
  user despite moderation failure (moderation failure must never default to
  safe), or blocked users still interacting.
- **Secrets in the repository**: real API keys, WeChat private keys, wallet
  keys, env files with real values, or production user data committed to any
  branch (see `docs/engineering/OPEN_SOURCE.md` §6).
- **Rate-limit evasion** on visitor conversations or connection requests.

If you are unsure whether something qualifies, report it — we would rather
triage a non-issue than miss a leak of private memory.

## Response Expectations

- **Acknowledgement**: within 3 business days.
- **Initial assessment**: within 7 days, including severity and whether a
  hotfix or a scheduled fix is appropriate.
- **Credential exposures** (committed secrets): treated as incidents —
  rotate first, then purge history; we will coordinate with the reporter.
- We credit reporters in release notes unless you prefer to stay anonymous.
- Please give us reasonable time to fix before any public disclosure; we
  will keep you informed of progress.

## Scope Notes

- The deterministic mock AI provider and fixture data are test surfaces;
  issues there count only if they also affect a real deployment path.
- `docs/archive/` contains historical, unmaintained documents and is out of
  scope.
