# VibeCard Documentation

This directory has one current product path and one historical archive.

## Read In Order

| Order | Document | Purpose |
|---|---|---|
| 1 | [`../AGENTS.md`](../AGENTS.md) | Rules, scope, ownership, and validation |
| 2 | [`product/PRODUCT.md`](product/PRODUCT.md) | What the product should feel like and do |
| 3 | [`engineering/DEVELOPMENT_PLAN.md`](engineering/DEVELOPMENT_PLAN.md) | Ordered, checkable implementation work |
| 4 | [`engineering/AI_BEHAVIOR.md`](engineering/AI_BEHAVIOR.md) | Memory, visitor, permission, and AI output rules |
| 5 | [`engineering/ARCHITECTURE.md`](engineering/ARCHITECTURE.md) | Detailed technical reference when needed |
| 6 | [`engineering/RELEASE.md`](engineering/RELEASE.md) | Production release, deployment, and verification gates |

An AI developer should not read the archive before reading the current documents.

## Directory Map

```text
docs/
├── README.md
├── product/
│   └── PRODUCT.md
├── engineering/
│   ├── DEVELOPMENT_PLAN.md
│   ├── AI_BEHAVIOR.md
│   └── ARCHITECTURE.md
├── archive/
│   ├── README_WEB3_V1_EN.md
│   ├── PLAN_WEB3_V1.md
│   ├── TEST_REPORT_WEB3_V1.md
│   ├── VIBECARD_2_TECHNICAL_DRAFT_2026-07-19.md
│   ├── original_concept_zh.md
│   ├── orbit_product_logic.md
│   └── web3/
│       ├── LOCAL_DEV.md
│       └── DEPLOYMENT.md
└── assets/
```

## Current Source Of Truth

The current product has one loop:

```text
Talk to my private Vibe
-> Confirm what it should remember
-> Publish selected recent updates to Now
-> Publish selected memory to my VibeCard
-> Let a visitor understand me through my Vibe
-> Receive a specific connection request
-> Decide whether to connect
```

The competition MVP has four surfaces:

- My Card
- My Vibe
- Visitor conversation
- Connection requests

Now is a small owner-published section inside My Card, not a fifth community
surface. The post-competition roadmap turns the same product into a fully
open-source, self-hostable Core with H5/PWA, provider adapters, managed-cloud,
desktop, and later mobile clients.

## Archive Policy

Files under `archive/` are kept for context and code archaeology. They include earlier product directions involving:

- Bonjour and Orbit
- Web3 identity and on-chain storage
- Games and generic icebreakers
- Companion activity discovery
- Older release and deployment plans

They are not current requirements. Do not revive an archived feature unless the user explicitly requests it.

## Updating Documentation

When product scope changes:

1. Update `product/PRODUCT.md`
2. Update affected tasks in `engineering/DEVELOPMENT_PLAN.md`
3. Update `engineering/AI_BEHAVIOR.md` if memory, permission, or AI behavior changes
4. Update `engineering/ARCHITECTURE.md` only for deeper technical consequences
5. Keep `README.md` and `AGENTS.md` short and consistent

Do not create a new product document when an existing current document can be updated.
