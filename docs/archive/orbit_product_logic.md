# Orbit (formerly Bonjour) Web3 Product Logic (Archived)

## 1. Document Purpose
This document defines the product logic, viral growth mechanics, identity system, and MVP for **Orbit** (the upgraded Web3 identity and connection protocol). 

The core assumption:
- `Orbit` focuses on "lightweight social connection, rapid relationship building, and deeply integrated composable Web3 identities."
- It is designed as a standalone, embeddable component/Mini-App that naturally spreads across `Telegram`, `Discord`, `X (Twitter)`, `Line`, and other communities.
- It features deep editing, verifiable credentials (NFT/Wallet binding), and high-end, responsive global aesthetics.

## 2. Core Definition
A lightweight, Bento-box style social DApp optimized for Web3 communities:
- Users enter via native embedded links from Telegram, Discord, X, or Line.
- Users showcase a "Minimalist Identity Card" displaying who they are, their key highlights (launches, articles, talks), verified wallets, and what they are looking for.
- Interactive mechanics (Saying Hi, Room presence, verifiable connection matching).
- Users' social identities naturally mature into a lightweight cross-platform DID.

## 3. High-End Global Aesthetic & Web3 Vibe
The design language follows top-tier Web3 / Silicon Valley standards:
- **Bento Box Layouts**: Clean, modular, widget-like cards.
- **Light Theme**: Deep contrast with bright white cards against a soft, tinted technical background, accented with neon/electric colors (e.g., Electric Purple, Volt Green, Cyan).
- **Responsive**: Mobile-first fluid animations catering to touch-first usage within in-app browsers.

## 4. Deep Features & Verifications
- **Deep Editing Modes**: Users can enter an edit state to tweak their bio, drag-and-drop tags, and configure identity layers.
- **Wallet & Highlight Binding**: Integration for EVM wallets to pull PFP NFTs, combined with a curated "Highlights" section (key news, project launches, articles, or talks) with direct external links.
- **Multi-Platform Verification**: Instead of just Web2 accounts, users verify Telegram, Discord, Line, and X, turning the card into a hub of verified touchpoints.

## 5. Core Product Loop
### 5.1 Identity Layer (The Orbit Card)
极简初始化. The core view is a single, vivid digital badge (Name Card) that acts as the user's primary social surface.
- Avatar (can be an NFT) and vibrant gradient backgrounds.
- Handle & One-line bio.
- Tags & Ecosystems (`Solana`, `Base`, `DeFi`, `AI`).
- Intent (`Looking for co-founder`, `Hiring`, `Learning`).
- Highlights & Milestones (`Project launched`, `Speaking engagement`, `Blog post`).

### 5.2 Connecting Layer
- **Say Hi**: Frictionless one-tap contextual messages (intent-led, not a chat interface).
- **Matching & Context**: Tying cards to specific events, communities, or locations (e.g., "Both at Token2049").

### 5.3 Propagation / Share Layer (CRITICAL)
- **Multi-Platform Universal Link**: The card works beautifully in a Twitter card, as a Line message preview, or as a Telegram mini-app.
- Native "Share Drawer" driving network effects.

### 5.4 Settlement Layer (Light DID)
- The interactions evolve into a verifiable profile that other DApps can securely read (with permission).

## 6. Form Factor Extensions & Ecosystem Integration
While Orbit starts as a viral mobile-first web app/mini-program, its ultimate form extends directly into the user's browser.

### 6.1 The Orbit Chrome Extension (Future Phase)
To deeply integrate into existing Web2 and Web3 platforms, Orbit will also be distributed as a Chrome Extension.
- **Contextual Overlays**: When browsing X (Twitter), Farcaster, Github, or Discord (web), the extension can recognize linked handles or wallet addresses and overlay their Orbit Card seamlessly. This reveals Web3 credentials directly on top of legacy platforms.
- **One-Click Connecting**: Users can send "Signals" or "Say Hi" via Orbit directly from the extension tab or side-panel while attending virtual events (e.g., Twitter Spaces) or reading project documentation.
- **Passive Passport**: The extension serves as a localized identity provider, reducing onboarding friction for new Web3 DApps by securely injecting the user's Orbit DID/Profile upon request.
- **Clipboard Intelligence**: Automatically detects copied wallet addresses or ENS domains to bring up their Orbit identity card for quick verification before transferring assets or interacting.
