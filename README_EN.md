<div align="center">

# vibecard
> Your Social Identity Card + Companion Discovery Platform · 你的社交身份名片 + 搭子发现平台

![Profile Card](./docs/assets/card-profile.png)

### One Card, Infinite Connections

![Version](https://img.shields.io/badge/Version-0.2.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20WeChat%20%7C%20Telegram%20%7C%20TikTok%20%7C%20Facebook%20%7C%20Twitter-green?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)
![Web3](https://img.shields.io/badge/Web3-Wagmi%20%2B%20Viem-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

[Features](#-features) · [Screenshots](#-screenshots) · [Quick Start](#-quick-start) · [Architecture](#-architecture)

[简体中文](./README.md) | __English__

---
</div>

## Introduction

vibecard is a social app that combines **digital identity cards**, **social icebreaker card games**, and **companion activity discovery**. Whether you want to quickly present yourself at events, break the ice with fun questions, or find like-minded activity partners, vibecard makes it effortless.

### Why Choose vibecard?

| Traditional Way | vibecard |
|----------------|----------|
| Scattered info, hard to remember | Beautiful digital card, one-tap share |
| Awkward social openings, nothing to say | 80+ professional icebreaker cards, natural conversation starters |
| Want to find activity buddies, don't know where | 8 categories of companion discovery, quickly create or join |
| Data siloed on centralized servers | On-chain storage with IPFS, you own your data |

## Features

### 1. Card — Your Digital Identity

Create a stunning personal card with avatar, bio, tags, verified social accounts, and highlights. Share instantly to X, Telegram, Discord, Line, and more.

- **3-Step Quick Setup**: Enter name → Write bio → Pick tags
- **Rich Tag System**: 12 identity tags including Builder, Designer, Founder, Developer
- **Social Verification**: Wallet address verification for credibility
- **On-Chain Storage**: Save your profile to blockchain with one click
- **Say Hi**: Send quick greeting messages

![Profile Card](./docs/assets/card-profile.png)

### 2. Games — Social Icebreaker Cards

Curated 80+ high-quality social icebreaker cards based on Arthur Aron's 36 Questions, Gottman Institute research, Proust Questionnaire, and more.

- **6 Preset Scenarios**: First Date, Late Night Talk, Party Game, Couple Chat, Self Discovery, Relationship Refresh
- **Multi-dimensional Tag Filtering**: Filter by source, game type, depth, and topic
- **Smart Deduplication**: Drawn cards won't repeat until reset
- **Favorites System**: Save cards you love for quick access
- **History Tracking**: View played cards and favorites
- **On-Chain Sync**: Backup game records to blockchain

![Games Page](./docs/assets/games.png)
![Card Draw](./docs/assets/games-card.png)

### 3. Discover — Companion Activities

Discover various activity partners around you, from sports and travel to dining and study — 8 categories covering all social scenarios.

- **8 Activity Categories**: Sports, Travel, Dining, Study, Movies, Gaming, Pets, Hobbies
- **Quick Activity Creation**: Fill in title, category, location, time, and max participants
- **One-Tap Join/Leave**: Join interesting activities with a single click
- **On-Chain Activities**: Publish activities to blockchain for transparency

![Discover Page](./docs/assets/discover-empty.png)
![Create Activity](./docs/assets/discover-create.png)

## Multi-Platform Support

| Platform | Type | Storage Strategy | Blockchain Support |
|----------|------|-----------------|-------------------|
| **Web** | Responsive Web App | IPFS + Smart Contract | Full Support |
| **WeChat** | Mini Program | WeChat Cloud + On-Chain Read | Read-Only |
| **Telegram** | Mini App | IPFS + Smart Contract | Full Support |
| **TikTok** | Mini App | IPFS + Smart Contract | Full Support |
| **Facebook** | Instant Games | IPFS + Smart Contract | Full Support |
| **Twitter/X** | Card + Web | IPFS + Smart Contract | Full Support |
| **Douyin** | Mini Program | Centralized Server (Compliance) | Optional Extension |

### Domestic vs International Strategy

**Domestic Version** (WeChat, Douyin) — due to platform policies:
- User data stored on proprietary servers / WeChat Cloud
- Blockchain features use compliance-friendly terms ("Digital Identity" instead of "Wallet", "Attestation" instead of "On-Chain")
- "Open in Browser" option for full Web3 experience

**International Version** (Telegram, TikTok, Facebook, Twitter):
- Full Web3 wallet connection (MetaMask, WalletConnect)
- Multi-chain deployment (Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Polygon Amoy)
- Permanent IPFS storage with on-chain ownership records

## On-Chain Storage (Inspired by mirror.xyz)

vibecard uses a **dual-layer storage architecture** inspired by mirror.xyz:

### Storage Layers
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Data Layer** | IPFS (Pinata) | Actual content storage (profile JSON, activities, game records) |
| **Anchor Layer** | Smart Contract | Stores IPFS CID + author address + timestamp |

### Supported Testnets
| Network | Chain ID | Purpose |
|---------|----------|---------|
| Ethereum Sepolia | 11155111 | Primary anchor chain |
| Base Sepolia | 84532 | Low-Gas L2 |
| Arbitrum Sepolia | 421614 | Low-Gas L2 |
| Polygon Amoy | 80002 | Asia-friendly |

### Core Flow
```
User edits profile → Click "Sync to Chain"
→ Content serialized to JSON → Upload to IPFS → Get CID
→ Call smart contract publish("profile", cid, sha256)
→ Transaction confirmed, permanently attested on-chain
```

## Screenshots

| Profile Card | Games | Discover |
|-------------|-------|----------|
| ![Profile Card](./docs/assets/card-profile.png) | ![Games](./docs/assets/games.png) | ![Discover](./docs/assets/discover-empty.png) |

| Card Draw | Create Activity |
|-----------|----------------|
| ![Card Draw](./docs/assets/games-card.png) | ![Create Activity](./docs/assets/discover-create.png) |

## Quick Start

### Requirements

- Node.js 18+
- npm 9+

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/frankfika/vibecard.git
cd vibecard

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at http://localhost:3000.

### Build for Production

```bash
npm run build
```

Build output is located in `packages/web/dist/`.

## Architecture

```
vibecard/
├── packages/
│   ├── web/              # Web app (React + Vite + Tailwind CSS)
│   ├── shared/           # Shared library (card data, tags, type definitions)
│   ├── miniprogram/      # WeChat Mini Program
│   ├── contracts/        # Smart Contracts (Solidity)
│   └── platforms/        # Multi-platform adapters
│       ├── telegram/     # Telegram Mini App SDK
│       ├── facebook/     # Facebook Instant Games SDK
│       ├── twitter/      # Twitter/X Card integration
│       ├── tiktok/       # TikTok Mini App SDK
│       └── douyin/       # Douyin Mini Program SDK + compliance
├── docs/                 # Documentation & screenshots
└── scripts/              # Utility scripts
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Animation | Motion (Framer Motion) |
| State Management | React Hooks + localStorage |
| Icons | Lucide React |
| Wallet Connection | Wagmi + RainbowKit |
| Blockchain Interaction | Viem |
| Smart Contracts | Solidity + Hardhat |
| Decentralized Storage | IPFS (Pinata) |
| Testing | Playwright |

## Project Structure

```
packages/web/src/
├── App.tsx                         # Main app component, tab bar routing
├── components/
│   ├── WalletConnect.tsx           # Wallet connect button
│   └── IMBrowserNotice.tsx         # IM browser notice
├── lib/
│   ├── web3/
│   │   ├── config.ts               # Multi-chain config + contract ABI
│   │   └── ipfs.ts                 # IPFS upload/read
│   └── compatibility/
│       ├── browser.ts              # Browser environment detection
│       └── im-adapters.ts          # IM platform adaptation strategies
├── pages/
│   ├── CardPage.tsx                # Card page + on-chain sync
│   ├── GamesPage.tsx               # Games page + on-chain sync
│   └── DiscoverPage.tsx            # Discover page + activity on-chain
├── store.ts                        # State management + on-chain sync logic
└── main.tsx                        # Entry point (WagmiProvider injection)
```

## Data Persistence

**Web / International**:
- On-chain contract → IPFS → localStorage (fallback)

**Domestic**:
- WeChat Cloud / proprietary servers → localStorage

- `vibecard_profile` — User profile information
- `vibecard_tab` — Currently selected tab
- `vibecard_game_session` — Game history and favorites
- `vibecard_activities` — Activity list
- `vibecard_profile_sync` — On-chain sync status

## Smart Contract

The `vibecardRegistry` contract is deployed on multiple testnets:

```solidity
function publish(string calldata contentType, string calldata ipfsHash, bytes32 contentHash) external;
function getLatestProfile(address user) external view returns (string memory);
function getUserEntries(address user) external view returns (ContentEntry[] memory);
```

See `packages/contracts/vibecardRegistry.sol` for full implementation.

## Environment Variables

Create a `.env` file in `packages/web/`:

```env
VITE_PINATA_JWT=your_pinata_jwt_token
VITE_PINATA_GATEWAY=your_pinata_gateway
```

## Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open-sourced under the [MIT](LICENSE) License.

---

<div align="center">

**Made with 💚 by vibecard Team**

</div>
