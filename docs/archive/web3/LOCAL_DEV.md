# VibeCard 本地 Web3 开发指南（历史能力）

在本地完整跑通 Web3 链上同步、读取、嵌入预览的最小环境。

## 前置要求

- Node.js 18+
- npm 9+

## 1. 启动本地链 + 部署合约

```bash
cd packages/contracts
npm install   # 如未安装
npm run dev
```

`npm run dev` 会：
- 启动 Hardhat 本地节点（RPC: http://127.0.0.1:8545，Chain ID: 31337）
- 使用第一个默认账户部署 `DappCardRegistry`
- 自动把合约地址写回 `packages/web/src/lib/web3/config.ts`

保持该终端运行。

## 2. 启动前端

新开会话：

```bash
cd packages/web
npm install   # 如未安装
npm run dev
```

打开 http://localhost:3000。

## 3. 连接钱包到本地网络

在 MetaMask/Rabby 中添加网络：

| 字段 | 值 |
|------|-----|
| 网络名称 | Hardhat Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| 货币符号 | ETH |

导入测试账户（第一个默认账户）：

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## 4. 配置 IPFS（可选但推荐）

链上只存 IPFS CID。要实际上传/读取内容：

1. 到 https://pinata.cloud/ 注册并创建 JWT。
2. 复制 `packages/web/.env.example` 为 `.env`：

```bash
cp packages/web/.env.example packages/web/.env
```

3. 填入：

```env
VITE_PINATA_JWT=你的_jwt
VITE_WALLETCONNECT_PROJECT_ID=可选，测试本地可留空
```

如果不配置 Pinata，"同步上链"会失败在上传步骤。

**临时绕过方案（本地 Mock IPFS）：** 在 `.env` 里加一行即可不注册 Pinata 跑通流程：

```env
VITE_MOCK_IPFS=true
```

Mock 模式下内容存在浏览器 `localStorage`，CID 是 `mock-` 前缀的确定性哈希。适合本地开发/测试，**不要用于生产**。

## 5. 测试链上同步

1. 创建名片。
2. 点击名片页上的 **同步** 按钮。
3. 确认 MetaMask 弹出的交易。
4. 成功后状态变为 **已同步**，并显示 IPFS hash 前缀。
5. 用 **恢复** 按钮可从链上重新加载名片。

## 6. 测试嵌入页面

同步后，复制名片链接或 CID，访问：

```
http://localhost:3000/?address=你的钱包地址
# 或
http://localhost:3000/?cid=你的IPFS_CID
```

## 7. 测试 widget.js 嵌入

在任意 HTML 页面里插入：

```html
<script
  src="http://localhost:3000/widget.js"
  data-address="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  data-chain-id="31337"
  data-theme="light"
  data-locale="zh"></script>
```

页面会渲染一张可点击的小卡片，点击后弹出 iframe 名片弹窗。

## 本地测试账户

Hardhat 提供 10 个预设账户，余额均为 10000 ETH：

| 地址 | 私钥 |
|------|------|
| 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 |
| 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d |

## 部署到测试网

在 `packages/contracts` 下创建 `.env`：

```env
PRIVATE_KEY=你的私钥（不要带 0x 前缀）
```

然后：

```bash
npm run deploy:baseSepolia   # 推荐，Gas 低
# 或
npm run deploy:sepolia
npm run deploy:arbitrumSepolia
npm run deploy:amoy
```

部署成功后手动把地址填回 `packages/web/src/lib/web3/config.ts` 对应链的 `CONTRACT_ADDRESS`。

## 常见问题

**Q: 前端提示"网络未部署"**
A: 检查 `packages/web/src/lib/web3/config.ts` 中对应链的 `CONTRACT_ADDRESS` 是否已填，且本地节点是否运行。

**Q: 同步时提示"无法从 IPFS 读取"**
A: 链上 CID 是真实的，但 IPFS 网关可能暂时不可用。多刷新几次，或换 gateway。

**Q: WalletConnect 未配置**
A: 本地 Hardhat 网络使用浏览器注入钱包（MetaMask）即可，不需要 WalletConnect Project ID。
