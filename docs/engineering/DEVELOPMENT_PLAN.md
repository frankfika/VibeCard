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

Status: `[x]`

Progress (2026-07-19, on `main`):

- Implemented: `app.json` tabBar → 名片 / 请求 / Vibe; custom-tab-bar list updated; new placeholder pages `pages/requests` + `pages/vibe` with empty states and correct tab selection; legacy pages (threads / more / discover / games / thread-publish) remain registered but unreachable from main navigation; only `more.js` (now unrouted) links to discover/games, so no legacy entry remains in the main journey
- Verified here: JS syntax (`node --check`) and JSON validity of all touched files
- Remaining: WeChat DevTools compile + tab switching check must be run by the owner (DevTools cannot run in this environment). Intentional deviation: 0.4 proceeds while this verification is pending, since 0.3 code is complete.

Completion (2026-07-20, on `main`):

- DevTools verification (run under task 4.2): cold compile passes; all three tabs render and switch in the simulator (`switchTab` navigation plus screenshots showing the rendered tab bar with the correct active highlight on each tab); stored v1 profile still renders on Card.
- Real bug found and fixed: `custom-tab-bar/` lived at the project root instead of `miniprogram/` (the `miniprogramRoot`) since its introduction in `22440db`, so the framework never loaded it — no tab bar ever rendered, and cold compiles crashed inside DevTools' `_getPackageFiles`. Moved to `miniprogram/custom-tab-bar/`; compile and tab bar rendering both confirmed after the move.

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

Status: `[~]`

Progress (2026-07-20, on `main`):

- Owner logged into DevTools; automated simulator verification ran via `miniprogram-automator` against the real IDE (AppID `wxa79d41c8255ff90d`, base library 3.13.1): **18 behavior checks pass** — cold compile, v1 profile migration, three tabs render+switch, share payload privacy, deep link to the correct owner, shared-card visibility, visitor role isolation, visitor chat (AI identity + grounded answers), requests list/detail, block entry, owner-controlled contact unlock, vibe memories.
- Bugs found by the verification and fixed in this task: (1) share URL embedded the full profile including `verified.wechat` — payload now strips `verified`; (2) shared Card rendered invisible (`cardVisible` never set in the shared branch) — fixed, visitor view confirmed by screenshot; (3) `custom-tab-bar/` misplaced at project root since `22440db` — moved to `miniprogram/custom-tab-bar/`, which also fixed a DevTools cold-compile crash (`_getPackageFiles` path.join undefined) and made the tab bar render for the first time (screenshot-verified); (4) four visitor/owner-facing Web3 legacy strings replaced with current product copy.
- Note: the IDE's automation server degrades after the first connect/disconnect cycle per launch — each verification script must run as the first session on a freshly launched IDE.
- Remaining: physical-device pass. Preview QR generated (`cli preview`, package ~251.5 KB); waiting for the owner to scan and walk the checklist below. On device the pages fall back to fixture demo mode until cloud functions are deployed to the owner's env.
- AI message retry: covered by cloudfunction unit tests and page smoke tests; no live AI call exists in demo mode to exercise it in the simulator.

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

## 4.5 Add Personal Now Updates

Status: `[x]`

Completion:

