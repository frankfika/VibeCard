# VibeCard Web3 v1 部署指南（历史能力）

> 本指南覆盖旧 Web3 版本从合约部署到前端上线的完整流程。对应检查清单见 [`../TEST_REPORT_WEB3_V1.md`](../TEST_REPORT_WEB3_V1.md)。

---

## 目录

- [前置准备](#前置准备)
- [1. 环境变量配置](#1-环境变量配置)
- [2. 获取测试网 ETH](#2-获取测试网-eth)
- [3. 部署智能合约](#3-部署智能合约)
- [4. 部署生态系统合约（可选）](#4-部署生态系统合约可选)
- [5. 更新前端配置](#5-更新前端配置)
- [6. 构建生产版本](#6-构建生产版本)
- [7. 部署到 Vercel](#7-部署到-vercel)
- [8. 部署后验证](#8-部署后验证)
- [9. 常见问题](#9-常见问题)
- [附录：网络配置参考](#附录网络配置参考)

---

## 前置准备

- Node.js 20+ (LTS)
- 一个以太坊钱包（MetaMask 推荐）
- 测试网 ETH（见下文水龙头）
- 以下服务账号：
  - [Pinata](https://pinata.cloud/) — IPFS 存储
  - [WalletConnect Cloud](https://cloud.walletconnect.com/) — 钱包连接
  - [Alchemy](https://alchemy.com/) — RPC 节点（可选，推荐）
  - [Vercel](https://vercel.com/) — 前端部署（推荐）

---

## 1. 环境变量配置

### Web 端

```bash
cd packages/web
cp .env.example .env
```

编辑 `.env`：

```bash
# === 必需 ===

# Pinata IPFS JWT（链上同步时必需，用于上传内容到 IPFS）
# 注册 https://pinata.cloud/ → API Keys → New Key → 复制 JWT
VITE_PINATA_JWT=your_pinata_jwt_here

# WalletConnect Project ID（钱包连接、邮箱/社交登录必需）
# 注册 https://cloud.walletconnect.com/ → New Project → 复制 Project ID
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id_here

# === 可选 ===

# Alchemy RPC 加速（提升链上读取速度）
# VITE_ALCHEMY_KEY=your_alchemy_key
```

> ⚠️ **`.env` 文件已加入 `.gitignore`，不要提交到 Git。**

### 合约端

```bash
cd packages/contracts
cp .env.example .env
```

编辑 `.env`：

```bash
# 部署私钥（仅用于测试网，不要用在主网！）
PRIVATE_KEY=0x你的私钥（去掉0x前缀）

# RPC 节点（可选，不填则使用默认公共节点）
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/你的alchemy-key
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/你的alchemy-key
```

> ⚠️ **绝对不要提交 `.env` 文件！合约端 `.env` 同样已加入 `.gitignore`。**

---

## 2. 获取测试网 ETH

部署合约需要支付 Gas 费。推荐按以下优先级选择网络：

| 优先级 | 网络 | Chain ID | 推荐原因 | 水龙头 |
|--------|------|----------|----------|--------|
| ⭐ 首选 | Base Sepolia | 84532 | Gas 极低，速度快，Coinbase 支持 | [Coinbase Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet) |
| 次选 | Ethereum Sepolia | 11155111 | 最标准，生态最成熟 | [Alchemy Faucet](https://sepoliafaucet.com/) |
| 备选 | Arbitrum Sepolia | 421614 | L2，Gas 低 | [QuickNode Faucet](https://faucet.quicknode.com/arbitrum/sepolia) |
| 备选 | Polygon Amoy | 80002 | 国内友好，速度快 | [Polygon Faucet](https://faucet.polygon.technology/) |

### 领取步骤（以 Base Sepolia 为例）

1. 打开 MetaMask，添加 Base Sepolia 网络：
   - Network Name: Base Sepolia
   - RPC URL: `https://sepolia.base.org`
   - Chain ID: `84532`
   - Currency Symbol: ETH
   - Block Explorer: `https://sepolia.basescan.org`

2. 访问 [Coinbase Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)
3. 粘贴你的钱包地址，领取 0.1 ETH（足够多次部署）

---

## 3. 部署智能合约

### 基础合约（VibeCardRegistry）

```bash
cd packages/contracts

# 1. 安装依赖
npm install

# 2. 确认环境变量已设置
export PRIVATE_KEY=0x你的私钥

# 3. 部署到 Base Sepolia（推荐）
npm run deploy:baseSepolia

# 或部署到 Ethereum Sepolia
# npm run deploy:sepolia

# 或部署到 Arbitrum Sepolia
# npm run deploy:arbitrumSepolia

# 或部署到 Polygon Amoy
# npm run deploy:amoy
```

### 部署成功后的输出

```
Deploying contracts with the account: 0x...
Account balance: 0.1 ETH
DappCardRegistry deployed to: 0x...
Network: base-sepolia
Chain ID: 84532

✅ Auto-updated CONTRACT_ADDRESS for chain 84532 in web config.
✅ Auto-updated widget-config.json for chain 84532.
```

### 部署脚本做了什么？

部署脚本会自动完成以下操作：

1. 编译并部署 `VibeCardRegistry` 合约
2. 保存部署记录到 `packages/contracts/deployments/`
3. 尝试自动更新 `packages/web/src/lib/web3/config.ts` 中的 `CONTRACT_ADDRESS`
4. 尝试自动更新 `packages/web/public/widget-config.json`

如果自动更新失败，请手动修改：

```typescript
// packages/web/src/lib/web3/config.ts
export const CONTRACT_ADDRESS: Record<number, `0x${string}`> = {
  [hardhat.id]: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  [baseSepolia.id]: '0x你部署的地址',  // ← 替换这里
  [sepolia.id]: '0x0000000000000000000000000000000000000000',  // 未部署
  // ... 其他网络
};
```

---

## 4. 部署生态系统合约（可选）

VibeCard 还包含一套生态系统合约（VibePoints、VibeIdentity、VibeSocial），用于积分系统和身份管理。如果不需要这些功能，可以跳过此步骤。

```bash
cd packages/contracts

# 部署生态系统合约到 Base Sepolia
npx hardhat run scripts/deploy-ecosystem.js --network baseSepolia

# 部署成功后，自动更新 packages/web/src/lib/web3/ecosystem.ts
```

---

## 5. 更新前端配置

确认以下配置已正确更新：

### 合约地址

```bash
# 检查 config.ts 中的合约地址
grep "CONTRACT_ADDRESS" packages/web/src/lib/web3/config.ts
```

确保目标网络的地址不再是 `0x000...0000`。

### 生态系统地址（如已部署）

```bash
# 检查 ecosystem.ts
cat packages/web/src/lib/web3/ecosystem.ts
```

### Widget 配置

```bash
# 检查 widget-config.json
cat packages/web/public/widget-config.json
```

---

## 6. 构建生产版本

```bash
cd packages/web

# 确认环境变量已设置
# cat .env

# 构建
npm run build
```

构建产物位于 `packages/web/dist/`：

```
dist/
├── index.html              # 入口页面
├── manifest.json           # PWA 配置
├── sw.js                   # Service Worker（离线缓存）
├── widget.js               # 外部嵌入脚本
├── widget-config.json      # Widget 配置
├── widget-demo.html        # Widget 演示
├── icon-192.png            # PWA 图标
├── icon-512.png            # PWA 图标
├── apple-touch-icon.png    # iOS 图标
└── assets/                 # JS/CSS 分块
    ├── index-*.js          # 主应用逻辑
    ├── vendor-*.js         # React + motion
    ├── web3-*.js           # wagmi + viem + RainbowKit
    └── index-*.css         # 所有样式
```

### 构建优化说明

- 所有 JS 和 CSS 已自动 gzip 和 brotli 压缩
- 代码按功能拆分：`vendor`（React）、`web3`（钱包）、`utils`（工具）
- 懒加载页面：`ThreadsPage`、`MorePage`、`EditProfile`、`ShareDrawer`
- 语言包（18 种）已按需分割，不影响首屏加载

---

## 7. 部署到 Vercel

### 方式一：Vercel CLI（推荐）

```bash
# 安装 CLI
npm i -g vercel

# 登录
vercel login

# 从 web 目录部署
cd packages/web
vercel --prod

# 首次部署会提示选择项目，按提示完成
# 后续部署会自动关联
```

### 方式二：Vercel Dashboard（手动）

1. 访问 [vercel.com](https://vercel.com/)，导入 GitHub 仓库
2. 设置：
   - Framework Preset: `Vite`
   - Root Directory: `packages/web`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. 在 Environment Variables 中设置：
   - `VITE_PINATA_JWT`
   - `VITE_WALLETCONNECT_PROJECT_ID`
   - `VITE_ALCHEMY_KEY`（可选）
4. 点击 Deploy

### 方式三：GitHub Actions 自动部署

在 GitHub 仓库 Settings → Secrets → Actions 中设置：
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

创建 Git Tag 自动触发部署：

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

---

## 8. 部署后验证

部署完成后，逐项验证以下功能：

### 基础功能

- [ ] 主站正常加载，无控制台报错
- [ ] 三个标签页（名片、动态、更多）切换正常
- [ ] 移动端适配正常（iOS Safari、Android Chrome）
- [ ] 主题切换（system → light → dark）正常且持久化

### Web3 功能

- [ ] 钱包连接成功（MetaMask / Rainbow / WalletConnect）
- [ ] 创建名片并保存到 localStorage
- [ ] 同步名片到链上（等待交易确认）
- [ ] 从链上恢复名片（切换钱包或清除缓存后）
- [ ] 创建活动并同步到链上
- [ ] 卡牌游戏同步到链上

### 嵌入功能

- [ ] 访问 `https://你的域名/?address=0x某个地址`，显示链上名片
- [ ] 访问 `https://你的域名/?cid=某个IPFS哈希`，显示 IPFS 名片
- [ ] Widget 嵌入代码正常工作（`widget.js` + `widget-config.json`）

### PWA 功能

- [ ] 安装到主屏幕（Add to Home Screen）
- [ ] 离线模式下刷新页面能正常显示（Service Worker 缓存）
- [ ] 离线时链上同步按钮显示禁用状态

### 社交分享

- [ ] 生成名片图片（iOS 长按保存 / Android 下载）
- [ ] 生成二维码，微信扫码可查看
- [ ] 复制链接分享到 Twitter/X、Telegram
- [ ] iframe 嵌入代码可复制粘贴到博客
- [ ] JS Widget 脚本嵌入可正常工作

### IM 浏览器

- [ ] 微信内置浏览器打开时显示提示横幅
- [ ] Telegram 内置浏览器打开时显示提示横幅
- [ ] 提示横幅中的"复制链接"和"外部打开"按钮正常

---

## 9. 常见问题

### Q: 部署失败 "Account has zero balance"

> 确保：
> 1. 私钥对应的地址正确
> 2. 在目标网络的水龙头领取了测试网 ETH
> 3. MetaMask 中切换到正确的网络（如 Base Sepolia）
> 4. 重新检查 `PRIVATE_KEY` 环境变量是否正确设置

### Q: 钱包连接报错 "Project ID is missing"

> 1. 确认 `.env` 中 `VITE_WALLETCONNECT_PROJECT_ID` 已设置
> 2. 确认项目 ID 在 [WalletConnect Cloud](https://cloud.walletconnect.com/) 中有效
> 3. 重新构建：`npm run build`
> 4. 如果仍然报错，检查浏览器控制台是否有更详细的错误信息

### Q: 同步到链上失败 "IPFS hash required"

> 1. 确认 `.env` 中 `VITE_PINATA_JWT` 已设置
> 2. 检查 Pinata 账户是否有足够的存储配额
> 3. 临时方案：设置 `VITE_MOCK_IPFS=true` 使用本地 Mock 模式（不实际上链，仅本地测试）
> 4. 检查 Pinata 网络连接是否被防火墙阻止

### Q: 构建产物过大？

> 当前体积分析：
> - `web3` chunk: 756KB (gzip 237KB) — wagmi + viem + RainbowKit
> - `metamask-sdk`: 558KB (gzip 171KB) — MetaMask SDK
> - 18 个语言包: 各 50-100KB — RainbowKit 国际化
>
> 优化建议：
> 1. 配置 RainbowKit 的 `locale` 只加载中文和英文
> 2. 使用 `vite-plugin-bundle-analyzer` 分析具体依赖
> 3. 考虑使用 `vite-plugin-purge-icons` 移除未使用的图标
> 4. 首屏关键资源约 350KB gzip，在当前标准下可接受

### Q: 合约已部署但前端仍显示 "网络未部署"

> 1. 检查 `packages/web/src/lib/web3/config.ts` 中 `CONTRACT_ADDRESS` 是否已更新
> 2. 检查 `chainNames` 和 `getRpcUrl` 是否包含目标网络的配置
> 3. 确认 MetaMask 连接到正确的网络
> 4. 清除浏览器缓存和 localStorage，重新加载

### Q: 如何同时部署到多个测试网？

> 依次执行每个网络的部署命令：
> ```bash
> npm run deploy:baseSepolia
> npm run deploy:sepolia
> npm run deploy:arbitrumSepolia
> ```
> 每次部署会自动追加到 `CONTRACT_ADDRESS` 中，不会覆盖已有地址。

---

## 附录：网络配置参考

### 已配置网络

| 网络 | Chain ID | 默认 RPC | 合约地址（Hardhat） |
|------|----------|----------|---------------------|
| Hardhat Local | 31337 | `http://127.0.0.1:8545` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Ethereum Sepolia | 11155111 | `https://rpc.sepolia.org` | 待部署 |
| Base Sepolia | 84532 | `https://sepolia.base.org` | 待部署 |
| Arbitrum Sepolia | 421614 | `https://sepolia-rollup.arbitrum.io/rpc` | 待部署 |
| Polygon Amoy | 80002 | `https://rpc-amoy.polygon.technology` | 待部署 |
| Ethereum Mainnet | 1 | `https://ethereum.publicnode.com` | 待部署 |
| Base Mainnet | 8453 | `https://mainnet.base.org` | 待部署 |
| Arbitrum Mainnet | 42161 | `https://arb1.arbitrum.io/rpc` | 待部署 |
| Polygon Mainnet | 137 | `https://polygon-rpc.com` | 待部署 |

### Alchemy RPC 格式（如有 API Key）

| 网络 | Alchemy RPC URL |
|------|-----------------|
| Ethereum Sepolia | `https://eth-sepolia.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Arbitrum Sepolia | `https://arb-sepolia.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Polygon Amoy | `https://polygon-amoy.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Ethereum Mainnet | `https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Base Mainnet | `https://base-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Arbitrum Mainnet | `https://arb-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}` |
| Polygon Mainnet | `https://polygon-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}` |

---

*文档版本：v1.0 | 最后更新：2026-06-19*
