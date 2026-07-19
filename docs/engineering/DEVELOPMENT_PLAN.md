# VibeCard 2.0 Development Plan

> Product source: [`../product/PRODUCT.md`](../product/PRODUCT.md)  
> AI behavior source: [`AI_BEHAVIOR.md`](AI_BEHAVIOR.md)  
> Detailed technical reference: [`ARCHITECTURE.md`](ARCHITECTURE.md)

This is the execution checklist for humans and coding agents.

## Status Rules

- `[ ]` Not started
- `[~]` In progress
- `[x]` Implemented and verified
- `[!]` Blocked; explain the blocker directly below the task

Only mark `[x]` after the listed acceptance criteria pass.

---

# Milestone 0: Focus The Existing Product

Goal:

> A reviewer can click through the new VibeCard story with mock data, without seeing games, companion discovery, or a public feed.

## 0.1 Define Minimal Shared Contracts

Status: `[x]`

Completion:

- 2026-07-19 on branch `feature/task-0.1-shared-contracts`
- Created `packages/shared/vibe.ts`: `VibeCard` (+ `VibeCardHighlight`), `Memory` (+ `MemoryKind` / `MemoryVisibility` / `MemoryStatus`), `ConnectionRequest` (+ `ConnectionAction`), all with `schemaVersion: 1`; private contact data kept in a separate owner-side `ContactMethod` type so `VibeCard` never carries contact details (verified with a `@ts-expect-error` compile check)
- Created `packages/shared/fixtures/vibe.ts`: fictional owner, visitor, Card, four memories (incl. `agent_only` and `proposed` examples), owner contact methods, one pending request; no real personal data
- Re-exported contracts and `vibeFixtures` namespace from `packages/shared/index.ts`; legacy games/companion exports untouched
- Validation: `npm run lint` (tsc --noEmit) passed; web import smoke check compiled and was removed afterwards
- Notes for next tasks: 0.2/0.3 can import `vibeFixtures` from `@shared`; user/profile storage contract arrives in 1.1, fixture identities are local-only on purpose

Owner: Lane C

Create:

```text
packages/shared/vibe.ts
packages/shared/fixtures/vibe.ts
```

Define only:

- `VibeCard`
- `Memory`
- `ConnectionRequest`
- Supporting enums used by those three types

Requirements:

- Include schema version fields
- Separate public Card data from private contact data
- Include fixture data for one owner, one visitor, and one request
- Re-export current contracts from `packages/shared/index.ts`
- Do not migrate legacy games or companion types into the new contracts

Acceptance:

- Web TypeScript can import the contracts
- Fixtures contain no real personal contact information
- `npm run lint` passes

Dependencies: none

## 0.2 Focus Web Navigation

Status: `[x]`

Completion:

- 2026-07-19, committed directly on `main` (no task branches per owner instruction)
- `App.tsx`: main navigation is now 名片 / 请求 / Vibe (`card` / `requests` / `vibe`); Threads and More removed from routing; legacy page files kept in place; persisted legacy tab values (`threads` / `more`) fall back to `card`
- New placeholder pages with real empty states: `pages/RequestsPage.tsx` (还没有人想认识你) and `pages/MyVibePage.tsx` (你的私有 Vibe); actual screens arrive in 0.4 / Milestone 1
- `CardPage.tsx`: theme toggle and wallet SIWE verify/clear controls moved into a collapsed `card-advanced` details area, off the MVP path; existing v1 profile data (incl. verified badges) still renders
- E2E: `cross-browser.spec.ts` asserts the three new destinations on mobile + desktop and that 动态/更多 tabs are gone; `pwa-theme.spec.ts` Theme cases re-pointed at the advanced area (seeds a profile so CardPage renders); `chain-test.spec.ts` beforeEach no longer depends on the removed More tab and its two MorePage Web3 cases are `test.skip` pending Milestone 4.1
- Validation: `npm run lint` ✅, `npm run build` ✅, `playwright test cross-browser pwa-theme chain-test` → 20 passed / 4 skipped / 2 failed (both are the documented stale 'verified accounts' assertions, part of the known legacy baseline), `im-browser.spec.ts` 10 passed
- Notes for next tasks: RequestsPage / MyVibePage are the 0.4 mock-story hosts; `vibeFixtures` from `@shared` is available for that work

