# Contributing To VibeCard

Thanks for helping build an open, self-hostable personal AI identity and
memory system. This file summarizes how to work in this repository; the
binding rules live in [`AGENTS.md`](./AGENTS.md), which every contributor
(human or agent) should read first.

## Setup

Requirements: Node.js 20+, npm 9+.

```bash
npm install
```

Validation commands (from repository root):

```bash
npm run lint
npm run build
npx playwright install chromium    # once per new machine or Playwright upgrade
npm run test:e2e --workspace=packages/web
npm test --prefix packages/contracts        # contract work only
```

Mini Program changes additionally require opening `packages/miniprogram` in
WeChat DevTools, compiling without errors, and verifying owner and visitor
paths separately.

## Branch And Commit Conventions

- Work on feature branches off `main`: `feature/<task>-<slug>`.
- Commit style follows existing history:
  `feat(miniprogram): ...`, `feat(web): ...`, `feat(shared): ...`,
  `fix(agent): ...`, `chore(plan): ...`, `merge: ...`.
  Keep the scope matching the package you touched.
- Multi-lane tasks follow the lane ownership map in AGENTS.md §6:
  - Lane A: `packages/miniprogram/miniprogram/`
  - Lane B: `packages/miniprogram/cloudfunctions/` (except `agent/`)
  - Lane C: `packages/shared/` and `packages/miniprogram/cloudfunctions/agent/`
  - Lane D: `packages/web/`
  - Coordinator: `AGENTS.md`, `README.md`, `docs/`, root `package.json`,
    `packages/miniprogram/miniprogram/app.json`

  Stay inside your lane; ask the coordinator before touching shared files.

## Contract-First Rule

The shared domain objects (`VibeCard`, `Memory`, `ConnectionRequest`,
`NowItem`) are defined in `packages/shared`. Define or update their
contracts **before** implementing divergent client behavior. AI business
outputs must be validated structured data — never let clients parse
free-form model text to decide application state.

## Pull Request Expectations

- Implement the smallest complete user outcome.
- Owner and visitor roles stay explicit; permissions must be correct.
- Every AI flow includes loading, empty, error, retry, and
  permission-denied states.
- Stored v1 profile data must still load (backward compatibility).
- No secrets, real contact data, or production user data in any commit —
  see `docs/engineering/OPEN_SOURCE.md` §6.
- Run the validations relevant to your changed surface; run the full
  relevant suite before milestone completion.

## Definition Of Done (summary)

A feature is done when it produces the intended user outcome, owner/visitor
permissions are correct, all UI states exist, AI output is structured and
validated, v1 data still loads, relevant tests pass, and documentation
remains accurate. Full list: AGENTS.md §12.

## License

By contributing, you agree that your contributions are licensed under the
license of the package they land in: AGPL-3.0-only for the runnable product
(miniprogram, web, cloud functions) and MIT for integration surfaces
(`packages/shared`, `packages/contracts`). See
`docs/engineering/OPEN_SOURCE.md` for the full policy.
