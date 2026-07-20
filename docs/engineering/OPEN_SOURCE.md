# Open Source Contract

This document defines how VibeCard is licensed, governed, and released as an
open-source project. It is the authoritative reference for the decisions
required by DEVELOPMENT_PLAN task 5.1.

## 1. Licensing Split

VibeCard uses a deliberate two-tier licensing policy:

- **Copyleft (AGPL-3.0-only) for the runnable product.** The hosted Core —
  everything needed to run a VibeCard service — stays open, including when it
  is offered as a network service. AGPL closes the "hosted fork" loophole:
  anyone who modifies the Core and serves it to users over a network must
  publish those modifications under the same license. This protects the
  project's promise that no proprietary server can ever become mandatory.
- **Permissive (MIT) for integration surfaces.** Contracts, SDKs, fixtures,
  and adapter-level code that third parties embed into their own systems are
  MIT, so adopters can build on the protocol without licensing friction.

### Per-package license table

| Package | License | Why |
|---|---|---|
| Repository root (docs, scripts, root config) | AGPL-3.0-only (`LICENSE`) | Default for the runnable product |
| `packages/miniprogram/` (Mini Program client) | AGPL-3.0-only (`packages/miniprogram/LICENSE`) | Runnable product client |
| `packages/miniprogram/cloudfunctions/*` (10 cloud functions) | AGPL-3.0-only (`license` field in each `package.json`) | Hosted Core: identity, memory, agent, connection logic |
| `packages/web/` (React app / public Card / PWA) | AGPL-3.0-only (`packages/web/LICENSE`, `license` field) | Runnable product client |
| `packages/shared/` (domain contracts & fixtures) | MIT (`packages/shared/LICENSE`, `license` field) | Integration surface: platform-free `VibeCard` / `Memory` / `ConnectionRequest` contracts |
| `packages/contracts/` (legacy/optional Web3 contracts) | MIT (`packages/contracts/LICENSE`, `license` field) | Integration surface for external on-chain tooling |
| `packages/platforms/` (future platform adapters) | No `package.json` yet; inherits root AGPL-3.0-only until published as an adapter SDK | Placeholder adapters |

Every first-party package that has a `package.json` declares its license in
the `license` field; packages without one carry a `LICENSE` file or inherit
the root license. New packages must follow this table: hosted-Core code is
AGPL-3.0-only, integration/SDK code is MIT.

### What this means in practice

- Local and self-hosted use requires **no paid license and no official
  VibeCard account**. The open-source runtime is complete on its own.
- VibeCard Cloud (the official managed service) charges only for
  infrastructure and service: hosting, sync, backups, managed AI usage,
  retrieval, and support. It never sells access to features withheld from
  the open-source code.
- No feature described as open source requires a proprietary server. If a
  feature cannot run on the open stack, it is not part of the open-source
  claim.
- Model, database, vector retrieval, and knowledge providers are
  replaceable adapters; none is a mandatory vendor.

## 2. Trademark And Naming Rules

The code is free; the name is not.

- The **code** in this repository may be used, modified, self-hosted, and
  redistributed under its license terms with no additional permission.
- The **"VibeCard" name and logo** are project identifiers, not part of the
  open license. You may not use them to brand a derived hosted service, app
  store listing, or commercial offering in a way that suggests it is the
  official VibeCard service, without written permission from the maintainers.
- Honest references are always fine: saying "powered by VibeCard",
  "compatible with VibeCard contracts", or "a fork of VibeCard" is permitted
  and encouraged, as long as it is factually accurate and not confusing.
- Forks and self-hosted instances must pick a distinct name for any public
  hosted service they operate.

These rules restrict naming only; they do not limit any freedom the AGPL or
MIT licenses grant over the code itself.

## 3. Contributing

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for setup, branch and commit
conventions, lane ownership, the contract-first rule, PR expectations, and
the definition of done. All contributors are expected to follow
[`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md).

## 4. Security Reporting

See [`SECURITY.md`](../../SECURITY.md). Do not open public issues for
vulnerabilities; report them privately through GitHub Security Advisories on
this repository or the contact listed there.

## 5. Release Process

- **Branching.** All work happens on feature branches off `main`
  (`feature/<task>-<slug>`). Multi-lane tasks use per-lane branches merged
  through a coordination branch owned by the coordinating agent (see
  AGENTS.md §6 lane ownership).
- **Review and validation.** Before merge, every change must pass
  `npm run lint` and `npm run build`, plus the relevant tests for the changed
  surface (Playwright e2e for web, `npm test --prefix packages/contracts`
  for contract work, Mini Program compile in WeChat DevTools for miniprogram
  changes). Definition of done: AGENTS.md §12.
- **Releases.** Milestones are tagged on `main` after their plan tasks pass
  acceptance. Release notes summarize user-facing outcomes and any migration
  or data-format changes.
- **Data format versioning.** Canonical user data contracts (`VibeCard`,
  `Memory`, `ConnectionRequest`, `NowItem`) are versioned in
  `packages/shared`; releases must keep stored v1 profile data loadable and
  document export/import compatibility.

## 6. Never Commit

The following must never enter the repository, in any branch or history:

- Cloud function environment configuration containing real values
  (e.g. `AI_API_KEY`, `AI_API_BASE` with production endpoints, WeChat cloud
  env secrets)
- Model provider API keys of any kind (OpenAI-compatible keys, Gemini keys,
  Pinata JWTs, etc.) — `.env.example` placeholders are fine, real values are
  not
- WeChat private keys, session keys, or any `*.key` / `*.pem` credential
- Wallet private keys or mnemonics (including test wallets that ever held
  real funds)
- Real personal data: phone numbers, WeChat IDs, email addresses, or contact
  details of real people. Fixtures and tests must use obviously fictional
  values (e.g. `13800000000`, `secret@example.com`, `fixture-wechat-*`)
- Production user data, database dumps, or exported memory/Card data from
  real users
- User-owned material outside the open-source scope, notably `pitch-deck/`
  content, which the owner manages separately

If any of the above is ever committed, treat it as a security incident:
rotate the credential immediately and follow SECURITY.md.