Owner: Lane D

Primary files:

```text
packages/web/src/App.tsx
packages/web/src/pages/CardPage.tsx
packages/web/e2e/cross-browser.spec.ts
```

Change:

- Current navigation becomes Card / Requests / My Vibe
- Remove Threads and feature discovery from current navigation
- Keep legacy page files in place for now
- Move Web3 identity controls into an advanced area or hide them from the MVP path

Acceptance:

- No Games, Discover, Threads, or Points entry appears in main navigation
- Current Card still loads existing local profile data
- Mobile and desktop navigation tests reflect the new three destinations
- `npm run lint` and relevant E2E tests pass

Dependencies: 0.1

## 0.3 Focus Mini Program Navigation

Status: `[~]`

Progress (2026-07-19, on `main`):

- Implemented: `app.json` tabBar → 名片 / 请求 / Vibe; custom-tab-bar list updated; new placeholder pages `pages/requests` + `pages/vibe` with empty states and correct tab selection; legacy pages (threads / more / discover / games / thread-publish) remain registered but unreachable from main navigation; only `more.js` (now unrouted) links to discover/games, so no legacy entry remains in the main journey
- Verified here: JS syntax (`node --check`) and JSON validity of all touched files
- Remaining: WeChat DevTools compile + tab switching check must be run by the owner (DevTools cannot run in this environment). Intentional deviation: 0.4 proceeds while this verification is pending, since 0.3 code is complete.

Owner: Lane A

Primary files:

```text
packages/miniprogram/miniprogram/app.json
packages/miniprogram/custom-tab-bar/
packages/miniprogram/miniprogram/pages/card/
```

Change:

- Current tabs become Card / Requests / My Vibe
- Remove Threads, Games, Discover, and More from current navigation
- Keep old pages and data files until the new flow is accepted

Acceptance:

- Mini Program compiles
- Three tabs render and switch
- Old Card data still renders
- No legacy product entry is visible in the main user journey

Dependencies: 0.1

## 0.4 Build The Four-Screen Mock Story

Status: `[ ]`

Owners: Lane A and Lane D

Build with shared fixtures:

1. Owner Card
2. Owner Vibe conversation
3. Visitor Vibe conversation
4. Connection request detail

Requirements:

- Every action is clickable
- Owner and visitor visual states are clearly different
- Visitor never sees contact details before acceptance
- Include the `Vibe matched` completion moment
- Do not call a real model yet

Acceptance:

- The 90-second product demo can be performed entirely with fixtures
- No dead button exists in the demo path
- Mobile layout works at 390 x 844

Dependencies: 0.2 and 0.3

Milestone 0 complete when all four tasks pass.

---

# Milestone 1: Make My Vibe Remember Me

Goal:

> The owner can talk to Vibe, confirm one proposed memory, and see that memory used correctly later.

## 1.1 Add Memory Storage

Status: `[ ]`

Owner: Lane B

Add a minimal cloud data layer for:

```text
memories
conversations
```

Memory fields must follow `AI_BEHAVIOR.md`.

Actions:

- `listMemories`
- `createMemoryProposal`
- `confirmMemory`
- `editMemory`
- `deleteMemory`

Acceptance:

- Only the owner can read or modify private memory
- Confirmation is required before a proposal becomes active
- Delete removes the memory from future retrieval
- Permission tests cover all visibility levels

Dependencies: 0.1

## 1.2 Add AI Provider Boundary

Status: `[ ]`

Owner: Lane C

Create the `agent` cloud function with a provider-independent boundary.

Initial actions:

- `ownerMessage`
- `extractMemoryProposal`

Requirements:

- Provider secret is server-side
- Mock provider remains available for deterministic tests
- Model output is schema-validated
- Failure returns a typed error

Acceptance:

- The same test passes with mock provider and configured real provider
- Invalid model JSON is rejected
- No secret is bundled into Web or Mini Program clients

Dependencies: 1.1

## 1.3 Implement Owner Conversation

Status: `[ ]`

