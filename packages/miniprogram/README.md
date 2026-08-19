# VibeCard Mini Program

WeChat Mini Program client for VibeCard — a living AI namecard.

## Project Layout

```
miniprogram/                # Mini Program source (miniprogramRoot)
  app.js / app.json / app.wxss
  pages/
    card/                   # 主人名片 / 访客分享视图
    vibe/                   # 主人与私有 Vibe 对话
    requests/               # 连接请求 inbox
    visitor-chat/           # 访客与主人 AI 分身对话
    legacy/                 # 已下线的历史页面（分包加载）
      threads/ more/ discover/ games/ thread-publish/
  utils/
    cloud.js                # 云函数调用（区分幂等重试）
    subscribe.js            # 订阅消息授权
    track.js                # 本地埋点层
    store.js nav.js auth.js now.js ...
  data/                     # fixture 演示数据（云不可用时回退）
  custom-tab-bar/           # 自定义 TabBar
cloudfunctions/             # 云函数（cloudfunctionRoot）
  agent/ card/ memory/ now/ requests/ user/ login/
  content-check/ report/
tests/                      # node 测试（page smoke + cloudfunction 单测）
```

## Setup

1. Install [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) (stable).
2. Open this directory (`packages/miniprogram`) in DevTools.
3. Log in with the WeChat account bound to AppID `wxa79d41c8255ff90d`.
4. DevTools will detect `miniprogram/` and `cloudfunctions/` automatically.

## Validation

From the repository root:

```bash
npm run lint
npm run build
```

Mini Program smoke tests (no DevTools needed):

```bash
cd packages/miniprogram
node --test tests/*.test.js
```

Per-cloudfunction unit tests:

```bash
cd packages/miniprogram/cloudfunctions/<fn>
npm test
```

Full DevTools + device checklist: see `docs/engineering/DEVELOPMENT_PLAN.md` §4.2.

---

## 上线前检查清单 (Pre-Launch Checklist)

> 目标：一次提审通过 + 上线后获客链路全部通畅。

### A. 微信公众平台配置（mp.weixin.qq.com）

- [ ] **AppID 已认证**：企业/个人主体认证完成，类目与「AI / 社交」匹配。
- [ ] **服务器域名白名单**（开发管理 → 开发设置 → 服务器域名）：
  - `request 合法域名`：所有 HTTPS API（当前云开发走 `*.tcb.qcloud.la`，自动放行；自建后端需手动加）
  - `uploadFile / downloadFile`：如有文件上传
  - `socket`：如有 WebSocket
- [ ] **隐私协议**（设置 → 服务内容声明 → 用户隐私保护指引）：
  - 填写收集的信息（头像、昵称、聊天内容用于记忆、剪贴板用于分享）
  - 上线前必须填写并通过审核，否则 `__usePrivacyCheck__` 弹窗会卡死
- [ ] **订阅消息模板**（功能 → 订阅消息）：
  - 申请并发布两个模板，把真实 `tmplId` 填入 `miniprogram/utils/subscribe.js` 的 `TMPL`：
    - `OWNER_NEW_REQUEST`：主人收到新连接请求
    - `VISITOR_REQUEST_ACCEPTED`：访客收到请求被通过
- [ ] **云开发环境**（如使用）：开通、绑定、上传所有 `cloudfunctions/`、创建数据库集合（`memories` / `conversations` / `requests` / `now_items` / `users` / `visitor_activity`）和所需索引。

### B. 代码与配置

- [ ] `project.config.json` 的 `appid` 是正式 AppID（不是测试号）。
- [ ] `app.json` 的 `__usePrivacyCheck__: true` 已生效（隐私弹窗在冷启动出现一次）。
- [ ] 主包体积 < 2MB（DevTools → 详情 → 基本信息；当前估算 < 1MB，分包后更小）。
- [ ] 分包 `preloadRule` 在弱网下不会拖慢首屏（可在 DevTools Network 面板调到 2G/3G 验证）。
- [ ] `utils/subscribe.js` 中的 `TMPL.*` 占位已替换为真实模板 ID。
- [ ] AI provider 凭据（`AI_API_BASE` / `AI_API_KEY` / `AI_MODEL`）已配置到云函数环境变量，**绝不**写入代码。

### C. 真机验证（至少 iOS + Android 各一台）

按 `docs/engineering/DEVELOPMENT_PLAN.md` §4.2 的清单逐项过：
- [ ] 冷启动 < 2s（中端 Android）
- [ ] 三 Tab 切换正常（名片 / 请求 / Vibe）
- [ ] 主人 → Vibe 对话 → 提议记忆 → 确认 → 出现在「已记住」
- [ ] 主人 → Card → 分享给朋友 / 朋友圈
- [ ] 访客 → 扫码进入分享名片 → 「先和我的 Vibe 聊聊」→ 对话 → 提交请求 → 完成
- [ ] 主人 → 请求 inbox → 看到新请求 → 通过 → 双方看到联系方式
- [ ] 订阅消息弹窗在「提交请求」和「通过连接」时各出现一次（且不阻塞主流程）
- [ ] 断网 / 云函数失败时，所有页面有合理的失败/回退态，不白屏

### D. 提审要点（避免常见拒绝原因）

- [ ] **AI 身份声明**：访客对话开场明确「我是 TA 的 AI 分身」（已内置，提审时可在截图中体现）。
- [ ] **用户内容审核**：`content-check` 云函数对访客文本/图片已接入微信内容安全；失败不默认放行（已在 3.1 实现）。
- [ ] **隐私协议一致**：协议中声明的收集项与代码实际调用匹配（`chooseAvatar`、聊天存储等）。
- [ ] **无诱导分享**：分享标题不写「分享得奖励」「转发解锁」等微信禁止文案。
- [ ] **类目匹配**：若申请「AI 服务」类目，确保有相关资质；否则用「社交 / 工具」类目。
- [ ] **测试账号**：提审时在备注里提供两个测试场景的演示账号或路径（主人 + 访客），帮助审核员快速走通流程。

### E. 上线后第一周监控

- [ ] 通过 `utils/track.js` 在本地查看事件队列（或在 `flush()` 接入云开发统计）。
- [ ] 关注核心漏斗：
  - `page_view(card)` → `cta_click(go_visitor_chat)` → `page_view(visitor_chat)` → `request_submitted` → `connection_made`
- [ ] 关注流失节点：哪一步掉得最多，下一步就优化哪里。
- [ ] 订阅消息授权率：如果 < 20%，考虑把请求时机再往前提（如访客进入对话时即请求一次预授权）。

---

## Runtime Modes

- **Cloud mode**（生产）：所有数据走云开发；AI 走配置好的 provider。
- **Demo mode**（离线/演示）：云不可用时自动回退到 `data/vibe-fixtures.js`，保证演示永不中断。

两种模式由各页面自行探测（首次云调用失败 → 切 demo），无需手动开关。
