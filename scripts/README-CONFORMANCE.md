# VibeCard Real Conformance Runner — owner 文档

> 这是一份「scripts/run-real-conformance.mjs」的使用说明，目的是把
> `docs/engineering/DEVELOPMENT_PLAN.md` 里 4 个 `Status: [~]` 任务从「待复核」
> 推进到 `Status: [x]`。
>
> - §1.2 Add AI Provider Boundary
> - §1.3 Implement Owner Conversation
> - §1.4 Generate Or Update Card From Memory
> - §4.3 Prepare Demo Data
>
> 脚本**不会**自动改 DEVELOPMENT_PLAN.md —— owner 看完报告后亲手改。

---

## TL;DR（owner 三步上手）

```bash
# 1) 准备 conformance.env
cp scripts/conformance.env.example scripts/conformance.env
$EDITOR scripts/conformance.env      # 填入 AI_API_BASE / AI_API_KEY / AI_MODEL

# 2) 干跑一遍，确认脚本能跑通当前环境
node scripts/run-real-conformance.mjs --dry-run

# 3) 实跑
node scripts/run-real-conformance.mjs --strict
tail .workbuddy/conformance-report-$(date +%Y-%m-%d).md
#   → 如果 4 个 task readiness 都 `[x]`，逐个手工把 DEVELOPMENT_PLAN.md 的
#     `Status: [~]` 改成 `Status: [x]`，并补一行完成日期备注。
```

跑完之后，每个 `[~]` → `[x]` 的具体命令（任选其一）：

```bash
node scripts/run-real-conformance.mjs --only=1.2 --strict
node scripts/run-real-conformance.mjs --only=1.3 --strict
node scripts/run-real-conformance.mjs --only=1.4 --strict
node scripts/run-real-conformance.mjs --only=4.3 --strict
```

---

## 1. 设计：为什么是这个脚本

| 维度 | 真实 conformance 路径 | 脚本怎么处理 |
|------|----------------------|--------------|
| AI provider | owner 配真实 HTTP 端点（OpenAI 兼容 / Ollama / vLLM / DeepSeek …） | T1.2 / T1.4 / T4.3 cases 直接 `createHttpProvider({baseUrl, apiKey, model})` 打真实端点；缺 key 时退化为「mock parity」 —— 起本地 OpenAI-compatible stub server（模型是 mock provider）保证 schema / retry / typed error 链路 100% real。 |
| Mini Program 云函数 | owner 在 WeChat DevTools 扫码登录，调云函数 | harness 在 Node 里 `Module._load` hook 住 `wx-server-sdk`，注入 stub database；agent/index.js 与 memory/index.js 都是云函数的真入口（不复制实现）。 |
| 真实 owner OPENID | `cloud.getWXContext().OPENID` 来自 wx.login | harness 用 `setStubOpenid()`；配 `WX_OPENID_OWNER` 时用真实 openid，否则用 `owner-1` 跑通整条路径。 |
| 数据集合 / 索引 | DevTools 云开发后台 / `LAUNCH_KIT.md` 第 4 节 | **owner 必须亲手做**（详见 §4）。本脚本的 harness 用 in-memory Map，不依赖任何真实集合。 |

### 「mock-parity 退化」不等于「mock 测试」

mock-parity 是 **同一个 createHttpProvider** 调用一个 *内嵌* OpenAI-compatible stub server，
模型依然是 mock provider —— 这保证了 HTTP 请求包（`response_format: json_object`、Bearer header、
`/v1/chat/completions` 路径）都被真实走了一遍。  
**不是说**「直接调 mock provider」，那样会跳过 HTTP boundary 的合同验证。

owner 配上真 key 后，case 行为变化：

| Provider | 1.2 / 1.4 / 4.3 cases 跑什么 |
|----------|------------------------------|
| 缺 key   | createHttpProvider → 本地 stub（包装 mock provider）；验 HTTP envelope / schema / retry |
| 配 key   | createHttpProvider → 真实 LLM；验 schema 校验 + 模型能在「双 retry 后返回 typed error」边界内给出合规输出 |

---

## 2. conformance.env 字段说明

`scripts/conformance.env.example` 是模板，**复制为 `scripts/conformance.env`** 再填：