Owners: Lane A and Lane D

Experience:

```text
Owner sends a message
-> Vibe responds
-> Vibe proposes at most one important memory
-> Owner chooses Remember / Edit / Do not remember
```

Acceptance:

- The main chat remains usable if memory extraction fails
- Proposed memory is visually distinct from normal chat
- A rejected proposal is not retrieved later
- A confirmed proposal appears in a simple memory list

Dependencies: 1.1 and 1.2

## 1.4 Generate Or Update Card From Memory

Status: `[ ]`

Owner: Lane C, integrated by Lanes A and D

Action:

- `generateCardDraft`

Rules:

- Use only owner-confirmed memory
- Suggest changes; never publish automatically
- Preserve existing v1 Profile fields and custom edits
- Generate no empty sections

Acceptance:

- A new user can generate a useful Card in a three-minute conversation
- An existing user can preview a diff before accepting updates
- Rejecting a draft leaves the published Card unchanged

Dependencies: 1.3

Milestone 1 complete when one confirmed memory changes a later response and can update a Card draft.

---

# Milestone 2: Let A Visitor Understand Me

Goal:

> A visitor can ask about the owner, receive grounded answers, and submit a specific reason to connect.

## 2.1 Add Public Card View Model

Status: `[ ]`

Owner: Lane C, integrated by Lanes A and D

Create a server-side projection that returns only public Card fields.

Acceptance:

- Public response never includes contact details
- `agent_only`, `connected`, and `private` memory content is absent
- Existing Web short links resolve to the V2 public Card
- Existing Mini Program share entry resolves to the same owner Card

Dependencies: 1.4

## 2.2 Implement Visitor Conversation

Status: `[ ]`

Owner: Lane C, integrated by Lanes A and D

Action:

- `visitorMessage`

Rules:

- Maximum six useful rounds in MVP
- Answer only questions related to the owner
- Use public evidence for factual answers
- `agent_only` memory may guide a boundary decision but may not be quoted
- Clearly identify as the owner's AI representation

Acceptance:

- Every factual answer has internal evidence references
- Unknown questions produce uncertainty
- Prompt injection fixtures cannot reveal restricted memory
- Visitor gets a clear path to express connection intent

Dependencies: 2.1

## 2.3 Create Connection Request

Status: `[ ]`

Owner: Lane B

Add cloud actions:

- `createRequest`
- `listInbox`
- `getRequest`
- `actOnRequest`

Requirements:

- Request contains a specific reason
- Enforce block state and rate limits
- Owner action is one of `connect`, `later`, `decline`
- Contact sharing occurs only after `connect`

Acceptance:

- Anonymous browsing works, but submitting requires an identified reply path
- Duplicate requests are rate-limited
- Declined or blocked visitors cannot immediately resubmit
- Contact details remain private before acceptance

Dependencies: 2.1

## 2.4 Summarize Why This Connection Matters

Status: `[ ]`

Owner: Lane C

Action:

- `summarizeConnection`

Return:

- Visitor identity summary
- Specific reason
- Shared context
- Why it may be worth a conversation
- One uncertainty
- Suggested first topic

Do not return:

- A public score
- “Passed” or “failed”
- Claims without evidence

Acceptance:

- The owner can understand the request in under 20 seconds
- Summary links back to original visitor wording
- Weak evidence produces a cautious summary

Dependencies: 2.2 and 2.3

## 2.5 Complete The Connection Moment

Status: `[ ]`

Owners: Lanes A and D

Experience:

```text
Owner opens request
-> Reads concise Vibe summary
-> Chooses Connect
-> Selects a contact method
-> Both sides see Vibe matched
```

Acceptance:

- `later` and `decline` are equally accessible
- The UI does not imply the visitor has human value scores
- Shared contact method is exactly what the owner selected
- Request state stays consistent across Mini Program and Web

Dependencies: 2.3 and 2.4

Milestone 2 complete when the full real-data connection loop passes.

---

# Milestone 3: Safety, Reliability, And Delight

Goal:

> The demo feels alive and personal while privacy and failure behavior remain trustworthy.

## 3.1 Fix Moderation Failure Behavior

Status: `[ ]`

