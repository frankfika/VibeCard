# VibeCard

**完全开源、会越来越懂你的个人 AI 分身与名片。**

你平时和自己的 Vibe 聊天，它在得到确认后记住你的经历、当下、口味和边界。你可以发布少量最近动态，让 Card 保有时间感。别人打开 VibeCard，会先通过分身理解你、说明为什么想认识你；真正值得发生的连接，再由你决定是否开始。

> **先理解，再认识。**

## Current MVP

The 2026 WeChat Mini Program competition build focuses on four surfaces:

1. **My Card**: a living view of who I am now
2. **My Vibe**: a private conversation that builds confirmed memory
3. **Visitor Vibe**: a public, permission-aware way to understand me
4. **Connection Requests**: owner-controlled contact sharing

Games, generic icebreakers, companion discovery, public feeds, points, and relationship data on-chain are outside the current MVP.

Personal owner-published `Now` updates belong inside the Card. They are not a
global feed and have no follower graph, ranking, likes, or recommendation.

WeChat is the competition-first client, not the product boundary. The
post-competition roadmap opens the complete Core, H5/PWA, self-host server,
model/storage/retrieval adapters, and later desktop and mobile clients.

## Start Here

Coding agents must read [`AGENTS.md`](./AGENTS.md) first.

Product and development documents:

1. [`docs/product/PRODUCT.md`](./docs/product/PRODUCT.md)
2. [`docs/engineering/DEVELOPMENT_PLAN.md`](./docs/engineering/DEVELOPMENT_PLAN.md)
3. [`docs/engineering/AI_BEHAVIOR.md`](./docs/engineering/AI_BEHAVIOR.md)
4. [`docs/engineering/ARCHITECTURE.md`](./docs/engineering/ARCHITECTURE.md)

Historical Bonjour, Orbit, Web3, games, and companion-discovery documents are under [`docs/archive/`](./docs/archive/).

## Repository

```text
VibeCard/
├── AGENTS.md                         # Rules and reading order for coding agents
├── docs/
│   ├── README.md                     # Documentation map
│   ├── product/
│   │   └── PRODUCT.md                # Current product truth
│   ├── engineering/
│   │   ├── DEVELOPMENT_PLAN.md       # Ordered implementation checklist
│   │   ├── AI_BEHAVIOR.md            # Memory, permission, and agent contracts
│   │   └── ARCHITECTURE.md           # Detailed technical reference
│   ├── archive/                      # Historical documents only
│   └── assets/
├── packages/
│   ├── web/                          # React Web / public Card / PWA
│   ├── miniprogram/                  # WeChat Mini Program and cloud functions
│   ├── shared/                       # Shared domain contracts
│   ├── contracts/                    # Optional legacy Web3 contracts
│   └── platforms/                    # Future platform adapters
└── pitch-deck/                       # Competition presentation material
```

## Existing Stack

| Surface | Stack |
|---|---|
| Web | React 19, TypeScript, Vite, Tailwind CSS, Motion |
| Mini Program | Native WeChat Mini Program, WeChat Cloud Development |
| Shared | TypeScript domain types and fixtures |
| Testing | TypeScript checks, Vite build, Playwright |
| Optional legacy | Wagmi, Viem, IPFS, Hardhat |

## Web Development

Requirements:

- Node.js 20+
- npm 9+

Install and run:

```bash
npm install
npm run dev
```

The Web app runs at [http://localhost:3000](http://localhost:3000).

Validate:

```bash
npm run lint
npm run build
npx playwright install chromium    # first E2E run on a new machine
npm run test:e2e --workspace=packages/web
```

Current verified baseline on 2026-07-20: the full Playwright suite passes 54/54
across desktop and mobile projects.

## WeChat Mini Program

Open this directory in WeChat DevTools:

```text
packages/miniprogram
```

Current project configuration:

```text
Mini Program root: miniprogram/
Cloud function root: cloudfunctions/
```

Mini Program work must verify both owner and visitor paths. A competition release also requires a physical-device share and deep-link test.

## Development Order

Do not start by rebuilding the entire application.

Follow [`docs/engineering/DEVELOPMENT_PLAN.md`](./docs/engineering/DEVELOPMENT_PLAN.md):

```text
Focus existing navigation
-> Build the four-screen mock story
-> Make My Vibe remember confirmed facts
-> Add visitor understanding and connection requests
-> Add safety, reliability, and delight
-> Prepare the competition release
```

Post-competition order:

```text
Open-source and portable Core
-> data export/import and provider adapters
-> one-command self-hosted server
-> H5 / PWA
-> optional managed VibeCard Cloud
-> desktop Vibe Pet
-> mobile and third-party adapter ecosystem
```

Local and self-hosted use must not require an official VibeCard account.
VibeCard Cloud sells managed availability, sync, AI usage, retrieval, backups,
and support rather than a closed mandatory backend.

## Product Promise

```text
VibeCard = 被看见
My Vibe = 被理解
Connection Request = 说明来意
Owner Decision = 保留边界
```

**AI 时代，我们不需要更多联系人。我们需要更少被错过的关系。**
