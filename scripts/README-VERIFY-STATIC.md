# verify-miniprogram-static — 小程序静态编译等价检查

## 背景

`DEVELOPMENT_PLAN.md §4.2 WeChat DevTools And Device Verification` 当前阻塞：
DevTools 在本机未登录（`cli islogin` → `{"login":false}`），无法跑冷编译 + 模拟器真机验证。

在该阻塞期间，owner 一直**手动**跑以下 5 类静态检查作为"compile-equivalent"
替代品（plan §4.2 原文："Verified instead (static compile-equivalent, all pass)"）。
本脚本把 5 类检查固化下来，加密到 GitHub Actions，让回归在 push / PR 时
就暴露出来，而不必等到 owner 重新登录 DevTools。

---

## 覆盖范围（7 项 check）

按 `scripts/verify-miniprogram-static.mjs` 实际执行顺序：

| # | 检查 | 关注 | 失败时排查 |
|---|------|------|----------|
| 1 | `json-parses` | `packages/miniprogram/miniprogram/**/*.json` + `cloudfunctions/**/package.json` 全部能 JSON.parse | 看 stderr JSON 报告里 `errors[].file` |
| 2 | `pages-complete` | `app.json` 里 declared pages（含 `subPackages`）都有 `.js` + `.wxml` + `.json` 三件套 | 补齐缺失文件，或从 `app.json` 移除该 page |
| 3 | `usingComponents-resolve` | 每个 page / component 的 `usingComponents` 引用的组件目录存在并有 `.js + .json + .wxml` 自定义组件三件套 | 路径写错 / 组件三件套缺一 / typo |
| 4 | `node --check` | `miniprogram/**/*.js` + `cloudfunctions/**/index.js` 共 58 个文件全部语法过 | 看 `errors[].detail` 的 stderr 前 3 行 |
| 5 | `custom-tabbar` | 若 `app.json.tabBar.custom === true`，`miniprogram/custom-tab-bar/` 4 个文件必须齐（`index.{js,json,wxml,wxss}`） | 历史上 `custom-tab-bar/` 误放在项目根，DevTools 冷编译会 crash（plan §4.2 已记录） |
| 6 | `cloudfunction-entry` | 每个 `cloudfunctions/*/package.json` 对应的 `index.js` 必须 `exports.main = ...` 或 `module.exports = { main }` | 看缺哪个 cloudfunction 没写 `main` |
| 7 | `cloudfunction-deps` | `cloudfunctions/*/package.json` 声明的依赖里，**非 wx-\* 运行时**必须有本地 `node_modules/`（`wx-server-sdk` 等微信云开发运行时 SDK 由云开发环境注入，本地/CI 永远装不上，自动跳过） | 这是个"未来安全网"——目前所有 cloudfunction 的 deps 只有 `wx-server-sdk`，永远 0 检查；若哪天有人引入 `lodash` 等会立即触发 |

---

## 在 CI 哪里看结果

GitHub Actions workflow：**`.github/workflows/ci.yml` → job `verify-miniprogram-static`**

- 触发：所有 push 到 `main` + 所有 PR 到 `main`（与现有 `web` / `contracts` job 并行）
- 步骤：`checkout` → `setup-node v22` → `npm ci` → `npm run verify:miniprogram:static`
- 退出码：脚本 exit 0/1 直接驱动 step 状态（red CI = 有回归）
- JSON 报告：在 `if: always()` 下作为 artifact 上传，路径 `verify-miniprogram-static.json`
  （含每项 check 的 errors 数组，可直接在 PR 评论里展开分析）

本地对应命令：

```bash
npm run verify:miniprogram:static       # 7 项 check 一起跑
node scripts/verify-miniprogram-static.mjs  # 等价
```

---

## 退出码约定

| 情况 | 退出码 |
|------|-------|
| 全部 7 项 check 通过，0 errors | `0` |
| 任一 check 有 errors | `1` |

输出末尾固定行（方便 grep / CI 解析）：

```
✅ 7/7 checks passed, 0 errors
# 或
❌ 7 checks, N errors (M passed)
```

JSON 报告固定走 **stderr**，stdout 仍是人类可读：
```bash
node scripts/verify-miniprogram-static.mjs >/dev/null 2>report.json
```

---

## 失败时排查流程

1. **看末尾那一行**确定是哪个 check 挂了（7 项里哪一项标 ❌）
2. **看 stdout** 中对应 check 下方的 `· <file>: <message>` 列表 — 每条都指向具体文件
3. **如果需要机器可读细节**：`2>report.json`，读 `results[].errors[].{file,message,detail}`
4. **常见修复模式**：
   - `pages-complete` 报 missing：业务方要么补文件，要么从 `app.json` 移除该 page（如果还在 WIP）
   - `usingComponents-resolve` 报 missing .wxml：补组件三件套
   - `node --check` 报 bad：看 stderr 前 3 行，是 JS 语法错（缺括号、未闭合字符串等）
   - `cloudfunction-entry` 报缺 main：cloudfunction 必须 `exports.main = async (event) => {...}`，是微信云函数约定

---

## 历史 bug 被这条 CI 兜住的例子

plan §4.2 记录的真实 bug：**`custom-tab-bar/` 自 `22440db` 起一直放在项目根**，
但 `project.config.json` 的 `miniprogramRoot: "miniprogram/"` 在用，框架从未
加载它 —— DevTools 里"从未渲染 tab bar"，且冷编译会在 `_getPackageFiles`
里 crash。修法：移到 `miniprogram/custom-tab-bar/`。

本次固化的 check #5 (custom-tabbar) 会捕获任何同类回归（`tabBar.custom=true`
但目录不在 miniprogram 根下）。

---

## §4.2 解锁后这个脚本的定位

> **保留**。不是临时替代品，是 release gate 的一部分。

理由：

1. **真机验证 + 静态检查是互补的，不是替代**
   - DevTools / 真机：抓运行时问题（API 调用、tab 切换、扫码 deep link、网络异常）
   - 静态检查：抓**结构性回归**（漏文件、组件路径错位、syntax error、cloudfunction 入口缺失）
   - 静态检查在 PR 阶段就拦下来，真机验证只在 release / 4.2 owner 验证时跑

2. **plan §4.2 解锁 = 真机验证重新可用**，但**回归保护不能丢**。脚本已经被
   `release:check` 引用（`npm run release:check` 链的最后一段），每次发版都会跑

3. **新增的 `cloudfunction-deps` check 是"未来安全网"** —— 当有人给
   cloudfunctions 引入非 wx-* 依赖时（必须本地装好才能跑 test），CI 立刻
   报警，避免"本地能跑但云上不行"的鬼故事

如果未来 4.2 真机验证被自动化（e.g. miniprogram-automator 接 CI），脚本可
以再扩：增加 `e2e-devtools` check，但目前结构不变。

---

## 相关文件

- `scripts/verify-miniprogram-static.mjs` — 检查脚本本体
- `.github/workflows/ci.yml` — `verify-miniprogram-static` job
- `package.json` — `"verify:miniprogram:static"` script（被 `release:check` 引用）
- `docs/engineering/DEVELOPMENT_PLAN.md §4.2` — 阻塞上下文 + 手动检查清单原文
