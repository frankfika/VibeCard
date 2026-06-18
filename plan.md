# VibeCard 优化计划

> 当前优先级：全力把 Web 端改造成可运行的 Web3 项目，小程序暂时忽略。
> 重要提醒：下次继续时，先去 https://pinata.cloud/ 注册并填入 `VITE_PINATA_JWT`，以打通真实 IPFS 上链/嵌入预览。

## 项目现状诊断

### 小程序端（暂时忽略）
- **架构**: 3 个主 Tab（名片/动态/更多）+ 2 个二级页面（发现搭子/互动卡片）+ 1 个发布页
- **问题**: 
  1. navbar 使用已废弃的 `wx.getSystemInfoSync()`
  2. thread-publish 页面缺少 wxss 样式
  3. 各页面缺少空状态处理
  4. 动画/微交互较少
  5. 部分返回逻辑需完善

### Web 端
- **架构**: React + Vite + Tailwind + shadcn/ui，3 个主 Tab
- **当前 Web3 化进度**:
  1. ✅ 钱包连接（RainbowKit + Wagmi）
  2. ✅ ENS 解析
  3. ✅ 本地 Hardhat 网络 + 合约部署脚本
  4. ✅ 链上同步/恢复名片 + Toast 反馈
  5. ✅ Mock IPFS 模式（无需 Pinata 即可本地测试）
  6. ✅ 可嵌入名片页（`?address=` / `?cid=`）
  7. ✅ widget.js 嵌入脚本
  8. ✅ 钱包签名验证（SIWE 简化版）
  9. ✅ PWA（manifest / service worker / icons）
  10. ✅ 深色模式切换与主题持久化
  11. ✅ 完整链上同步 E2E 测试（创建 → Mock IPFS → publish → 读取）
  12. ✅ E2E 测试 38 条全部通过
  13. ✅ GitHub Actions CI 流水线

## 待完成（Web3 核心）

### 下一步必须
- [ ] **注册 Pinata 并填入 `VITE_PINATA_JWT`**，跑通真实 IPFS 上链 → 嵌入预览闭环
- [ ] 部署合约到 Base Sepolia/Sepolia 测试网，更新 `CONTRACT_ADDRESS`
- [ ] 用真实网络测试一次完整同步/恢复/嵌入

### 近期优化
- [ ] `/embed/:address` 路由（比现在 `?address=` 更利于分享）
- [ ] 服务端渲染 OG/Twitter Card（解决 SPA 社交预览问题）
- [ ] 支持更多钱包登录方式（WalletConnect、Coinbase Wallet）
- [ ] 链上声誉 NFT / SBT 雏形
- [ ] 动态/活动也支持链上同步

### 中长期
- [ ] Telegram Mini App 适配
- [ ] 插件化 SDK（widget.js 完善 + npm 包）
- [ ] 多链 ENS/Lens 身份聚合
- [ ] 去中心化存储冗余（IPFS + Arweave 备份）

## 执行阶段（旧版，供参考）

### Stage 1: 基础修复（小程序）
- [ ] 修复 navbar 组件（wx.getSystemInfoSync → wx.getWindowInfo）
- [ ] 添加 thread-publish.wxss
- [ ] 检查并修复所有页面的 json 配置
- [ ] 完善 nav.js 的返回兜底逻辑

### Stage 2: 功能完善（小程序）
- [ ] 完善 discover 页面（空状态、加载状态、优化创建表单）
- [ ] 完善 games 页面（抽卡动画、空状态、收藏展示）
- [ ] 完善 threads 页面（空状态、图片预览优化）
- [ ] 完善 card 页面（分享优化、编辑体验）
- [ ] 完善 more 页面（添加更多入口、统计信息）

### Stage 3: 审美优化（小程序）
- [ ] 添加页面进入动画
- [ ] 优化卡片阴影和圆角
- [ ] 优化按钮交互反馈
- [ ] 统一空状态设计
- [ ] 优化 tabBar 图标（使用更精致的 emoji 或图标）

### Stage 4: Web 端同步优化
- [ ] 修复 ThreadsPage 动画库引用
- [ ] 优化 Web 端空状态
- [ ] 确保功能与小程序对齐

### Stage 5: 验证测试
- [ ] 检查所有页面可正常访问
- [ ] 检查所有交互流程
- [ ] 检查样式一致性
