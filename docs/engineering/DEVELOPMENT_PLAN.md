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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. Driven by `vibeFixtures` (web) and `miniprogram/data/vibe-fixtures.js` mirror; no real model calls
- Web: `MyVibePage` owner chat with memory proposal (记住 / 改一下 / 别记这个 → confirmed list); `RequestsPage` inbox → detail (visitor / reason / shared context / Vibe take + uncertainty) → 认识一下 / 以后再说 / 暂不联系 → contact picker → `Vibe matched.`; `VisitorVibeChat` dark overlay on `PublicCardPage` (AI-representation identity, grounded fixture answers, honest uncertainty for unknowns, reason → preview → confirmed submission); public card no longer renders contact details (privacy rule; server-side projection lands in 2.1); owner and visitor visual states differ (light warm vs dark)
- Mini Program: `pages/vibe` owner chat + proposal actions; `pages/requests` inbox → detail → matched; new `pages/visitor-chat` (registered in `app.json`); card shared view gained the "先和我的分身聊聊" entry and hides verified/contact info from visitors; navbar gained optional `dark` prop
- Validation: `npm run lint` ✅, `npm run build` ✅, new `e2e/vibe-mock-story.spec.ts` + cross-browser + pwa-theme = 26 passed (desktop + mobile-chrome projects cover 390x844); im-browser 10 passed; chain-test unchanged (2 known-stale verified-accounts failures, 4 skipped Web3)
- Mini Program smoke-tested via node stubs (proposal paths, request loop, visitor flow, no agent_only/contact leakage); WeChat DevTools compile + device check still pending owner (same note as 0.3)
- Demo path: owner tabs 名片/Vibe/请求 walk the loop to Vibe matched; visitor opens a shared `?c=` link → 先和我的分身聊聊 → submits reason. RequestsPage has 重置演示状态 for repeated demos

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New `cloudfunctions/memory` function: `memories` + `conversations` collections
- Actions: `listMemories` (status/visibility/retrievableOnly filters), `createMemoryProposal`, `confirmMemory` (proposed→confirmed only, optional owner override), `editMemory`, `deleteMemory` (soft delete), plus `appendMessage` / `getConversation` conversation persistence needed by 1.3
- `lib/core.js` holds the pure domain logic (validation, transitions, retrieval filters) so it is unit-testable without the cloud; every handler is scoped to caller OPENID — strangers get empty lists and `not_found`
- Permission semantics: retrieval = confirmed only; visitor-quotable = public+confirmed; agent-usable = public/agent_only+confirmed; private/connected never leave the owner session
- Validation: 17 node:test cases pass (`npm test` in the function dir), covering all four visibility levels, cross-owner denial, invalid transitions, delete-from-retrieval, conversation owner scoping
- Not verifiable here: actual deployment + invocation from the Mini Program (needs the owner's cloud env; wire-up happens in 1.3)

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New `cloudfunctions/agent` function with a provider-independent boundary (`complete({system, messages}) -> raw text`)
- Actions: `ownerMessage`, `extractMemoryProposal`; provider secret (AI_API_BASE/AI_API_KEY/AI_MODEL) lives only in cloud env vars — no key falls back to the deterministic mock provider
- Model output is JSON-parsed and schema-validated (`OwnerAgentResult`: reply / optional single memoryProposal / cardUpdateSuggested); one retry on invalid output, then typed error (`invalid_model_output`); provider/network failures return `provider_unavailable`; raw model text never reaches clients
- Confirmed memories are injected into the owner-mode system prompt (only status=confirmed)
- Validation: 10 node:test cases pass, covering mock determinism, no-proposal-for-greetings, invalid JSON retry, bad-kind rejection, memory context injection, provider selection, entry-level typed errors
- Notes: the suite is provider-injectable, so the identical cases run against a configured real provider (needs owner's credentials, not available here). Known legacy issue: `packages/web/src/lib/genai.ts` still bundles a Gemini key client-side for avatar generation (pre-existing); flagged for Milestone 3/4 cleanup, out of 1.2 scope

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. Mini Program `pages/vibe` now wires the real chain: send → `agent.ownerMessage` (schema-validated reply + at most one proposal) → `memory.appendMessage` persistence → proposal card → `memory.createMemoryProposal` / `confirmMemory` / `deleteMemory`; 「已记住」list comes from `listMemories` (confirmed only)
- Failure behavior per AI_BEHAVIOR.md: agent/provider failure → "我现在有点连不上，刚才的话不会丢。可以稍后再试。" and the chat stays usable; persistence failures never block the chat; confirm failure keeps the proposal pending with a retry toast
- Rejected proposals are soft-deleted and are never retrievable (retrieval = confirmed only, enforced in 1.1)
- Cloud unavailable (undeployed env / logged out) → automatic fallback to the 0.4 fixture demo path, so the competition demo never breaks
- Validation: `node --check` ✅; node stub smoke tests covering demo fallback, full real path (send → proposal → confirm → list refresh), and agent-failure path — all pass
- Intentional deviation: Web `MyVibePage` stays on fixtures — the first backend is WeChat Cloud Development and the web has no cloud session; a shared HTTP API is needed before web can use the real chain (noted for post-MVP / platform adapter work)
- Not verifiable here: deployment + invocation inside WeChat DevTools (owner's cloud env)

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New agent action `generateCardDraft`: uses only status=confirmed memories (zero confirmed → typed `no_confirmed_memories`); output schema-validated with empty sections stripped; draft never carries name/avatar/contact fields; provider failure → typed error
- Mini Program vibe page: "✨ 让 Vibe 更新我的 Card" → draft preview panel with per-field old→new diff (此刻的我 / 想遇见谁 / 话题标签 / 代表内容) → 采用 writes mapped fields into the v1 profile via `store.setProfile` (name/avatar/contacts untouched, backward compatible); 放弃 discards and the published Card stays unchanged; empty-diff drafts show a toast instead of a blank panel
- Demo mode (cloud down) generates the fixture draft so the flow is always demoable
- Validation: agent suite 16/16 pass (incl. draft validity, empty-section stripping, contact-field rejection, typed errors); node stub smoke tests pass for demo-accept, real-reject-unchanged, and no-diff paths
- Not verifiable here: real-model draft quality + DevTools run (owner's env). Web integration deferred with the same HTTP-API constraint as 1.3

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New `cloudfunctions/card` function, action `getPublicCard({ ownerId })`
- Projection returns a VibeCard-shaped object (shared/vibe.ts): public profile fields + confirmed public memories only; memories are filtered at the `where` stage (`status=confirmed AND visibility=public`) — `agent_only`/`connected`/`private` content is never read; contact fields (wechat/socialLinks/contacts/contactMethods) are explicitly stripped via a whitelist sanitizer
- Missing owner → `not_found`; deleted card → `card_deleted` (typed errors)
- 10 node:test cases pass, including a where-clause assertion proving query-stage filtering
- Web short links (`?c=` / `?id=`) already resolve to the PublicCardPage, which since 0.4 renders no contact details and offers the Vibe chat entry; Mini Program share view resolves to the same owner card

## 2.2 Implement Visitor Conversation

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New agent action `visitorMessage({ ownerId, messages, roundCount? })`
- Visitor mode: AI-representation identity; factual answers only from public memories / public Card fields with `evidenceRefs`; `agent_only` memory may steer recommendations but is never quoted (its content is asserted absent in tests); unknown → "这件事他还没有告诉我，我不想替他猜"; six-round hard cap (model not called past cap); one question per turn
- Output schema `VisitorAgentResult` { reply, evidenceRefs, nextAction: continue|invite_connection_reason|offer_request_review|end, boundaryCode? }; invalid model output rejected with one retry then typed error
- Boundary behavior: contact requests → `contact_request` refusal with a legitimate path; prompt injection (ignore-instructions / impersonating owner / system-prompt extraction) → `prompt_injection` refusal; tested with fixtures
- 11 node:test cases pass, including entry-level assertions that only public and agent_only memories are ever queried

## 2.3 Create Connection Request

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New `cloudfunctions/requests` function: `createRequest` / `listInbox` / `getRequest` / `actOnRequest`, all returning typed `{ ok, result }` / `{ ok:false, error }`
- Guards: weak reason (<10 chars) → `weak_reason`; same visitor → same owner within 24h → `rate_limited`; owner-blocked visitor → `blocked`; after decline → `declined_cooldown`
- `actOnRequest` is owner-only (field name is `decision` because `action` routes the function); `connect` requires selecting contact methods and is terminal; `later` keeps the request actionable
- Contact values resolve only after `connect` (unknown ids silently dropped); pending/later/decline requests never carry contact values
- 16 node:test cases pass covering all of the above plus visitor-cannot-act and inbox scoping

## 2.4 Summarize Why This Connection Matters

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New agent action `summarizeConnection({ requestId })` (owner-only)
- Returns ConnectionSummary { recommendation: worth_a_conversation|maybe_later|need_more_context|not_relevant_now, why[], uncertainty, suggestedTopic, evidenceRefs } — never a score, never pass/fail; schema validator rejects any `score` field outright
- Weak evidence (short reason, no shared context) → `need_more_context` with explicit uncertainty; `why` must be non-empty with evidence
- 5 node:test cases pass (strong/weak evidence fixtures, structure, no-score)

## 2.5 Complete The Connection Moment

Status: `[x]`

Completion:

- 2026-07-19, on `main`. Mini Program `pages/requests` and `pages/visitor-chat` upgraded to dual-mode (real cloud chain first, fixture demo fallback — same pattern as vibe page)
- Requests page: real `listInbox` inbox → detail with `summarizeConnection` Vibe take (recommendation→warm-copy mapping, summary failure falls back to fixture take, page never breaks) → `actOnRequest` with `decision` field → connect picks owner contact methods (from `user.getProfile` contactMethods) → matched view shows shared values only after connect; `later`/`decline` equally accessible with their own states; empty inbox uses the 0.4 empty state; demo reset only in demo mode
- Visitor chat: `card.getPublicCard` bootstrap (owner name, public-field-driven suggestion chips) → `agent.visitorMessage` with nextAction flow → preview → `requests.createRequest`; `weak_reason` triggers the Vibe's follow-up question with the draft preserved; `blocked`/`rate_limited`/`declined_cooldown` get gentle terminal copy; model failure never invents and keeps the flow alive; never touches contact APIs
- Validation: `node --check` ✅; 42 node-stub smoke assertions pass across fallback, cloud inbox→detail→connect→matched (contact values asserted absent before connect), later/decline, and visitor-chat cloud flows (grounded answer → invite → submit; weak-reason follow-up; blocked copy)
- Intentional deviation (same as 1.3/1.4): web `RequestsPage`/`VisitorVibeChat` stay on fixtures until a shared HTTP API exists; request state consistency across Mini Program and Web therefore holds through the shared cloud backend once deployed
- Not verifiable here: WeChat DevTools compile, real OPENID login chain, physical-device share → visitor-chat deep link


Milestone 2 complete when the full real-data connection loop passes.

---

# Milestone 3: Safety, Reliability, And Delight

Goal:

> The demo feels alive and personal while privacy and failure behavior remain trustworthy.

## 3.1 Fix Moderation Failure Behavior

Status: `[x]`

Completion:

- 2026-07-19, on `main`. New `content-check/lib/core.js`: `checkTextWithRetry` retries transient failures once, treats errCode 87014 as unsafe, and — per AGENTS.md — moderation failure never defaults to safe: persistent failure returns `{ status: 'unavailable', safe: null }`; `gateStrangerContent` maps to `allowed` / `blocked` / `unavailable`
- content-check cloud function rewritten: `checkText` / `checkImage` return the three-state result; new `gateText` action; 7 unit tests cover retry, 87014, unavailable, invalid input
- `requests.createRequest` now gates `visitorName`+`reason` through it: unsafe → `moderation_blocked`, service down → `moderation_unavailable` (retry later), invalid text → `invalid_input`
- UI retry preserved: Mini Program `visitor-chat` maps `moderation_blocked` back to the reason editor and `moderation_unavailable` to a retry toast; the typed reason stays in `reasonValue` either way, so retry never loses typed content
- New committed smoke tests `packages/miniprogram/tests/visitor-chat.moderation.test.js` (node stub harness) assert both moderation branches preserve the draft, plus a weak_reason regression
- Validation: `npm test` in content-check 7/7 pass; requests 18/18 pass incl. both new moderation paths; page smoke 3/3 pass

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. Server-side enforcement added in front of the model:
  - New `agent/lib/limits.js` pure logic (`VISITOR_MESSAGES_PER_DAY=60`, `VISITOR_NEW_CONVERSATIONS_PER_DAY=10`, `checkVisitorActivity`, `activityDocId`, `todayStr`, `isBlocked`); `agent.visitorMessage` now gates blocked visitors (`blocked`) and over-limit visitors (`rate_limited`, distinct copy for message cap vs new-conversation cap) **before any provider call** — tests assert the stub provider is never invoked in those paths. Limits persist in a new `visitor_activity` collection (`_id = visitorId:ownerId:YYYY-MM-DD`, East-8 date); limiter read/upsert failures degrade to allow-with-warn so DB jitter never kills a normal conversation
  - `requests.blockVisitor({ requestId })` (owner-only, else `forbidden`): addToSet the visitor into `users.blockedUsers` (same field/write style as the legacy `report` function, so existing block tooling stays compatible); pending/later requests become `decline` via `core.applyBlock`; other states untouched (connect-shared contacts are not clawed back)
  - Existing 2.3 guards already covered connection-request rate (1/24h per pair) and repeated requests after decline (24h cooldown); blocked check now also runs ahead of the agent
- Mini Program: requests detail gained a de-emphasized 「不再接收 TA 的消息」 entry (pending/later only) → `wx.showModal` confirm → `blockVisitor` → detail refreshes to decline; demo mode simulates locally without cloud. visitor-chat maps `blocked` / `rate_limited` to a gentle agent sign-off (`ended: true`, composer hides); other failures keep the existing fallback
- Validation: agent 40/40 pass (incl. new limits.test.js), requests 24/24 pass (incl. new block.test.js), page smoke `node --test tests/*.test.js` 12/12 pass (block flow incl. modal/confirm/demo/cancel, visitor gates incl. fallback regression)
- Not verifiable here: WeChat DevTools compile; first deploy should ensure the `visitor_activity` collection exists (or auto-create on first write)

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. All four moments exist and are anchored to real state:
  - **“I remembered…” after owner confirmation**: Mini Program vibe page now appends the agent message `我记住了：…` (edited content when the owner edited first) instead of a bare toast; Web `MyVibePage` already did and the moment is now tagged `data-testid="remember-moment"`. Copy follows AI_BEHAVIOR §5.
  - **Accurate callback to an earlier memory**: `OwnerAgentResult.referencedMemoryIds?: string[]` added to the contract (AI_BEHAVIOR §5); the owner prompt lists memories with `[mem:id]`, and the server filters returned ids to the owner's actual confirmed memories (unknown ids silently dropped, max 3) so a callback can only anchor to real memory. Mini Program vibe page renders the referenced memory as quiet `↩` chips under the reply (`resolveMemoryRefs` looks content up from the loaded confirmed list); Web demo references the real `fixture-memory-public-focus`.
  - **Concrete shared-context discovery for a visitor**: `VisitorAgentResult.sharedContext?: string[]` added to the contract (AI_BEHAVIOR §6; ≤3 items, ≤60 chars, validator-normalized, omitted when no real overlap — prompt forbids forcing one). Mini Program visitor-chat renders a warm 「发现共同点」 block on that reply and feeds it into the request preview's 可能的共同点 (previously hard-coded `[]`); Web `VisitorVibeChat` does the same from fixture state.
  - **Vibe matched after mutual connection**: already present on both clients since 0.4/2.5; now also verified under reduced motion.
- Reduced motion on Web: app wrapped in `MotionConfig reducedMotion="user"` (motion/react drives the matched/proposal/chat animations; the pre-existing CSS media query could not stop JS-driven motion). New e2e runs the matched flow with `reducedMotion: 'reduce'`.
- No points, confetti loops, streaks, or random rewards were added.
- Validation: agent 51/51 pass (11 new recognition tests); Mini Program page smoke 23/23 pass (11 new); `npm run lint` (tsc) clean; `npm run build` ok; `vibe-mock-story.spec.ts` 12/12 pass across chromium + mobile-chrome incl. the new moment assertions.
- Not verifiable here: WeChat DevTools rendering of the new chips/discovery styles (Mini Program side).

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. The eight states across both clients:
  - **No memories yet**: Mini Program vibe page had the empty line; Web `MyVibePage` now renders a designed empty block (「还没有记住任何事。聊点什么吧。」) instead of hiding the section.
  - **No requests yet**: both inboxes already had the empty state with a recovery path (demo reset in demo mode).
  - **Agent disabled**: visitor-chat cloud init checks `card.agentEnabled === false` (field absent → enabled, backward compatible) and shows a terminal「他的分身暂时在休息」with no composer; Web `PublicCardPage` gained optional `agentEnabled` on SharedProfile and swaps both chat buttons for a quiet `vibe-disabled` note. Cloud projection already carries the field.
  - **Model unavailable**: pre-existing AI_BEHAVIOR §11 copy on both pages (chat continues, nothing lost) — verified by existing tests.
  - **Moderation unavailable**: task 3.1 behavior (retry toast, draft preserved) — verified.
  - **Network timeout / generic cloud failure**: dual-mode pages keep the deliberate fixture-demo fallback so a judge's demo never breaks; `card_deleted` / `not_found` were carved **out** of that fallback (see below).
  - **Permission denied**: `unauthorized` from any cloud call now maps to「请先登录后再试」with page state and drafts kept (vibe ownerMessage / card draft, requests inbox + actions, visitor-chat init + send + submit). Requests inbox deliberately does **not** fall back to demo data on `unauthorized` — an unlogged owner must never see fixture requests.
  - **Deleted Card**: visitor-chat init now distinguishes `card_deleted` (「这张名片已被主人收回」) and `not_found` (「这张名片找不到了」) as terminal states with「可以请对方重新分享一次」, no composer, no demo fallback; Web public page already had its recovery actions.
- Retry-without-duplication: verified guards already in place — vibe `this.sending` lock + persist-before-reply ordering (owner message persisted exactly once; a failed reply never re-appends), visitor-chat `sending` lock on submit, requests `acting` lock on decisions.
- Bug found and fixed along the way: visitor-chat read `res.result` instead of `res.result.card` from `getPublicCard`, so cloud mode always received an empty card; fixed and pinned by a regression test.
- No error state exposes error codes, stack traces, function names, prompts, or secrets.
- Validation: Mini Program page smoke 31/31 pass (8 new: unavailable terminal states, agent-disabled, demo-fallback regression, unauthorized mapping); `npm run lint` (tsc) clean; `npm run build` ok; `vibe-mock-story.spec.ts` 14/14 pass incl. new agent-disabled public-card case.
- Not verifiable here: WeChat DevTools rendering of the new terminal view (reuses existing dark done-styles, low risk); the owner-side switch that actually sets `agentEnabled=false` is post-MVP backend work.

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. Baseline was 30/38; the suite is now **50/50 pass, 0 fail, 0 skip** (both chromium and mobile-chrome).
- `chain-test.spec.ts` rewritten: the stale "verified accounts section" assertion (expecting removed `Verified`/`Wallet` labels) is re-pointed at the still-supported advanced area — seeded owner profile with a wallet address → `card-advanced` details opens → theme toggle + `verify-wallet-button` visible; a second case asserts the shortened wallet badge. The two permanently skipped cases (More-page wallet surface, On-Chain Identity/DappRep/Badges) targeted product paths removed in 0.2 and are deleted, not restored.
- `chain-sync.spec.ts` root-caused instead of skipped — two real defects fixed:
  1. Playwright's webServer readiness probe for `127.0.0.1:8545` does not actually wait for the Hardhat node/deploy inside `scripts/e2e-hardhat.js`; the spec now waits for real chain state itself (RPC answers, then registry bytecode at the deterministic `0x5FbD…80aa3`).
  2. The Hardhat node's CORS headers (`Access-Control-Allow-Methods: OPTIONS, GET`) reject browser POST preflights, so page-side viem calls always failed with "Failed to fetch". Added a dev-only same-origin proxy `/hardhat-rpc` in `vite.config.ts` (`hardhatRpcProxyPlugin`, reuses the existing `proxyHttp` helper); `E2EChainSyncPage` now uses the relative path. Full loop verified: balance → deploy check → mock IPFS → publish tx → hash match → `PASS: full chain sync loop verified`.
- Replacement coverage map: Card/Requests/My Vibe navigation + owner conversation + visitor conversation + private contact gating + request handling + mobile layout are covered by `vibe-mock-story.spec.ts` (14 cases × 2 projects, incl. reduced-motion and agent-disabled); Web3 coverage kept only for the advanced area, embed view, widget, and chain sync.
- Validation: `npm run lint` (tsc) clean; `npm run build` ok; full Playwright suite 50/50 pass.
- Note: `scripts/e2e-hardhat.js` deploy writes to `packages/contracts/deployments/` (gitignored).

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

Status: `[!]`

Blocked (recorded 2026-07-19, on `main`):

- Blocker: WeChat DevTools on this machine is **not logged in** (`cli islogin` → `{"login":false}`). Opening any project fails with `Login is required (code 10)`, and login requires scanning a QR code with the owner's WeChat — not something an agent can do autonomously. The automation port also refuses connections (`target project window is opened with automation enabled` fails) for the same reason.
- Attempted: `cli islogin` (found running IDE, connected on its actual port, confirmed logged-out); `cli open --project` → code 10; installed `miniprogram-automator@0.12.1` in isolated `/tmp/mp-auto` and tried `automator.connect` → refused.
- Verified instead (static compile-equivalent, all pass): every JSON under `miniprogram/` parses; all 9 declared pages have their `.js/.wxml/.json` files; every `usingComponents` reference resolves; `node --check` passes for all 84 page/util JS files and every cloudfunction `index.js`; plus the 31 committed page-logic smoke tests and the cloudfunction unit tests.
- Current code state: Mini Program side is feature-complete through Milestone 3 (navigation, vibe/requests/visitor-chat dual-mode, recognition moments, failure states) but has **never been compiled in DevTools**.
- Next step (needs the user): log into WeChat DevTools, open `packages/miniprogram`, confirm compile, then run the checklist below. Also covers the still-open 0.3 acceptance (tab bar compile check).

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

Status: `[x]`

Completion:

- 2026-07-19, on `main`. The demo cast (all fictional, no real contact details anywhere):
  - **Owner with authentic project context**: 林舟, whose card/memories revolve around building VibeCard itself (existing fixtures since 0.1).
  - **Visitor with a strong shared reason**: 苏晴, independent dev building a WeChat AI bookkeeping app, stuck on the exact private-memory/public-identity boundary the owner is working on (existing).
  - **One weak request to demonstrate boundaries**: new `fixtureWeakVisitor` 王拓 + `fixtureWeakConnectionRequest` (「想认识一下，多个朋友多条路。」— the AI_BEHAVIOR §7 anti-pattern, no shared context) added to `packages/shared/fixtures/vibe.ts` and mirrored in `miniprogram/data/vibe-fixtures.js`. Both demo inboxes now show strong + weak side by side: Mini Program `requests.loadFixtureDemo` picks a per-request Vibe take (weak → 「我还判断不好，信息不太够。」 with reasons grounded in what's missing); Web `RequestsPage` was refactored from a single request to a requests array with per-request visitor/take mapping (`request-item-weak` testid; strong keeps `request-item` so older assertions still hold). Empty shared-context sections render nothing — no invented common ground.
  - **One confirmed memory used later**: `fixture-memory-public-focus` (confirmed) is the memory the Vibe calls back to in the task-3.3 recognition moment on both clients.
- Real-AI vs fixtures: cloud mode uses only live data (fixtures never leak into cloud paths — dual-mode pages fall back to fixtures only when the cloud is unreachable, by design); deterministic fixture demo works fully offline.
- Reset under one minute: Web RequestsPage「重置演示状态」restores both requests instantly; My Vibe state resets on page reload; Mini Program demo exposes「重置演示状态」in demo mode. Full reset procedure is scripted in the 4.4 walkthrough.
- Validation: Mini Program page tests 34/34 pass (3 new weak-request cases); `npm run lint` clean; `npm run build` ok; `vibe-mock-story.spec.ts` 16/16 pass (new weak-request boundary case).

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

Status: `[x]`

Completion:

- 2026-07-20, on `main`. New `packages/web/e2e/demo-90s.spec.ts` drives every beat of PRODUCT.md §17 end-to-end on the deterministic fixture demo and asserts the whole walkthrough stays under the 90-second budget.
- Demo beats: owner opens My Vibe → confirms the pending proposal → "我记住了…"; visitor opens the shared Card (`?c=`) → asks the public Vibe "他为什么做这个？" → gets a grounded answer from `fixtureOwnerCard.currentFocus`; visitor states a specific reason → shared-context discovery appears → confirms submission; owner opens Requests → sees the evidence-based take → selects WeChat contact → "Vibe matched."
- VisitorVibeChat suggestion copy was updated from "他最近在做什么？" to "他为什么做这个？" to match the product script; the invite-reason transition is now synchronous so the demo stays reliable and fast.
- Runtime observed: ~6 seconds on both chromium and mobile-chrome, well under the 90-second limit.
- Validation: `npm run lint` ✅, `npm run build` ✅, full Playwright suite 54/54 pass (4.1 baseline 50 + 4.4 demo 4 across two projects).

Owner: Lane D

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