| 字段 | 必填 | 说明 |
|------|------|------|
| `AI_API_BASE`   | T1.2 / T1.4 / T4.3 real 模式 | OpenAI-compatible 端点，如 `https://api.example.com` / `http://localhost:11434/v1` / `https://ark.cn-beijing.volces.com` |
| `AI_API_KEY`    | 同上 | 直接放明文即可。脚本**不会**把它写进日志或报告。 |
| `AI_MODEL`      | 同上 | 端点服务的模型名。 |
| `AI_PROVIDER=mock` | 选填 | 强制定向 mock；优先级最高，**即使配了 key 也走 mock**。 |
| `CLOUD_ENV_ID`  | 仅当想自动 `deploy/deploy-cloud.js` | 形如 `prod-xxx` 的微信云开发环境 ID。 |
| `MP_PRIVATE_KEY` | 同上 | 微信小程序代码上传密钥 `.key` 文件的绝对路径。 |
| `WX_OPENID_OWNER`  | 选填 | harness 用的 owner OPENID；不填则用合成 `owner-1`。 |
| `WX_OPENID_VISITOR`| 选填 | 同上，visitor。 |

> ⚠️ **不要** commit `scripts/conformance.env`（任何 AI key 都是敏感数据）。
> 建议加进 `.gitignore`。

`.gitignore` 一行就够：

```
scripts/conformance.env
```

---

## 3. 输出报告

报告写到：`.workbuddy/conformance-report-YYYY-MM-DD.md`（**追加**模式：每天多个跑次会按时间顺序拼接）。

### 报告分四块

1. **Task readiness**（表格，4 行）— 任务是否准备好推进 `[x]`。
2. **Cases** — 每个 case 一段，含 `status / evidence / preconditions / 排查提示`。
3. **How to reproduce** — 5 个常用命令。
4. **Run banner** — 每次跑追加一段。

报告里 `evidence` 字段写了：
- mock-parity 走完实际路径（reply 长度 / draft 字段数 / 强 / 弱 recommendation 值）
- real 模式记录 provider / model / 耗时

`hint` 字段对应每个 case 的失败原因与建议修复位置（参考 cloudfunctions/agent/lib/ 与 miniprogram pages 文件路径）。

---

## 4. 与真实部署 / DevTools 的关系

本脚本覆盖的是 **4 个任务的 acceptance 中能在脚本里复现的全部项**。

但 **owner 必须亲手做** 的步骤（脚本无法替代）：

1. 在微信开发者工具里打开 `packages/miniprogram`，开通云开发、创建集合 + 索引。
   - 详见 [LAUNCH_KIT.md](../../docs/launch/LAUNCH_KIT.md)（如果存在）或 DEVELOPMENT_PLAN 中 §4.2。
2. 在云开发控制台 → 云函数 → `agent` 配置环境变量 `AI_API_BASE / AI_API_KEY / AI_MODEL`。
3. 在 DevTools 中编译一次 Mini Program，进入「我的 Vibe」页面扫码、确认走真实链路。
4. **手动**打开请求页、处理「王拓」这条弱请求，确认 UI 出现 "我还判断不好，信息不太够。" 文案。
5. 在 `docs/engineering/DEVELOPMENT_PLAN.md` 把 4 个任务 `Status: [~]` → `Status: [x]`，并在对应 Completion 段补完成日期。

> 脚本的 `pass` **不等于**「可以改 Status 了」。建议流程：
> 1. `node run-real-conformance.mjs --strict` → 12/12 全 PASS
> 2. 在 DevTools 里再走一遍 owner 三步（上面 1-4）
> 3. 看 `conformance-report.md` 的 4 个 `[x]` 推荐 + 三步手感都 ok → 改 DEVELOPMENT_PLAN.md

---

## 5. 失败排查（每个 case 的可能原因）

> 把 `node scripts/run-real-conformance.mjs --only=<task>` 跑一次的输出对到下面。

### T1.2 / §1.2

- **T1.2-R1 FAIL**
  - real：`AI_API_BASE` 协议不对（http 而非 https）；或模型不支持 `response_format: json_object`。改 env。
  - mock-parity：`lib/agent.js` 或 `lib/providers.js` 不一致。重跑 `node --test packages/miniprogram/cloudfunctions/agent/test/agent.test.js`。
- **T1.2-R2 FAIL**：`runOwnerAgent` retry 次数不对或 errors 路径分支改了。看 `packages/miniprogram/cloudfunctions/agent/lib/agent.js#callAndValidate`。
- **T1.2-R3 FAIL**：
  - `getProvider` 优先级被改。看 `lib/providers.js#getProvider` 的 `AI_PROVIDER === 'mock'` 分支。
  - `agent/index.js` catch 没返回 `typedError`：检查 `catch (error) {... return typedError('model_unavailable', …)}`。
- **T1.2-R4 FAIL**：`buildMemoryContext` 输出格式变了（缺少 `${kind}/${visibility}` 标签）。

