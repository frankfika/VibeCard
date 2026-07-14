# VibeCard 上线前测试与优化计划

## 项目概览

VibeCard 是一个 Web3 社交名片 + 搭子发现平台，采用 monorepo 结构：
- **Web 端** (`packages/web`): React 19 + Vite + Tailwind CSS + Wagmi/RainbowKit
- **小程序端** (`packages/miniprogram`): 微信小程序 + 云开发
- **合约端** (`packages/contracts`): Hardhat 3 + Solidity 0.8.20 (4个合约)
- **共享包** (`packages/shared`): 卡片数据、标签、搭子类型

## 当前状态评估 (v1.1, 2026-07-14)

### ✅ 已通过的项
- TypeScript 编译通过 (`tsc --noEmit`)
- Vite 生产构建成功（7.7-8.4s）
- PWA 配置完整（manifest、sw.js、icons）
- CI 配置完整（GitHub Actions：Web + Contract）
- Playwright E2E 测试配置完整 (27/27 通过)
- 主题系统完整（dark/light/system）
- 智能合约编译成功（`hardhat build --force`）
- SIWE 钱包签名验证 (`lib/siwe.ts` + `verified.walletProof`)
- Gemini AI 头像接入 (`lib/genai.ts` + DiceBear 降级)
- 短 URL 服务 (`server.js` + `?id=` hook)
- i18n 一致性（handle `@`、中英文统一、海报主题中英别名）

### ⚠️ 需要关注的问题
1. **依赖清理**: `shadcn` 和 `vaul` 可能未使用（Drawer 为自定义实现）
2. **无 ESLint**: 项目没有 ESLint 配置，缺少代码规范检查
3. **合约地址**: 除 Hardhat 外所有网络都是零地址，未部署到测试网/主网
4. **合约名不一致**: 合约文件名为 `VibeCardRegistry.sol` 但合约名为 `DappCardRegistry`
5. **Hardhat 3 缓存**: 正常 `build` 不触发编译，需要 `--force`
6. **构建警告**: 多个 `/*#__PURE__*/` 注释位置警告（来自 node_modules，不严重但影响日志）
7. **缺少安全扫描**: 未检查依赖漏洞、XSS 防护等
8. **web3 chunk 体积**: 756KB / gzip 237KB，RainbowKit + wagmi + viem 链

### ❌ 阻塞项
- 合约未部署测试网 (Base Sepolia 推荐)

## 执行计划

### Stage 1: 基础修复与配置（Orchestrator 直接处理）
- 添加 ESLint 配置
- 清理未使用依赖
- 修复 Hardhat 3 CI 配置（build --force）

### Stage 2: 并行审查（部署 4 个子代理）
- **代码质量审查员**: 检查 TS strictness、潜在 bug、类型安全、代码规范
- **安全审查员**: 检查依赖漏洞、XSS/CSRF 防护、环境变量安全、输入验证
- **功能测试员**: 运行 Playwright E2E 测试、检查关键页面逻辑、验证功能流程
- **性能优化员**: 分析构建产物、chunk 大小、PWA 优化、资源压缩建议

### Stage 3: 整合验证（Orchestrator 汇总）
- 汇总所有子代理发现的问题
- 执行修复（按优先级排序）
- 重新运行构建和测试验证
- 生成最终测试报告

### Stage 4: 生成报告
- 编写完整的测试报告与优化建议文档
- 标记上线前必须完成的事项

## 技能加载
- 当前阶段无特定技能需要加载（使用原生工具链）

## 文件传播路径
1. 各子代理 → 各自的报告文件（`review-code.md`, `review-security.md`, `review-test.md`, `review-performance.md`）
2. Orchestrator 整合 → `TEST_REPORT.md`
