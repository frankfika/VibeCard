<div align="center">

# vibecard
> 你的社交身份名片 + 搭子发现平台 · Your Social Identity Card + Companion Discovery Platform

![名片页](./docs/assets/card-profile.png)

### 一张卡片，连接无限可能

![Version](https://img.shields.io/badge/Version-0.2.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20WeChat%20%7C%20Telegram%20%7C%20TikTok%20%7C%20Facebook%20%7C%20Twitter-green?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)
![Web3](https://img.shields.io/badge/Web3-Wagmi%20%2B%20Viem-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

[核心功能](#-核心功能) · [界面导览](#-界面导览) · [快速开始](#-快速开始) · [技术架构](#-技术架构)

__简体中文__ | [English](./README_EN.md)

---
</div>

## 项目简介

vibecard 是一个融合了**数字身份名片**、**社交破冰卡牌游戏**和**搭子活动发现**的社交应用。无论是想在活动中快速展示自己、用趣味问答拉近彼此距离，还是寻找志同道合的活动伙伴，vibecard 都能帮你轻松实现。

### 为什么选择 vibecard？

| 传统方式 | vibecard |
|---------|----------|
| 名片信息零散，难以记住 | 精美的数字名片，一键分享 |
| 社交开场尴尬，无话可说 | 80+ 专业破冰卡牌，自然开启话题 |
| 想找人一起活动，不知道去哪找 | 8 大分类搭子发现，快速发起或加入 |

## 核心功能

### 1. 名片 (Card) — 你的数字身份

创建精美的个人名片，包含头像、简介、标签、社交账号验证和亮点展示。支持一键分享到 X、Telegram、Discord、Line 等平台。

- **三步快速创建**：输入姓名 → 填写简介 → 选择标签
- **丰富标签系统**：Builder、Designer、Founder、Developer 等 12 种身份标签
- **社交验证**：钱包地址验证，展示可信度
- **Say Hi 功能**：快速发送打招呼消息

![名片页](./docs/assets/card-profile.png)

### 2. 互动 (Games) — 社交破冰卡牌

基于 Arthur Aron 36 问、Gottman 研究所、普鲁斯特问卷等经典心理学研究， curated 80+ 张高质量社交破冰卡牌。

- **6 大预设场景**：第一次约会、深夜长谈、派对游戏、情侣夜话、认识自我、感情保鲜
- **多维标签筛选**：按来源、游戏类型、深度、话题分类筛选
- **智能去重**：已抽过的卡牌不会重复出现
- **收藏系统**：喜欢的卡牌一键收藏，随时回顾
- **历史记录**：查看已玩过的卡牌和收藏列表

![互动页](./docs/assets/games.png)
![抽卡](./docs/assets/games-card.png)

### 3. 发现 (Discover) — 搭子活动

发现身边的各类活动伙伴，从运动、旅行到饭局、学习，8 大分类覆盖各种社交场景。

- **8 大活动分类**：运动、旅行、饭局、学习、观影、游戏、遛宠、兴趣
- **快速发起活动**：填写标题、分类、地点、时间、人数上限即可发布
- **一键加入/退出**：看到感兴趣的活动，点击即可加入
- **本地持久化**：所有活动数据保存在本地，刷新不丢失

![发现页](./docs/assets/discover-empty.png)
![创建活动](./docs/assets/discover-create.png)

## 界面导览

| 名片页 | 互动页 | 发现页 |
|--------|--------|--------|
| ![名片页](./docs/assets/card-profile.png) | ![互动页](./docs/assets/games.png) | ![发现页](./docs/assets/discover-empty.png) |

| 抽卡效果 | 创建活动 |
|----------|----------|
| ![抽卡](./docs/assets/games-card.png) | ![创建活动](./docs/assets/discover-create.png) |

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/frankfika/vibecard.git
cd vibecard

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

应用将在 http://localhost:3000 启动。

### 构建生产版本

```bash
npm run build
```

构建产物位于 `packages/web/dist/` 目录。

## 多平台支持

| 平台 | 类型 | 存储策略 | 区块链支持 |
|------|------|----------|------------|
| **Web** | 响应式 Web App | IPFS + 智能合约 | 完整支持 |
| **微信小程序** | 原生小程序 | 微信云开发 + 链上只读 | 链上读取 |
| **Telegram** | Mini App | IPFS + 智能合约 | 完整支持 |
| **TikTok** | Mini App | IPFS + 智能合约 | 完整支持 |
| **Facebook** | Instant Games | IPFS + 智能合约 | 完整支持 |
| **Twitter/X** | Card + Web | IPFS + 智能合约 | 完整支持 |
| **抖音** | 小程序 | 中心化服务器（合规） | 可选扩展 |

### 国内 vs 海外策略

由于国内平台审核政策，**国内版本**（微信、抖音）采用：
- 用户数据存储在自有服务器/微信云开发
- 区块链相关功能使用合规词汇（"数字身份"替代"钱包"，"存证"替代"上链"）
- 提供"外部浏览器打开"选项，用户可在完整版体验链上功能

**海外版本**（Telegram、TikTok、Facebook、Twitter）支持完整的 Web3 功能：
- 钱包连接（MetaMask、WalletConnect）
- 多链部署（Ethereum Sepolia、Base Sepolia、Arbitrum Sepolia、Polygon Amoy）
- 内容永久存储在 IPFS，所有权记录在链上

## 技术架构

```
vibecard/
├── packages/
│   ├── web/              # Web 端 (React + Vite + Tailwind CSS)
│   ├── shared/           # 共享库 (卡牌数据、标签、类型定义)
│   ├── miniprogram/      # 微信小程序端
│   ├── contracts/        # 智能合约 (Solidity)
│   └── platforms/        # 多平台适配
│       ├── telegram/     # Telegram Mini App SDK
│       ├── facebook/     # Facebook Instant Games SDK
│       ├── twitter/      # Twitter/X Card 集成
│       ├── tiktok/       # TikTok Mini App SDK
│       └── douyin/       # 抖音小程序 SDK + 合规适配
├── docs/                 # 文档与截图
└── scripts/              # 工具脚本
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 样式方案 | Tailwind CSS 4 + shadcn/ui |
| 动画库 | Motion (Framer Motion) |
| 状态管理 | React Hooks + localStorage |
| 图标 | Lucide React |
| 钱包连接 | Wagmi + RainbowKit |
| 区块链交互 | Viem |
| 智能合约 | Solidity + Hardhat |
| 去中心化存储 | IPFS (Pinata) |
| 测试框架 | Playwright |

## 项目结构

```
packages/web/src/
├── App.tsx                         # 主应用组件，标签栏路由
├── components/
│   ├── WalletConnect.tsx           # 钱包连接按钮
│   └── IMBrowserNotice.tsx         # IM 浏览器提示
├── lib/
│   ├── web3/
│   │   ├── config.ts               # 多链配置 + 合约 ABI
│   │   └── ipfs.ts                 # IPFS 上传/读取
│   └── compatibility/
│       ├── browser.ts              # 浏览器环境检测
│       └── im-adapters.ts          # IM 平台适配策略
├── pages/
│   ├── CardPage.tsx                # 名片页 + 链上同步
│   ├── GamesPage.tsx               # 互动卡牌页 + 链上同步
│   └── DiscoverPage.tsx            # 发现页 + 活动上链
├── store.ts                        # 状态管理 + 链上同步逻辑
└── main.tsx                        # 应用入口 (注入 WagmiProvider)
```

## 链上存储（参考 mirror.xyz）

vibecard 采用 **双层存储架构**，参考 mirror.xyz 的实现逻辑：

### 存储层
| 层级 | 技术 | 用途 |
|------|------|------|
| **数据层** | IPFS (Pinata) | 实际内容存储（名片 JSON、活动列表、游戏记录） |
| **锚定层** | 智能合约 | 存储 IPFS CID + 作者地址 + 时间戳 |

### 支持的测试网
| 网络 | Chain ID | 用途 |
|------|----------|------|
| Ethereum Sepolia | 11155111 | 主锚定链 |
| Base Sepolia | 84532 | 低 Gas L2 |
| Arbitrum Sepolia | 421614 | 低 Gas L2 |
| Polygon Amoy | 80002 | 国内友好 |

### 核心流程
```
用户编辑名片 → 点击"同步到链上"
→ 内容序列化为 JSON → 上传到 IPFS → 获得 CID
→ 调用智能合约 publish("profile", cid, sha256)
→ 交易确认，链上永久存证
```

### 数据持久化

**Web/海外版本**：
- 链上合约 → IPFS → localStorage（降级兼容）

**国内版本**：
- 微信云开发 / 自有服务器 → localStorage

- `vibecard_profile` — 用户名片信息
- `vibecard_tab` — 当前选中的标签页
- `vibecard_game_session` — 游戏历史与收藏
- `vibecard_activities` — 活动列表
- `vibecard_profile_sync` — 链上同步状态

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 开源协议

本项目基于 [MIT](LICENSE) 协议开源。

---

<div align="center">

**Made with 💚 by vibecard Team**

</div>