### T1.3 / §1.3

- **T1.3-R1 FAIL**：先看 mock provider 是否能对 ownerMessage 给出有 proposal 的输出；
  再确认 `memory/index.js#createMemoryProposal` + `confirmMemory` 路径。
- **T1.3-R2 FAIL**：
  - vibe.js 的 fallback 文案被改 → 按 AI_BEHAVIOR.md §4 修文案。
  - 或 agent/index.js 的 catch 走了别处而非 `typedError('model_unavailable', …)`。
- **T1.3-R3 FAIL**：`persistMessage`（vibe.js）catch 不再 swallow，看 `pages/vibe/vibe.js:640` 附近的 `console.warn` 仍原样。

### T1.4 / §1.4

- **T1.4-R1 FAIL**：
  - `validateCardDraft` 不再拦截联系方式 → 看 `lib/schema.js#validateCardDraft`。
  - 真实模型输出空 → 改 system prompt（`lib/agent.js#CARD_DRAFT_SYSTEM_PROMPT`）。
- **T1.4-R2 FAIL**：`runCardDraft` filter `(m.status === 'confirmed')` 被改坏。

### T4.3 / §4.3

- **T4.3-R1 FAIL**：`packages/miniprogram/miniprogram/data/vibe-fixtures.js` 改了字段；同步 `packages/shared/fixtures/vibe.ts` 后重新编译到 JS。
- **T4.3-R2 FAIL**：
  - 弱请求的 uncertainty 文本漂了。看 `lib/agent.js#mockConnectionSummary` 的 strong 阈值（`reason.trim().length >= 20`）。
  - 或者 system prompt 里 `AI_BEHAVIOR §7` 旁的合同被改。
- **T4.3-R3 FAIL**：`vibe-mock-story.spec.ts` 的"callback 时刻"失效 → 找一个最近的 fixture 改成 `status: 'confirmed'` 的 `current`。

---

## 6. 命令清单

```bash
# 干跑
node scripts/run-real-conformance.mjs --dry-run

# 全跑
node scripts/run-real-conformance.mjs

# 单任务
node scripts/run-real-conformance.mjs --only=1.2
node scripts/run-real-conformance.mjs --only=1.3
node scripts/run-real-conformance.mjs --only=1.4
node scripts/run-real-conformance.mjs --only=4.3

# 组合
node scripts/run-real-conformance.mjs --only=1.2,4.3

# 严格模式（任一失败 exit 2）
node scripts/run-real-conformance.mjs --strict

# 跳过自动 deploy 步骤
node scripts/run-real-conformance.mjs --skip-deploy

# 真实跑（已配 env）
node scripts/run-real-conformance.mjs --only=1.2 --strict --skip-deploy
```

退出码：

| 码 | 含义 |
|----|------|
| 0  | 全部 pass / 仅 skip |
| 2  | `--strict` 下有 fail |
| 137 | runner 自己 crash（看 traceback） |

---

## 7. owner 最终复盘：把 `[~]` 改成 `[x]` 的具体动作

```bash
# 拿到今天的报告
TODAY=$(date +%Y-%m-%d)
REPORT=".workbuddy/conformance-report-${TODAY}.md"

# 1. 看 Task readiness 表 — 4 行都 [x] 推荐 才能继续
grep -A 5 '^## Task readiness' "$REPORT"

# 2. 在 DEVELOPMENT_PLAN.md 改 4 行的 Status（用 sed 或手动）
$EDITOR docs/engineering/DEVELOPMENT_PLAN.md
# 找到：
#   ## 1.2 Add AI Provider Boundary        ## Status: `[~]`
#   ## 1.3 Implement Owner Conversation    ## Status: `[~]`
#   ## 1.4 Generate Or Update Card From    ## Status: `[~]`
#   ## 4.3 Prepare Demo Data               ## Status: `[~]`
# 把 Status 行的 `[~]` → `[x]`，并在 Completion 段第一行加日期注释：
#   - 2026-MM-DD, on `main`. Conformance suite run via scripts/run-real-conformance.mjs
#     returned N/N pass against a configured real provider.

# 3. commit
git add docs/engineering/DEVELOPMENT_PLAN.md scripts/run-real-conformance.mjs \
        scripts/conformance.env.example scripts/README-CONFORMANCE.md
git commit -m "§1.2 / §1.3 / §1.4 / §4.3 — real conformance passes against $AI_MODEL"
```

> **不要 commit** `scripts/conformance.env`（含 key）。
> 也不要 commit `.workbuddy/conformance-report-*.md`（可能含触发 trace）。
