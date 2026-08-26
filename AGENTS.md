# VibeCard AI Development Guide

This file is the entry point for every coding agent working in this repository.

## 1. Read In This Order

Before editing code, read:

1. `docs/product/PRODUCT.md`
2. `docs/engineering/DEVELOPMENT_PLAN.md`
3. `docs/engineering/AI_BEHAVIOR.md`
4. `docs/engineering/ARCHITECTURE.md` only when implementation detail is needed

If documents conflict:

```text
User's newest instruction
> AGENTS.md
> PRODUCT.md
> DEVELOPMENT_PLAN.md
> AI_BEHAVIOR.md
> ARCHITECTURE.md
> archived documents
```

Files under `docs/archive/` describe older VibeCard, Bonjour, Orbit, Web3, games, and companion-discovery directions. Do not use them as current product requirements.

## 2. Current Product

VibeCard is a living AI namecard:

```text
Talk to my private Vibe
-> Confirm what it should remember
-> Confirm and publish selected recent Now updates
-> Publish selected memories to my VibeCard
-> Let a visitor talk to my public-facing Vibe
-> Receive a specific connection request
-> Decide whether to connect
```

The product should feel simple, warm, surprising, and personal.

The competition MVP has four user-facing surfaces:

1. My Card
2. My Vibe
3. Visitor conversation
4. Connection requests

## 3. Non-Goals

Do not add or expand:

- Games, card draws, quizzes, or icebreakers
- Companion activities or nearby people
- Public social feeds; owner-confirmed Now items inside a Card are allowed
- Anonymous social features
- Public compatibility scores
- Points, streaks, leaderboards, or daily check-in rewards
- CRM features
- Autonomous promises or messages sent as the owner
- Relationship data on-chain
- Desktop Vibe Pet during the competition MVP

The existing legacy implementations may remain in the repository until the focused navigation and new flow are stable. Remove them from current navigation before deleting code.

## 4. Product Rules

- Normal conversation is training. Do not build a separate complex training center.
- The AI may propose a memory, but only the owner can confirm it.
- Contact details are private by default.
- The visitor never sees an internal score.
- The AI explains why a connection may be worthwhile using concrete evidence.
- The owner makes the final connection decision.
- An AI response must clearly identify itself as an AI representation.
- A failure to retrieve evidence must result in uncertainty, not invention.
- Fun comes from recognition and meaningful coincidence, not game mechanics.
- Now is an owner-controlled public projection, never an automatic transcript or community feed.
- WeChat is the first client, not a permanent domain boundary.
- Long-term local and self-hosted modes must work without an official account.
- Model, storage, retrieval, and knowledge providers remain replaceable.
- Canonical user data must remain versioned, exportable, importable, and deletable.

## 5. Repository Map

```text
packages/web/                    React web and public Card
packages/miniprogram/            WeChat Mini Program and cloud functions
packages/server/                 Open self-hosted Server and portable HTTP API
packages/cloud/                  Optional managed gateway composed from Server/Core
packages/sdk/                    Provider/database-neutral TypeScript SDK
packages/desktop/                Optional macOS SwiftUI companion
packages/shared/                 Cross-client domain contracts
packages/contracts/              Legacy/optional Web3 contracts
packages/platforms/              Future platform adapters
docs/product/                    Current product truth
docs/engineering/                Current engineering truth
docs/archive/                    Historical reference only
pitch-deck/                      User-owned competition material
```

Do not modify user-owned untracked files such as `pitch-deck/` or root screenshots unless the user explicitly asks.

## 6. Source Ownership For Parallel Work

### Lane A: WeChat experience

Owns:

```text
packages/miniprogram/miniprogram/
```

### Lane B: Cloud data and connection requests

Owns:

```text
packages/miniprogram/cloudfunctions/
```

Exception: `packages/miniprogram/cloudfunctions/agent/` belongs to Lane C.

### Lane C: AI and shared contracts

Owns:

```text
packages/shared/
packages/miniprogram/cloudfunctions/agent/
```

### Lane D: Web and end-to-end tests

Owns:

```text
packages/web/
```

The coordinating agent owns:

```text
AGENTS.md
README.md
docs/
package.json
packages/miniprogram/miniprogram/app.json
```

When working alone, follow the same boundaries sequentially.

## 7. Contract-First Rule

The first shared domain objects are:

- `VibeCard`
- `Memory`
- `ConnectionRequest`

Define or update their contracts before implementing divergent client behavior.

Do not let clients parse free-form model text to decide application state. AI business outputs must be validated structured data.

Do not create a large API surface up front. Add an action only when a current milestone needs it.

## 8. Implementation Rules

- Follow existing React patterns in `packages/web`.
- Follow existing native Mini Program patterns in `packages/miniprogram`.
- Keep the first backend on WeChat Cloud Development.
- Keep AI provider credentials server-side.
- Reuse existing login, profile, sharing, short-link, moderation, reporting, and blocking capabilities.
- Preserve backward compatibility with stored v1 profiles.
- Prefer one clear screen state over nested modal flows.
- Keep owner and visitor roles explicit in code and tests.
- Add loading, empty, error, retry, and permission-denied states for every AI flow.
- Keep desktop support at the service-contract level only; do not implement the desktop app in MVP.
- Keep competition code simple, but do not put reusable domain rules inside WeChat-only APIs.
- Do not build a new vector database; add optional retrieval behind an adapter.
- Do not make official cloud services mandatory for the open-source runtime.

## 9. Privacy And Safety

- Filter data by visibility before retrieval.
- Never return owner contact details from a public Card endpoint.
- Never quote `agent_only` memory to a visitor.
- Never expose `private` memory outside the owner session.
- Treat model output as untrusted until schema validation succeeds.
- Rate-limit visitor conversations and connection requests.
- Respect report and block state before model invocation.
- For stranger-generated content, moderation failure must not default to safe.
- Do not log secrets, full contact details, or private memory content.

## 10. Working Procedure

Unless the user provides a different task:

1. Open `docs/engineering/DEVELOPMENT_PLAN.md`.
2. Select the earliest unchecked task whose dependencies are complete.
3. Read the referenced files before editing.
4. Implement the smallest complete user outcome.
5. Run the required validation.
6. Update the task checkbox only after validation passes.
7. Record any intentional deviation under the task.

Do not mark a task complete because code was written. Mark it complete only when its acceptance criteria pass.

## 11. Validation Commands

From repository root:

```bash
npm run lint
npm run build
```

For Web end-to-end tests:

```bash
npx playwright install chromium    # once per new machine or Playwright upgrade
npm run test:e2e --workspace=packages/web
```

Current verified baseline on 2026-08-08: the focused Playwright suite passes 70/70
across desktop and mobile projects.

For contract work only:

```bash
npm test --prefix packages/contracts
```

Mini Program changes also require:

- Open the project at `packages/miniprogram` in WeChat DevTools
- Compile without errors
- Verify owner and visitor paths separately
- Verify at least one physical-device share/deep-link flow before release

Run only the validations relevant to the changed surface during development, then run the full relevant suite before milestone completion.

## 12. Definition Of Done

A feature is done when:

- It produces the intended user outcome
- Owner and visitor permissions are correct
- Empty, loading, error, and retry states exist
- AI output is structured and validated
- Existing v1 profile data still loads
- Relevant tests pass
- Current documentation remains accurate

Do not commit or push unless the user asks.