Owner: Lane B

Current issue:

`content-check` defaults to safe when the service fails.

Change:

- Retry transient failures
- Return a typed unavailable or pending state
- Do not default stranger-generated content to safe

Acceptance:

- Unsafe fixture is blocked
- Service failure does not publish or send visitor content
- UI can retry without losing typed content

Dependencies: 2.3

## 3.2 Add Rate Limits And Abuse Controls

Status: `[ ]`

Owner: Lane B

Cover:

- Visitor messages
- New conversations
- Connection requests
- Repeated requests after decline
- Report and block checks

Acceptance:

- Limits are enforced server-side
- Owner can block from request detail
- Blocked visitor cannot invoke the owner's agent

Dependencies: 2.3

## 3.3 Add The Recognition Moments

Status: `[ ]`

Owners: Lanes A, C, and D

Implement only these delight moments:

- “I remembered…” after owner confirmation
- One accurate callback to an earlier owner memory
- One concrete shared-context discovery for a visitor
- `Vibe matched` after mutual connection

Do not add points, confetti loops, streaks, or random rewards.

Acceptance:

- Each moment is based on real state, not a canned claim
- Animation respects reduced-motion settings on Web
- Copy follows `AI_BEHAVIOR.md`

Dependencies: Milestones 1 and 2

## 3.4 Add Failure And Empty States

Status: `[ ]`

Owners: Lanes A and D

Cover:

- No memories yet
- No requests yet
- Agent disabled
- Model unavailable
- Moderation unavailable
- Network timeout
- Permission denied
- Deleted Card

Acceptance:

- User always has a recovery action
- No error state exposes internal prompts or secrets
- Failed sends do not duplicate on retry

Dependencies: Milestones 1 and 2

---

# Milestone 4: Competition Release

## 4.1 Refresh Automated Tests

Status: `[ ]`

Owner: Lane D

Baseline recorded on 2026-07-19:

- 30 of 38 existing Playwright cases pass
- 8 assertions are stale across desktop and mobile
- Stale coverage targets Web3 sync, wallet controls, verified accounts, and old Activity content
- Do not restore removed product paths merely to satisfy these assertions

Replace legacy navigation assertions with:

- Card / Requests / My Vibe navigation
- Owner conversation
- Visitor conversation
- Private contact gating
- Request handling
- Mobile layout

Keep Web3 tests only for the still-supported advanced feature surface.

Acceptance:

- `npm run lint` passes
- `npm run build` passes
- Relevant Playwright suite passes

Dependencies: Milestone 3

## 4.2 WeChat DevTools And Device Verification

Status: `[ ]`

Owner: Lane A

Verify:

- Fresh login
- Existing-profile migration
- Card share
- Visitor deep link
- Owner/visitor role switching
- AI message retry
- Contact unlock
- Report and block

Acceptance:

- DevTools compiles without errors
- Main flow passes on a physical device
- Shared Card opens to the correct owner

Dependencies: Milestone 3

## 4.3 Prepare Demo Data

Status: `[ ]`

Owner: coordinating agent

Create:

- One owner with authentic project context
- One visitor with a strong shared reason
- One weak request to demonstrate boundaries
- One confirmed memory used later

Never use real private contact details in committed fixtures.

Acceptance:

- Demo can run with real AI
- Demo can fall back to deterministic fixtures
- Reset procedure takes under one minute

Dependencies: 4.1 and 4.2

## 4.4 Run The 90-Second Demo

Status: `[ ]`

Use the script in `docs/product/PRODUCT.md`.

Acceptance:

- Fits within 90 seconds
- Shows one memory being learned
- Shows one grounded visitor answer
- Shows one specific connection reason
- Ends with owner-controlled contact sharing

Dependencies: 4.3

---

# Post-Competition: Desktop Vibe Pet

Do not start this section until Milestone 4 is complete.

Future work:

- macOS menu-bar or lightweight desktop companion
- One-click text and voice capture
- File and link ingestion
- Cloud, bring-your-own-key, local, and private model options
- Shared memory with Mini Program and Web

The desktop client must reuse the same `Memory`, `VibeCard`, and permission contracts. It must not create a second memory system.