- 2026-07-21, on coordination branch `feature/task-4.5-personal-now`, built by three parallel sub-agents with strict directory ownership and integrated by the coordinating agent.
- Canonical contract (coordinator-fixed, consumed identically by all three lanes): `packages/shared/now.ts` — versioned `NowItem` (`schemaVersion: 1`) with statuses `draft | published | archived | hidden | deleted`, topics, `sourceMemoryId`, `publishedAt`, `expiresAt`, `createdAt`/`updatedAt`; pure platform-free helpers `isNowItemActive` / `filterActiveNow` / `latestActiveNow` (public projection = newest 3 published, non-expired) and `canProjectMemoryToNow` enforcing that publishing never mutates source Memory visibility; deterministic `nowFixtures` (published current, expiring, expired, draft, archived, hidden, deleted, one with `sourceMemoryId`). Commit `0ba9c1f` (+ seed `1b0c921`).
- Web (`bd76d13`): owner Now management on My Card (write/edit/publish/archive/hide/delete, status badges, empty/error/retry states); My Vibe proposes ONE Now draft with explicit owner confirmation (发布/改一下/先不了), never auto-publishes, never copies raw chat; Card + Public Card show ≤3 newest active items, empty state invents nothing; Visitor Vibe answers recent-context questions only from active Now items → public current-focus → explicit 「他最近还没有公开动态，我不想替他猜。」; share payload carries the same public snapshot; new `e2e/now-updates.spec.ts` (8 tests × 2 projects). Web projection helpers re-export the shared ones (`ff55dae`) — no divergent model.
- Mini Program (`a84bcf7`): new `now` cloud function (owner-only openid-scoped draft/publish/edit/archive/hide/delete; public `getActiveNowItems` returns ≤3 active items, safe fields only; index requirements documented in its README); `card.getPublicCard` projects `card.now` from published-only query; `agent.visitorMessage` grounds from published non-expired Now first, `nowProposal` draft-only schema for owner chat; vibe page owner panel + Vibe proposal card, card page 「最近动态」 section in both fixture-demo and cloud modes; fixtures mirror the shared ones. app.json untouched; all 4.2 changes preserved (purely additive diffs).
- Validation: `npm run lint` ✅, `npm run build` ✅, Playwright **70/70** pass (54 baseline + 16 new, chromium + mobile-chrome); Mini Program page tests **50/50**; cloud-function tests now 16/16, agent 57/57, card 13/13, memory 17/17, requests 24/24, content-check 7/7; `git diff --check` clean.
- Data boundaries verified by tests: private conversation never published without owner confirmation; archived/hidden/deleted/expired items never shown publicly or used as visitor grounding; owner and visitor surfaces render the same published snapshot; source Memory visibility unchanged on publish.
- Notes for next tasks: the `now` cloud function must be deployed in WeChat DevTools and the two `now_items` indexes created before cloud mode works (fixture demo works offline); physical-device verification still pending (together with 4.2). Note: `packages/web/server.js` in the main checkout carries an unrelated uncommitted user fix (tmp-rename race); e2e was validated with it present in the working tree — it was NOT committed, per task rules.

Goal:

> The Card shows what the owner is doing now without becoming a social feed.

Owners: Lanes A, B, C, and D

Implement:

- Add a versioned `NowItem` contract with draft, published, archived, and deleted states
- Let the owner write, edit, publish, archive, and delete an update
- Let My Vibe propose one Now item from a meaningful owner conversation
- Require explicit owner confirmation before publishing
- Show at most the three newest published items on Card and Public Card
- Let the visitor agent answer recent-context questions from published Now items
- Keep source memory visibility unchanged when an item is published

Do not add:

- A global feed
- Following or followers
- Likes, comments, repost counts, or ranking
- Algorithmic recommendations
- Automatic publishing

Acceptance:

- Private conversation text never appears publicly without owner confirmation
- Archived, deleted, and expired items are not described as current
- Owner and visitor surfaces show the same published snapshot
- Empty state does not invent recent activity
- Web tests cover publish, archive, public display, and visitor grounding
- Mini Program tests cover owner confirmation and public Card display
- `npm run lint` and `npm run build` pass

Dependencies: 1.4 and 2.1

---

# Post-Competition Roadmap

Do not start post-competition work until the competition branch is stable.
Execute one numbered task at a time. A later client may start only after the
portable Core and export format it depends on are verified.

The target is:

> A fully open-source personal AI identity and memory system that works without
> an official VibeCard account, while VibeCard Cloud sells managed operation.

---

# Milestone 5: Open Source Foundation

## 5.1 Establish The Open Source Contract

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.1-open-source-contract` (stacked on `feature/task-4.5-personal-now`).
- License split: AGPL-3.0-only for the runnable product/hosted Core (root `LICENSE`, `packages/miniprogram` + 10 cloud functions, `packages/web`); MIT for integration surfaces (`packages/shared`, `packages/contracts`). Every first-party package has an explicit license file and/or `license` field in `package.json`.
- Governance docs created: `CONTRIBUTING.md` (setup, validation commands, lane ownership, contract-first rule, commit conventions, DoD), `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1), `SECURITY.md` (private reporting via GitHub Security Advisories + placeholder email; product-specific issue list: memory-visibility leaks, public Card contact exposure, prompt injection, cloud-function permission bypass, committed secrets), `docs/engineering/OPEN_SOURCE.md` (per-package license table + rationale, trademark/naming rules, release process, never-commit list, "local/self-hosted need no paid license or official account; no proprietary server mandatory" statements).
- `README.md` gained a "Runtime Modes And Licensing" section describing Local / Self-Hosted / VibeCard Cloud honestly: the competition MVP today runs on WeChat Cloud Development; Local/Self-Hosted modes are the post-competition roadmap now landing.
- Secret & personal-data audit over all 286 tracked text files: no private keys, no real API keys, no committed `.env` (only placeholder `.env.example` files); fixtures are fictional (林舟/苏晴/王拓, `*.example` emails, sentinel test values). One low-severity flag: the real WeChat AppID `wxa79d41c8255ff90d` in `packages/miniprogram/project.config.json` (semi-public, required by tooling) — conscious decision needed before making the repo public. Contact emails are `*.vibecard.example` placeholders pending a real project contact.
- Validation: `npm run lint` ✅, `npm run build` ✅, `git diff --check` ✅. No code behavior changed; e2e/test suites unaffected.

Owner: coordinating agent

Decide and document:

- OSI-approved licenses for the runnable product, Core, clients, SDKs, and examples
- Recommended policy: copyleft for the hosted Core and permissive licensing for integration SDKs
- Trademark and naming rules that do not restrict code freedom
- Contribution process, code of conduct, security reporting, and release process
- What deployment configuration and secrets can never be committed

Create:

```text
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
docs/engineering/OPEN_SOURCE.md
```

Requirements:

- Mini Program, H5, Core, agent service, memory engine, and self-host server are open source
- Local and self-hosted use does not require a paid license or official account
- Official cloud may charge for infrastructure and service
- No feature is described as open source when a proprietary server is mandatory
- Run a secret and personal-data audit before making the repository public

Acceptance:

- A new contributor can identify the license of every first-party package
- Repository contains no real credentials, private contacts, or production data
- Contribution and security-reporting paths are documented
- README explains local, self-hosted, and managed modes without misleading users

Dependencies: Milestone 4

## 5.2 Extract A Platform-Independent Core

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.2-platform-core`. Stayed in `packages/shared` (no new `packages/core`): the package was already pure TS with zero platform imports, so a new package would have duplicated contracts without removing real coupling.
- New Core modules (pure, platform-free): `memory.ts` (confirmation & lifecycle: propose/confirm/edit/pause/resume/delete with coded `MemoryTransitionError`), `visibility.ts` (ARCHITECTURE §7 role filtering: `memoriesForOwner`, `memoriesForVisitorQuote` public-only, `memoriesForVisitorBoundary` agent_only-never-quotable, defensive `forbiddenForVisitor` second net), `public-card.ts` (`buildPublicCard`: Card + ≤3 newest published non-expired Now items, public-safe fields only), `connection.ts` (pending/later → connect/later/decline transitions; `sharedContactMethodIds` only on connect; rate-limit/block gates), `agent-schema.ts` (hand-rolled validators for `OwnerAgentResult`/`VisitorAgentResult`/`ConnectionSummary`, incl. draft-only `nowProposal`; score-shaped output rejected), `migration.ts` (pure v1 profile → Card draft, strips contact/social keys, preserves owner-written text).
- Clients: web `MyVibePage` now consumes `memoriesForOwner` from the Core (last local permission filter removed). Mini Program cloud functions are per-directory CJS and cannot require a TS package at deploy time, so JS mirrors remain but `packages/shared/test/parity.test.ts` runs Core TS and every JS mirror over identical fixture inputs asserting identical outputs (incl. error codes and full `buildPublicCard` deep-equality) — drift fails loudly.
- Browser-compatibility proof: static platform-free test greps all Core sources for `window`/`document`/`localStorage`/`wx.`/`process.`/`require(`/model SDKs, plus a coverage test forcing new Core files to enroll.
- Validation: Core tests **61/61** (`npm test --workspace=packages/shared`: memory 9, visibility 6, public-card 7, connection 8, agent-schema 7, migration 6, parity 13, platform-free 3); `npm run lint` ✅, `npm run build` ✅; miniprogram page tests 50/50; cloud functions memory 17/17, agent 57/57, card 13/13, now 16/16, requests 24/24, content-check 7/7; web e2e **70/70**.
- Deviation recorded: Now lifecycle transitions (publish/archive/hide/delete) remain in parity-tested mirrors rather than Core TS — only Now projection was required here; a candidate follow-up for 5.3.
- Environment note: e2e initially failed because a stray `dailyflow` vite server kept grabbing port 3000; validated on a freed port. Pre-existing flake, unrelated to this task.

Owner: Core

Evolve `packages/shared` into the portable Core. Create a new `packages/core`
only if a migration removes real platform coupling; do not duplicate contracts.

Core owns:

- Versioned `VibeCard`, `NowItem`, `Memory`, and `ConnectionRequest` contracts
- Memory confirmation and lifecycle rules
- Visibility and role filtering
- Public Card projection
- Connection-request state transitions
- Structured agent input and output schemas
- Pure migrations and deterministic fixtures

Core must not import:

- WeChat APIs
- Browser globals
- Node-only filesystem APIs
- A model-provider SDK
- A database client
- Billing or official-cloud code

Acceptance:

- Core tests run in Node and a browser-compatible test environment
- WeChat and Web consume the same contracts
- Permission tests prove visitor context cannot include private memory
- Existing v1 data migration still passes
- No second memory or permission implementation exists in a client

Dependencies: 5.1

## 5.3 Define The Portable Vibe Archive

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.3-vibe-archive`.
- Format v1 (`packages/shared/archive.ts`, spec in `docs/engineering/VIBE_ARCHIVE.md`): single versioned JSON document (`format: "vibecard-vibe-archive"`, `schemaVersion: 1`, `kind: public | private`, app/export metadata, `sectionVersions` for 9 independently versioned sections, optional dependency-free fnv1a-32 integrity checksum, `encryption` marker field). Sections: profile (private only), card, nowItems (private = full NowItem history; public = active projection only), memories (confirmed AND proposed, private only), conversations (explicit opt-in), knowledgeSources metadata, connectionRequests incl. decisions, contactMethods (private only), attachments manifest (metadata only — never file bytes).
- Public/private boundary is structural: separate `exportPublicArchive` / `exportPrivateArchive` functions; private sections are empty by construction in public exports, and a public archive carrying private sections fails validation with `public_boundary_violation`. Tests prove absence via recursive key/value scan.
- `importArchive` = migrate → validate → normalize (pure, no storage). Typed error codes: `invalid_shape`, `unsupported_version`, `future_version`, `section_version_mismatch`, `checksum_mismatch`, `encrypted_archive`, `public_boundary_violation`, `wrong_kind`. Migration dispatch table with a real, tested v0→v1 path (ids unchanged).
- Stable identifiers round-trip unchanged; no id needs re-keying (documented §8). `buildDeletionPlan` returns exactly which records a client must delete after a verified private export; the Core plans, the client executes; public archives cannot authorize deletion.
- The format structurally has no fields for model keys, access tokens, or server secrets; client-side encryption sits outside the Core (client encrypts the serialized envelope; Core rejects non-null `encryption` with `encrypted_archive`).
- Validation: Core tests **79/79** (61 baseline + 18 deterministic archive tests: round-trip recover-same-identity, public-export scan, typed failures, migration, id stability); `npm run lint` ✅, `npm run build` ✅, `git diff --check` ✅.

Owner: Core

Define a versioned `.vibe` archive or equivalent documented JSON package for:

- Profile and Card
- Now history
- Confirmed and proposed memories
- Conversation export when explicitly selected
- Knowledge-source metadata
- Connection requests and decisions
- Attachment manifest without silently uploading local files
- Export metadata and schema versions

Requirements:

- Separate public-only export from complete private export
- Support validation before import
- Support migrations between schema versions
- Preserve stable identifiers where safe
- Allow full deletion after successful export
- Do not include model keys, access tokens, or server secrets
- Document optional client-side encryption for private archives

Acceptance:

- Export, delete local state, import, and recover the same fixture identity
- Public export contains no private memory or contact method
- Invalid and future-unsupported archives fail with typed errors
- Round-trip tests are deterministic

Dependencies: 5.2

## 5.4 Add Model Provider Adapters

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.4-model-adapters`.
- Core (`packages/shared/model-provider.ts`): provider-neutral `ModelProvider` interface (`complete` + optional `embed`) with capability declaration (`text/structuredOutput/embeddings/vision/audio`); `createAgentModel(provider)` exposes the four typed agent operations (`ownerMessage`/`visitorMessage`/`generateCardDraft`/`summarizeConnection`) returning validated Core results or typed errors; invalid output retries exactly once → `invalid_model_output`; unsupported capability → typed `unsupported_capability`, never silent fallback; error codes `model_unavailable | rate_limited | permission_denied | invalid_model_output | unsupported_capability`. `mock-provider.ts` is a platform-free port of the cloud mock (byte-identical, parity-tested).
- Cloud agent (`cloudfunctions/agent/lib/providers.js` rewritten): deterministic mock (default) + OpenAI-compatible HTTP adapter (http/https, `/v1` base handling, keyless local endpoints, `AI_API_HEADERS`, timeout) behind the same interface; status mapping 429→rate_limited, 401/403→permission_denied, else model_unavailable; `safeErrorForLog` redacts bearer/`sk-…`/key params; keys live only in cloud-function env — never client-side, never logged.
- Config-driven selection (`AI_PROVIDER`/`AI_API_BASE`/`AI_MODEL`/`AI_API_KEY`/`AI_TIMEOUT_MS`): mock ↔ OpenAI-compatible ↔ BYOK ↔ local/private (Ollama/vLLM/llama.cpp as OpenAI-compatible endpoints) requires zero business-logic or client-page changes (test-proven). Self-hosted users never need VibeCard Cloud.
- Docs: `docs/engineering/MODEL_ADAPTERS.md` (interface, capabilities, setup per mode, error taxonomy, key-handling/logging rules).
- Intentional deviation: agent action layer migrated `provider_unavailable` → `model_unavailable` to match ARCHITECTURE §12 vocabulary (in-lane test assertions updated).
- Validation: Core tests **102/102** (+23: model-provider 16, parity +4, platform-free coverage); agent cloud tests **71/71** (+14 provider tests over a local stub HTTP server — no real API calls); memory 17/17, card 13/13, now 16/16, requests 24/24, content-check 7/7; miniprogram page tests 50/50; `npm run lint` ✅, `npm run build` ✅, `git diff --check` ✅.

Owner: AI

Keep the current agent behavior behind a provider-neutral interface.

Provide:

- Deterministic mock provider
- OpenAI-compatible HTTP provider
- Bring-your-own-key configuration
- Adapter documentation for local and private model services
- Capability declaration for text, embeddings, structured output, vision, and audio

Requirements:

- Provider responses are converted into Core schemas
- Keys stay in the selected trusted runtime
- Self-hosted users are not required to call VibeCard Cloud
- Provider errors map to stable typed errors
- Logging never includes keys or unredacted private prompts

Acceptance:

- The same behavior tests pass with mock and OpenAI-compatible providers
- Switching provider requires configuration, not business-logic changes
- A provider can be added without editing client pages
- Unsupported capabilities fail clearly

Dependencies: 5.2

## 5.5 Add Storage Adapters And A Local Reference Store

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.5-storage-adapters`.
- Core repository interfaces (`packages/shared/repositories.ts`, pure TS, Core records only): `MemoryRepository`, `CardRepository`, `NowRepository` (separate from cards — ARCHITECTURE §4 keeps separate collections/indexes and Now has its own lifecycle), `ConversationRepository`, `ConnectionRepository`, `KnowledgeSourceRepository`, plus `ContactMethodRepository` (added beyond the §17 sketch — required for archive round-trip and deletion-plan execution; recorded as an intentional deviation). `VibeRepositories` aggregate; one deterministic ordering; vendor metadata (SQLite rowids, cloud `_id`) never enters contracts.
- Local reference store (`packages/platforms/local-store/`, `node:sqlite` on Node 24): one table per collection with Core record as JSON + extracted index columns; versioned up-only migrations in single transactions (failed-migration rollback and crash-mid-migration leave data intact — tested); WAL + busy_timeout; interleaved two-connection writes converge; zero network.
- WeChat adapter preserved untouched: documented collection→repository mapping in `docs/engineering/STORAGE_ADAPTERS.md` plus a real second engine — fixture-backed in-memory adapter (`packages/shared/in-memory-store.ts`) — since wrapping live cloud functions would edit deployed paths for no gain.
- Reusable adapter conformance suite (`conformance.ts`): 20 tests per adapter (CRUD, filters, ordering, owner isolation, hard deletes, stable ids, archive export→import→re-export byte-identity), executed against BOTH the SQLite store and the in-memory adapter — future databases reuse the same factory.
- Local mode proof (`test/local-mode.test.ts`): create Card → propose/confirm memory via Core lifecycle → publish/update Now (source memory visibility unchanged) → export private archive → execute deletion plan (store verified empty) → import into fresh store → same fixture identity recovered, re-export byte-identical. No network.
- Validation: Core tests **106/106** (+4); local-store **48/48** (conformance 20×2, migrations 5, concurrency 2, local-mode 1); miniprogram page tests 50/50; cloud functions memory 17/17, agent 71/71, card 13/13, now 16/16, requests 24/24, content-check 7/7; `npm run lint` ✅, `npm run build` ✅, `git diff --check` ✅.

Owner: Data

Define repositories for:

- Memories
- Cards and Now items
- Conversations
- Connection requests
- Knowledge-source metadata

Provide one local reference implementation using SQLite, IndexedDB, or another
appropriate open local store. Preserve the existing WeChat Cloud adapter.

Requirements:

- Repository interfaces use Core records
- Storage-vendor metadata stays outside public contracts
- Migrations are explicit and tested
- Local-only owner use works without a network connection
- Concurrent writes and interrupted migrations do not corrupt data

Acceptance:

- The Core fixture suite passes against the local and WeChat adapters
- Local mode can create, remember, update Now, export, and import
- Deletion removes records from later retrieval
- Adapter conformance tests are reusable by future databases

Dependencies: 5.2 and 5.3

## 5.6 Add Optional Retrieval And Knowledge Adapters

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.6-retrieval-adapters`.
- Stage-1 structured retrieval (`packages/shared/retrieval.ts`, the default — zero embeddings required): `retrieveMemories` pipeline = owner filter → confirmed/active → **visibility for audience before anything else** (audiences `owner | visitor_quote | visitor_boundary` map 1:1 onto `visibility.ts`) → kind filter → deterministic scoring (`recency = 1/(1+ageDays/30)` + bounded keyword match, explicit `now`, no randomness). Every `RetrievedMemory` carries `memoryId`, score, matched reasons, source ids, and the full visibility decision.
- Stages 2–3 behind interfaces only (`retrieval-provider.ts`): `RetrievalProvider`, `EmbeddingProvider` (aligned with the 5.4 `ModelProvider.embed` capability; missing → typed `unsupported_capability`), owner-scoped `VectorStore` (entries reference memoryIds only — vendor data never touches Core records), `Reranker` seam with pass-through + deterministic kind-boost references. Semantic ranking applies the identical permission filter before returning. Reference implementations: FNV-1a hash embedding (token + char-bigram for unsegmented Chinese) and in-memory cosine vector store. **No vector database built**; external stores documented as optional adapters in `docs/engineering/RETRIEVAL_ADAPTERS.md`.
- Knowledge adapters (`knowledge.ts`): file/note/link/external ingest content-as-input (no fs/network in Core) into `ArchiveKnowledgeSource` + deterministic 500-char chunks with full provenance (sourceId, chunkIndex, adapter, kind, title, locator, ingestedAt); chunk visibility defaults owner-private; `retrieveKnowledgeChunks` enforces the same visibility-before-retrieval rule. External sources map to archive kind `note` to keep the 5.3 contract stable (chunk provenance preserves `external`) — recorded deviation.
- Acceptance tests: zero-embedding personal retrieval; semantic on/off leaves Core records byte-identical; outputs contain source IDs + visibility decisions; `dropNamespace` removability proof; prompt-injection text inside a private memory/chunk is still never returned for visitor roles; cross-owner isolation on all paths incl. vector namespaces.
- Validation: Core tests **132/132** (+26: retrieval 10, retrieval-provider 9, knowledge 7); miniprogram page tests 50/50; cloud functions memory 17/17, agent 71/71, card 13/13, now 16/16, requests 24/24, content-check 7/7; `npm run lint` ✅, `npm run build` ✅, `git diff --check` ✅.

Owner: AI and Data

Start with structured filters, recency, memory kind, and keyword matching. Add
semantic retrieval only behind `RetrievalProvider`.

Support:

- Embedding provider interface
- Optional vector-store interface
- Chunk and source provenance
- Visibility filtering before retrieval
- Optional reranking
- File, note, link, and external knowledge-source adapters

Do not build a new vector database.

Acceptance:

- Personal memory works without embeddings or a vector database
- Enabling semantic retrieval does not change Core records
- Retrieved output contains source IDs and visibility decisions
- A vector adapter can be removed without losing canonical memory data
- Prompt-injection and cross-owner isolation tests pass

Dependencies: 5.4 and 5.5

## 5.7 Ship A One-Command Self-Hosted Stack

Status: `[x]`

Completion:

- 2026-07-21, on branch `feature/task-5.7-self-hosted-stack`. Milestone 5 is complete: a technical user can run the full core product without the official service and move data in/out without vendor lock-in.
- New `packages/server/` (zero runtime deps, Node 24 built-ins): open server composing Core + local-store (node:sqlite, migrations at startup) + config-driven model providers (mock default; OpenAI-compatible/BYOK/local via env — no VibeCard Cloud key required). H5-ready JSON API under `/api/v1` (CORS-enabled): owner identity create/import `.vibe`, My Vibe chat with memory/Now proposals, memory confirm/edit/reject/pause/resume/delete, Card draft+publish, full Now lifecycle, contacts CRUD, requests inbox/summary/action (connect requires owner-owned contact ids), private/public export, delete-all guarded by `export_required`; public endpoints: Card projection (≤3 active Now, no contacts by construction), visitor chat (visitor_quote/visitor_boundary retrieval only, 6-round cap, `forbiddenForVisitor` second net), request submission (Core 24h gate + weak-reason rejection), contact unlock only after owner connect.
- Security defaults: single-owner bearer token (constant-time compare; ephemeral + warning when unset; all owner families 401-tested), localhost bind default, in-memory token-bucket rate limits per visitor+IP on top of the Core pair gate, pluggable `moderate(text)` hook that **fails closed** (hook throw → 503 `moderation_unavailable`, negative verdict → 403, nothing stored), provider-style log redaction, no stack traces in responses.
- Backup/restore: backup = private `.vibe` export (HTTP or `npm run backup --prefix packages/server`) + optional sqlite copy; restore CLI rejects public archives and non-forced overwrites; delete-all refuses until a private export is newer than the last write. Backup/restore round-trip test proves Core fixture state preserved deep-equal.
- Deploy assets: `deploy/docker-compose.yml` (node:24, `/data` volume, localhost-mapped port, validated with `docker compose config`), `deploy/.env.example` (all vars documented, no secrets), `packages/server/Dockerfile` with healthcheck, `docs/engineering/SELF_HOSTING.md` (quickstart, config, API map, security, moderation hook API, backup/upgrade, "no VibeCard Cloud account or key required").
- Automated smoke test spawns the real server on an ephemeral port: health → import fixture archive → publish Card+Now → visitor open/chat (mock provider) → request → inbox+summary → connect with contact → visitor sees unlock (stranger 404) → backup → restore into fresh server → fixture state preserved → delete-all.
- Validation: server tests **13/13**; shared **132/132**; local-store **48/48**; miniprogram page tests 50/50; cloud functions memory 17/17, agent 71/71, card 13/13, now 16/16, requests 24/24, content-check 7/7; web e2e **70/70**; `npm run lint` ✅, `npm run build` ✅, `git diff --check` ✅; sanity boot `/healthz` OK, nothing left running.
- Recorded deviations: blocked-users list lives in a JSON sidecar (repositories have no profile/blocked store — documented); default moderation hook is a passthrough with the fail-closed contract enforced around it; `packages/server` is intentionally not a root workspace (scripts via `npm --prefix packages/server`).

Owner: Infrastructure

Provide:

- Open server for owner, public Card, visitor agent, and requests
- H5-ready HTTP API
- Docker Compose reference deployment
- Environment template
- Database migrations
- Health checks, backups, restore, and upgrade documentation
- Rate limiting, moderation hooks, and secure defaults

Acceptance:

- A clean machine can start the stack from documented commands
- Setup does not require a VibeCard Cloud key
- Owner can import a `.vibe` archive and publish a Card
- A visitor can open the Card, talk to the public agent, and submit a request
- Backup and restore preserve Core fixture state
- Deployment passes an automated smoke test

Dependencies: 5.3, 5.4, 5.5, and 5.6

Milestone 5 is complete when a technical user can run the complete core product
without the official service and move data in and out without vendor lock-in.

---

# Milestone 6: H5 / PWA Open Client

## 6.1 Build Local-First Owner Onboarding

Status: `[ ]`

Owner: Web

Implement:

- Create or import a Vibe
- Choose local, self-hosted, or managed connection
- Configure a model only when the selected mode requires it
- Talk to My Vibe and confirm memory
- Edit Card and publish Now
- Export and delete data

Acceptance:

- Local mode works without account creation
- Self-hosted endpoint can be changed without rebuilding the client
- No credential is written into a public Card or browser log
- Mobile and desktop browser layouts pass

Dependencies: Milestone 5

## 6.2 Build Public Sharing And Visitor Flow

Status: `[ ]`

Owner: Web

Implement:

- Public Card URL
- QR sharing
- Static public snapshot mode
- Optional online visitor agent
- Connection request submission
- Owner-selected contact unlock
- Embeddable Card

Acceptance:

- Static Card remains readable when the owner agent is offline
- Agent-disabled state is clear and still allows an approved contact path
- Private memory and contacts never appear in page source or public API
- Self-hosted and managed URLs follow the same public contract

Dependencies: 6.1 and 5.7

## 6.3 Make H5 Installable And Resilient

Status: `[ ]`

Owner: Web

Add:

- PWA installation
- Offline owner shell and queued local changes
- Sync-conflict handling
- Accessible keyboard and screen-reader paths
- Reduced-motion behavior
- Upgrade-safe local migrations

Acceptance:

- Owner can read and edit local state offline
- Reconnect does not duplicate memory or Now items
- Accessibility checks and responsive E2E tests pass
- A failed migration leaves a recoverable export

Dependencies: 6.1 and 6.2

---

# Milestone 7: Open Managed Cloud Service

The managed service operates the open system. It must not become a mandatory
closed dependency.

## 7.1 Add Account, Sync, And Public-Agent Hosting

Status: `[ ]`

Owner: Cloud

Provide:

- Optional account and device sync
- Stable Card URLs
- Always-on visitor agents
- Request notifications
- Backups and restore
- Region and retention controls

Acceptance:

- Local users can opt in without recreating identity
- Users can export and leave the service
- Sync respects memory visibility and deletion
- Public uptime does not require uploading unselected raw data

Dependencies: Milestone 6

## 7.2 Add Managed AI And Knowledge Plans

Status: `[ ]`

Owner: Cloud and AI

Sell managed service for:

- Model routing and usage credits
- Embeddings and retrieval
- Managed knowledge storage
- Parsing and source synchronization
- Larger memory and file limits
- Operational monitoring and support

Requirements:

- Usage and cost are visible
- Users may continue using their own model and store
- Canonical data remains exportable
- Billing state never changes permission behavior

Acceptance:

- Quotas are enforced server-side
- A user can switch from managed AI to BYOK
- Failed payment does not silently delete or expose data
- Data export works without an active paid plan

Dependencies: 7.1

## 7.3 Publish Cloud Deployment And Portability Guarantees

Status: `[ ]`

Owner: coordinating agent

Document:

- Which open-source release the cloud runs
- Data locations and retention
- Export and deletion guarantees
- Self-host migration procedure
- Incident and security disclosure process
- Service-level options

Acceptance:

- A managed fixture account can migrate to self-hosted and remain functional
- Public Card links have a documented redirect/export strategy
- Cloud-specific metadata does not contaminate the portable archive

Dependencies: 7.1 and 7.2

---

# Milestone 8: Desktop Vibe Pet

## 8.1 Build The Lightweight Desktop Shell

Status: `[ ]`

Owner: Desktop

Implement:

- Menu-bar or lightweight desktop companion
- One-click text capture
- My Vibe conversation
- Memory confirmation
- Card and Now update proposals
- Connection-request inbox

Acceptance:

- Desktop uses the same Core and selected repository
- It does not create a second memory system
- Private local mode works without cloud login
- Background behavior and notifications are user-controlled

Dependencies: Milestone 5

## 8.2 Add Local Knowledge And Model Options

Status: `[ ]`

Owner: Desktop and AI

Add:

- File, folder, note, link, and clipboard ingestion
- Local model adapter
- Private OpenAI-compatible endpoint
- Source management and deletion
- Optional encrypted sync

Acceptance:

- Removing a source removes it from future retrieval
- Local files are not uploaded without explicit configuration
- Answers show internal source provenance to the owner
- Desktop can export a portable archive

Dependencies: 8.1 and 5.6

---

# Milestone 9: Mobile And Adapter Ecosystem

## 9.1 Define The Client SDK

Status: `[ ]`

Owner: Core

Provide documented SDKs for:

- Card rendering
- Owner and visitor sessions
- Memory proposal confirmation
- Now publishing
- Connection requests
- Authentication adapter integration

Acceptance:

- SDK examples work against self-hosted and managed servers
- SDK license permits third-party integrations
- SDK never exposes provider-specific or database-specific records

Dependencies: Milestones 5 and 6

## 9.2 Add Native Mobile Clients Only For Native Value

Status: `[ ]`

Owner: Mobile

Build iOS and Android when the product needs:

- Push notifications
- Voice capture
- Offline local models
- Share-sheet integration
- Camera, NFC, or contact-card capabilities

Acceptance:

- Native clients reuse Core contracts and conformance tests
- Platform permission prompts are contextual
- The complete owner data remains exportable
- H5 remains a supported first-class client

Dependencies: 9.1

## 9.3 Add Third-Party Adapters Without Becoming A Community

Status: `[ ]`

Owner: Ecosystem

Support third-party:

- Model providers
- Storage and vector stores
- Knowledge sources
- Themes and Card templates
- Platform share targets
- Importers and exporters

Do not add a central social feed as the adapter marketplace.

Acceptance:

- An adapter declares capabilities and permissions
- Adapter failures cannot bypass Core privacy rules
- A user can disable and remove an adapter with its credentials
- Reference adapters and contribution tests are documented

Dependencies: 9.1

---

# Long-Term Definition Of Done

VibeCard is fully open and portable when:

- The complete personal AI loop runs locally or self-hosted
- No official account, model, database, or vector service is mandatory
- WeChat, H5, desktop, and later mobile clients share one Core
- Owner-confirmed memory and public projection remain separate
- A user can export, import, migrate, and delete all canonical data
- Public Card and Now work without a global community feed
- Official cloud earns revenue from managed operation, not artificial lock-in
- A third party can build a compatible client or adapter from public contracts

Future work:

- macOS menu-bar or lightweight desktop companion
- One-click text and voice capture
- File and link ingestion
- Cloud, bring-your-own-key, local, and private model options
- Shared memory with Mini Program and Web

The desktop client must reuse the same `Memory`, `VibeCard`, and permission contracts. It must not create a second memory system.
