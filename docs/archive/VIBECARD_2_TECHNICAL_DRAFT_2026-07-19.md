# VibeCard 2.0 技术草案（历史归档）

> 状态：历史归档  
> 日期：2026-07-19  
> 对应项目：VibeCard  
> 首发端：微信小程序  
> 辅助端：Web Card / PWA  
> 核心入口：现有 VibeCard 分享链接、二维码和后续 NFC Card

> 本文保留 2026-07-19 早期完整技术草案。当前实现不得以本文为需求来源，请读取 `../product/PRODUCT.md` 和 `../engineering/ARCHITECTURE.md`。

---

# 0. 开发者先看这里

VibeCard 2.0 不是新建一个产品，而是对现有 VibeCard 做一次聚焦升级。

现有产品已经具备：

- Web 端 Card 创建、编辑、公开分享和二维码
- 微信小程序 Card 创建、编辑和分享
- 微信登录、用户资料、内容安全、举报与拉黑云函数
- 多端基础结构
- 钱包验证、链上身份和 IPFS 能力
- 动态、搭子发现、小游戏和破冰内容

本次升级的唯一主闭环：

```text
创建我的 VibeCard
-> 训练我的 AI 分身
-> 访客先与分身交流
-> 分身整理联系理由
-> 主人决定是否建立联系
```

比赛版不继续扩展小游戏、搭子活动、公开动态和 Web3 积分。旧代码先保留，但从新版主导航和产品叙事中撤下。

---

# 1. 产品定义

## 1.1 一句话

**VibeCard 是一张带有个人 AI 分身的动态身份卡。别人先通过分身理解你、表达为什么想认识你，双方真正同频后，才建立联系。**

## 1.2 用户价值

对 Card 主人：

- 不再重复介绍自己
- 不直接暴露联系方式
- 分身帮助整理来意、保护注意力
- 只处理真正值得发生的连接

对访客：

- 不必只靠职位和标签猜测一个人
- 可以直接询问与主人相关的问题
- 分身帮助自己表达真实来意
- 即使暂时不适合连接，也能得到有尊重的反馈

## 1.3 核心文案

首页主张：

> **先理解，再认识。**

Card 主按钮：

> **和我的分身聊聊**

发起联系：

> **告诉我的分身，你为什么想认识我。**

双方确认：

> **Vibe matched.**  
> 你们因为一个具体的理由认识了彼此。

产品口号：

> **让同频的人，不再彼此错过。**

---

# 2. 产品边界

## 2.1 这次做什么

1. 动态个人 Card
2. AI 对话创建 Card
3. 个人分身的轻量训练
4. 访客与分身对话
5. 有具体理由的联系请求
6. 可解释的同频建议
7. 主人确认后开放联系方式
8. 简洁的关系来源记录

## 2.2 这次不做什么

- 小游戏
- 抽卡
- 破冰转盘
- 情侣问答
- 搭子活动
- 附近的人
- 公开动态广场
- 匿名职场社区
- 即时聊天
- 公开同频分数
- 公开人格排名
- 自动群发
- 销售 CRM
- AI 自动代替主人承诺或持续聊天

## 2.3 旧功能处理原则

旧功能不在第一阶段删除数据或大规模重构，只做以下处理：

| 现有功能 | 处理方式 | 原因 |
|---|---|---|
| Card 创建与编辑 | 保留并升级 | 新产品入口 |
| Card 分享与二维码 | 保留并升级 | 核心传播能力 |
| Public / Embed Card | 保留 | Web 与多端入口 |
| 微信登录与用户云函数 | 保留并扩展 | 已有身份基础 |
| 内容安全、举报、拉黑 | 保留并修正 | 联系系统必需 |
| Threads 动态 | 从主导航撤下 | 避免变成公开朋友圈 |
| Games 破冰 | 从主导航撤下并归档 | 偏离新定位 |
| Discover 搭子 | 从主导航撤下并归档 | 偏离新定位 |
| Vibe Points | 暂停新增入口 | 避免游戏化关系 |
| Web3 链上身份 | 放入高级设置 | 不是国内比赛主线 |
| 多平台适配目录 | 保留 | 后续复用 |

---

# 3. 首批用户和场景

## 3.1 首批用户

首版只服务：

**经常参加行业活动、持续创造项目、愿意认识新人，但不愿被无效社交消耗的创业者、AI 从业者、开发者、产品人和创作者。**

## 3.2 首要场景

### WAIC 或行业活动

主人展示实体 Card 或二维码。访客扫码后先看见主人正在做什么，再与分身交流。

### 微信群自我介绍

主人分享小程序 Card。群友不用立即添加微信，也可以先理解主人并发起联系。

### 项目与作品传播

主人分享作品时附带 VibeCard。访客不仅看到作品，还可以理解作者当前目标。

### 联系过滤

联系方式默认隐藏。分身先收集并整理来意，再由主人决定是否开放。

---

# 4. 核心产品结构

## 4.1 三个一级入口

登录后的主人端只保留：

```text
我的 Card | 联系请求 | 我的分身
```

微信小程序 Tab：

| Tab | 用途 |
|---|---|
| 我的 Card | 编辑、预览、分享 |
| 联系请求 | 处理别人发来的请求 |
| 我的分身 | 训练、边界、回答记录 |

访客从分享链接进入时，不显示主人端 Tab，直接进入公开 Card。

## 4.2 四个核心对象

### VibeCard

表达“此刻的我”，不是完整简历。

### Vibe Agent

基于主人授权资料回答问题、收集来意和生成建议。

### Connection Request

访客提交的具体联系理由，不允许只有“加个微信”。

### Vibe Decision

分身给主人的内部建议。它判断的是当前是否适合认识，不评价一个人的高低。

---

# 5. VibeCard 信息结构

现有 `Profile` 已有 `name`、`handle`、`bio`、`tags`、`lookingFor`、`highlights`、`contacts`、`event` 等字段，可以继续复用。

新版 Card 首屏必须回答：

1. 这是谁？
2. 他现在在做什么？
3. 他当前希望遇见谁或解决什么？

## 5.1 Card 展示顺序

1. 头像、名字和一句话身份
2. `Now`：最近主要在做什么
3. `Looking for`：现在希望认识谁
4. 三个代表性作品或经历
5. 三个长期关注主题
6. 可向分身询问的范围
7. 主按钮“和我的分身聊聊”

## 5.2 新增资料字段

在现有 `Profile` 上增量扩展：

```ts
interface VibeProfileV2 {
  version: 2;
  currentFocus: string;
  canHelpWith: string[];
  wantsToMeet: string[];
  topics: string[];
  boundaries: string[];
  profileItems: ProfileItem[];
  agentEnabled: boolean;
}

interface ProfileItem {
  id: string;
  type: 'fact' | 'work' | 'opinion' | 'goal' | 'boundary';
  title: string;
  content: string;
  visibility: 'public' | 'agent_only' | 'connected' | 'private';
  source: 'owner' | 'imported' | 'ai_summary';
  confirmedByOwner: boolean;
  updatedAt: number;
}
```

旧版 Profile 继续可读。读取时执行兼容转换，不要求用户重新创建 Card。

---

# 6. 主人创建流程

## 6.1 原则

旧版 Web 和小程序 onboarding 是多步表单。新版改为：

> 对话生成初稿，结构化编辑兜底。

不删除编辑器。AI 负责减少填写，编辑器负责最终控制。

## 6.2 创建流程

1. 微信登录
2. 获取微信头像与昵称，或手动设置
3. AI 每次只问一个问题
4. 5 至 7 轮后生成 Card 草稿
5. 用户逐项确认
6. 设置内容可见范围
7. 发布并生成分享入口

## 6.3 创建问题

1. 最近你把大部分精力放在什么事情上？
2. 哪个作品或经历最能代表你？
3. 你能为别人提供什么独特帮助？
4. 你最近希望认识什么样的人？
5. 哪个问题是你愿意认真聊很久的？
6. 有什么内容不希望分身向陌生人回答？

## 6.4 AI 生成结果

AI 返回结构化草稿：

```json
{
  "headline": "AI 产品与开源社区创业者",
  "currentFocus": "正在开发以个人分身为入口的 VibeCard",
  "canHelpWith": ["AI 产品设计", "开源社区", "微信生态落地"],
  "wantsToMeet": ["AI Native 产品开发者", "社交产品设计者"],
  "topics": ["个人 AI", "关系智能", "开源商业化"],
  "profileItems": []
}
```

所有生成内容必须由主人确认后才能发布。

## 6.5 验收

- 老用户可以直接看到自己的原 Card
- 新用户三分钟内生成可分享 Card
- 任意问题都可以跳过
- 生成失败时回退到现有结构化编辑器
- Card 不因资料不足展示空模块

---

# 7. 分身训练

## 7.1 训练目标

不微调一个“像主人说话”的人格模型。首版训练的是：

**主人当前愿意把时间给什么样的连接。**

## 7.2 初次训练

控制在两分钟、八个交互以内：

1. 当前最希望认识哪两类人
2. 三条联系请求中最愿意回复哪一条
3. 最不愿意回复哪一条
4. 更看重作品、观点、真诚、互惠还是行动力
5. 什么情况必须先征求本人意见
6. 一条明确的联系边界

## 7.3 内部判断维度

- `relevance`：与当前目标是否相关
- `specificity`：是否说清楚为什么联系
- `authenticity`：是否真实理解主人，而非模板话术
- `reciprocity`：双方是否可能互相创造价值
- `agency`：是否有行动、作品或明确下一步
- `timing`：是不是现在

这些维度不以公开分数展示。

## 7.4 持续学习

主人每次处理请求，只补充一个原因：

- 想认识
- 有意思，但不是现在
- 方向不匹配
- 信息不足
- 表达太泛
- 超出边界

反馈影响下一次建议，但必须允许撤销和重置。

---

# 8. 访客流程

## 8.1 进入 Card

访客通过：

- 微信小程序分享
- 小程序码
- 现有 Web 短链接
- 二维码
- 后续 NFC Card

进入公开 Card。

访客可以匿名浏览公开资料，但提交联系请求前需要微信登录或提供经验证的回复方式。

## 8.2 与分身交流

Card 主按钮：

> 和我的分身聊聊

分身欢迎语：

> 我是方辰的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。

对话约束：

- 默认最多 8 轮
- 只回答与主人有关的问题
- 只检索当前访客有权限访问的资料
- 明确标记“AI 分身”
- 不知道时明确说不知道
- 不承诺合作、报价、投资或时间
- 关键事实可以查看资料来源

## 8.3 推荐问题

推荐问题由主人资料动态生成，例如：

- 他为什么在做 VibeCard？
- 他最近最想解决什么问题？
- 我可以在哪些方面与他合作？

这是理解入口，不做破冰游戏。

## 8.4 发起联系

访客提交：

- 我是谁
- 我为什么想认识你
- 我们可以聊什么或做什么
- 一个可选作品链接
- 希望主人看到的回复方式

已经在对话里说过的信息由 AI 自动整理，访客只确认，不重复填写。

---

# 9. Vibe Decision

## 9.1 四种建议

```ts
type VibeDecision =
  | 'connect_now'
  | 'keep_warm'
  | 'need_more_context'
  | 'not_now';
```

## 9.2 输出结构

```json
{
  "decision": "connect_now",
  "confidence": "medium",
  "reasons": [
    "双方都在研究带有权限边界的个人 AI",
    "访客提供了已经上线的小程序作品",
    "访客提出了一个具体可讨论的问题"
  ],
  "uncertainties": [
    "尚不清楚对方希望合作还是交流观点"
  ],
  "suggestedTopic": "个人分身如何避免成为自动营销工具",
  "evidenceRefs": [
    "owner.currentFocus",
    "visitor.message.3",
    "visitor.work.1"
  ]
}
```

## 9.3 规则

- 先检查主人边界，再判断匹配
- 证据不足返回 `need_more_context`
- 当前目标权重大于陈旧履历
- 不因公司、学校、职位直接判定价值
- 不因表达不华丽默认低质量
- 对模板化请求降低置信度
- 主人可以覆盖任何建议
- 覆盖操作用于学习，但不形成不可逆规则

## 9.4 防攻略

分身不公开评分公式，不告诉访客“说哪句话就能通过”。

分身可以帮助访客更具体：

> 你的介绍还比较泛。可以说说你为什么关注这个项目，以及你已经亲自做过什么。

---

# 10. 主人处理联系请求

## 10.1 请求卡片

按以下顺序展示：

1. 对方是谁
2. 对方为什么来
3. 分身为什么建议连接或暂缓
4. 共同点
5. 不确定性
6. 对方原始表达和作品

## 10.2 三个操作

- **认识一下**
- **稍后再说**
- **暂不联系**

接受后由主人选择开放：

- 微信号
- 邮箱
- 预约链接
- 其他现有 Contact

联系方式不能在公开 Card 或分身回答中直接泄露。

## 10.3 关系记录

连接后生成一条简洁记录：

```text
你们于 WAIC 2026 因“AI 时代的个人身份与关系”而认识。
```

比赛版不做复杂 CRM，只保存连接来源和双方确认开放的联系方式。

---

# 11. 页面规格

## 11.1 页面清单

| 页面 | 复用现状 | 本次变化 |
|---|---|---|
| 创建 Card | Web / 小程序已有 | 表单前增加 AI 对话创建 |
| 我的 Card | 已有 | 改成 Now / Can help / Looking for |
| 公开 Card | Web 已有，小程序分享视图已有 | 联系方式隐藏，增加分身入口 |
| 分身对话 | 新增 | 访客理解和提交来意 |
| 联系请求列表 | 新增 | 主人 Inbox |
| 联系请求详情 | 新增 | 展示可解释建议 |
| 分身训练 | 新增 | 选择和反馈 |
| 分身设置 | 新增 | 边界、开关、回答记录 |
| Card 编辑 | 已有 | 增加字段权限 |

## 11.2 视觉原则

保留现有黑白、高对比、克制的基础方向，修正以下问题：

- Card 主体不能在宽屏中过度稀疏
- 小程序和 Web 使用一致的信息顺序
- 不继续堆叠玻璃卡片
- 联系方式不再作为主人 Card 的大模块公开展示
- Web3 状态从主视觉降级到“验证信息”
- 不使用大面积蓝紫渐变制造 AI 感

“好玩”来自：

- 分身逐渐懂你
- 访客提出了真正具体的问题
- 两个人意外发现一个强共同点
- `Vibe matched` 的连接瞬间

不使用积分、签到、抽卡或随机匹配制造刺激。

---

# 12. 隐私与安全

## 12.1 四级可见范围

```ts
type Visibility =
  | 'public'
  | 'agent_only'
  | 'connected'
  | 'private';
```

- `public`：公开 Card 和分身都可使用
- `agent_only`：分身可用于判断，但不能直接复述
- `connected`：双方建立联系后可见
- `private`：仅主人可见

## 12.2 关键约束

- 权限过滤必须发生在检索前
- AI 推断与主人原话分开存储
- 分身必须明确 AI 身份
- 访客可以删除自己的对话和请求
- 主人可以关闭分身
- 被拒绝后限制重复请求
- 支持举报和拉黑
- Prompt 注入不能读取 `agent_only`、`connected` 或 `private` 原文

## 12.3 现有内容安全修正

当前 `content-check` 在服务异常时默认返回安全。联系请求和 AI 输入上线前应改为：

- 短暂重试
- 仍失败时进入待审核或提示稍后再试
- 不对新的陌生人联系内容默认放行

---

# 13. 数据模型

微信云开发新增以下集合：

## `vibe_profiles`

```text
_id
ownerOpenid
version
currentFocus
canHelpWith[]
wantsToMeet[]
topics[]
boundaries[]
agentEnabled
updatedAt
```

## `profile_items`

```text
_id
ownerOpenid
type
title
content
visibility
source
confirmedByOwner
updatedAt
```

## `agent_preferences`

```text
_id
ownerOpenid
category
value
weight
source
active
updatedAt
```

## `agent_conversations`

```text
_id
ownerOpenid
visitorOpenid
status
messages[]
summary
consentStatus
createdAt
expiresAt
```

## `connection_requests`

```text
_id
ownerOpenid
visitorOpenid
conversationId
visitorIntent
decision
decisionDetail
ownerAction
createdAt
updatedAt
```

## `connections`

```text
_id
userAOpenid
userBOpenid
connectionReason
sharedContactMethods[]
createdAt
```

## `agent_feedback`

```text
_id
ownerOpenid
requestId
action
reason
createdAt
```

原有 `users.namecard` 保留，用迁移层映射到 V2，不直接破坏旧数据。

---

# 14. 技术实现

## 14.1 现有基础

### Web

- React 19
- TypeScript
- Vite
- Tailwind
- Motion
- 现有 Public / Embed / Share Card

### 微信小程序

- 原生小程序
- 微信云开发
- 已有 `login`、`user`、`content-check`、`report`、`companion` 云函数

### 共享层

- `packages/shared`

### Web3

- Wagmi / Viem
- IPFS
- Hardhat contracts

## 14.2 新增模块

```text
packages/shared/
  vibe-profile.ts
  agent-contracts.ts
  connection-contracts.ts

packages/miniprogram/cloudfunctions/
  agent/
  connection/

packages/miniprogram/miniprogram/pages/
  agent-chat/
  agent-training/
  requests/
  request-detail/

packages/web/src/pages/
  AgentChatPage.tsx
  AgentTrainingPage.tsx
  RequestsPage.tsx
```

实际文件名在实现时可以遵循各端现有命名方式，但业务契约必须统一。

## 14.3 云函数职责

### `agent`

- `createProfileDraft`
- `createConversation`
- `sendMessage`
- `generateDecision`
- `getTrainingCases`
- `submitPreference`

### `connection`

- `createRequest`
- `getInbox`
- `getRequest`
- `actOnRequest`
- `getConnections`
- `deleteConversation`

### 扩展 `user`

- `getVibeProfile`
- `updateVibeProfile`
- `updateProfileItemVisibility`
- `setAgentEnabled`

## 14.4 AI 编排顺序

```text
身份校验
-> 访问权限计算
-> 内容安全检查
-> 按权限检索资料
-> 对话模型
-> JSON Schema 校验
-> 敏感信息二次检查
-> 返回客户端
```

## 14.5 首版个性化方式

不训练独立基础模型，也不一开始做模型微调。

使用：

- 结构化 Vibe Profile
- 主人确认的资料
- 当前目标
- 轻量偏好选择
- 历史请求反馈
- 权限化检索
- 结构化输出

这已经足够完成可靠的首版个人化。

---

# 15. 多端与多开发端协作

## 15.1 产品多端

优先级：

1. 微信小程序：比赛完整闭环
2. Web：公开 Card 与访客分身对话
3. PWA / Embed：复用公开 Card
4. Telegram 等平台：后续接统一服务
5. NFC：只负责打开同一个 Card ID

所有端共享服务端的：

- 资料权限
- 分身对话
- Vibe Decision
- 联系请求状态

不要在每个客户端复制判断逻辑。

## 15.2 多个 Codex 窗口并行边界

### 端 A：微信小程序

拥有目录：

```text
packages/miniprogram/miniprogram/
```

负责 Card、分身对话、请求列表和训练页面。

### 端 B：云函数与数据

拥有目录：

```text
packages/miniprogram/cloudfunctions/
```

负责身份、权限、数据集合、联系请求和内容安全。

### 端 C：AI 与共享契约

拥有目录：

```text
packages/shared/
packages/miniprogram/cloudfunctions/agent/
```

负责 Schema、提示词、检索、Decision 和评测。

`agent/` 目录由端 C 独占，端 B 通过契约协作。

### 端 D：Web 与集成测试

拥有目录：

```text
packages/web/
```

负责公开 Card、Web 分身入口、兼容性和端到端测试。

## 15.3 冲突规避

1. `packages/shared/agent-contracts.ts` 是 AI 与联系接口真相源
2. 先改契约和 Mock，再分别实现
3. 每个端只修改自己的拥有目录
4. `app.json`、根 `package.json`、README 由主协调端修改
5. 云数据库变更用独立迁移说明，禁止静默改字段
6. Prompt、Schema 和 Decision 规则必须版本化
7. 不删除他人正在使用的旧模块
8. 每个合并请求必须能独立演示一个用户结果

## 15.4 第一轮并行任务

| 端 | 任务 | 集成交付 |
|---|---|---|
| A | 小程序公开 Card -> 分身对话 -> 提交请求静态闭环 | 使用 Mock 数据可完整点击 |
| B | 新增 V2 数据集合与 connection 云函数 | 请求可创建、查询、处理 |
| C | 定义共享 Schema，完成 Card Draft 与 Decision Mock | 固定样例稳定通过 |
| D | Web Public Card 增加分身入口并更新 E2E | 分享链接可进入对话 |

第一轮只稳定两个核心契约：

- `PublicVibeCard`
- `VibeDecision`

---

# 16. 代码迁移清单

## 16.1 Web

| 文件 | 动作 |
|---|---|
| `packages/web/src/App.tsx` | Tab 改为 Card / Requests / Agent |
| `packages/web/src/pages/CardPage.tsx` | Card 信息结构升级，联系方式隐藏 |
| `packages/web/src/pages/PublicCardPage.tsx` | 增加“和我的分身聊聊” |
| `packages/web/src/components/card/OnboardingFlow.tsx` | 接入 AI 对话创建，保留表单兜底 |
| `packages/web/src/components/card/EditProfile.tsx` | 增加 V2 字段与权限 |
| `packages/web/src/components/card/ShareDrawer.tsx` | 保留，分享落点改为 V2 Card |
| `packages/web/src/pages/ThreadsPage.tsx` | 从主导航撤下，暂不删除 |
| `packages/web/src/pages/GamesPage.tsx` | 归档，暂不删除 |
| `packages/web/src/pages/DiscoverPage.tsx` | 归档，暂不删除 |
| `packages/web/src/pages/MorePage.tsx` | 改为设置，Web3 放高级区 |
| `packages/web/src/store.ts` | Profile V2 兼容迁移 |

## 16.2 微信小程序

| 文件 | 动作 |
|---|---|
| `packages/miniprogram/miniprogram/app.json` | Tab 改为 Card / Requests / Agent |
| `pages/card/*` | 升级 Card 与创建流程 |
| `pages/threads/*` | 从 Tab 移除，暂不删除 |
| `pages/games/*` | 从入口移除，暂不删除 |
| `pages/discover/*` | 从入口移除，暂不删除 |
| `pages/more/*` | 改为分身或设置入口 |
| `custom-tab-bar/*` | 更新三项导航 |
| `cloudfunctions/user` | 扩展 V2 Profile |
| `cloudfunctions/report` | 复用举报与拉黑 |
| `cloudfunctions/content-check` | 修正失败默认放行 |
| `cloudfunctions/companion` | 停止新功能开发，暂不删除 |

## 16.3 Shared 与合约

| 区域 | 动作 |
|---|---|
| `packages/shared/cards.ts` | 停止在新产品引用 |
| `packages/shared/tags.ts` | 停止在新产品引用 |
| `packages/shared/companion-types.ts` | 停止在新产品引用 |
| `packages/shared/index.ts` | 新增 V2 契约导出 |
| `packages/contracts` | 比赛版不新增社交关系上链 |

联系内容、私人偏好和关系图不应默认上链。

---

# 17. 测试与验收

## 17.1 主流程

- 新用户三分钟内创建并发布 Card
- 老用户资料无损迁移
- 访客两步内开始与分身对话
- 访客完成对话后提交具体请求
- 主人收到可解释建议
- 主人接受后才开放联系方式

## 17.2 AI

- 分身只使用当前权限允许的资料
- 关键事实有来源
- 不知道时不编造
- Decision 有理由、不确定性和证据
- Prompt 注入无法读取私密内容
- AI 超时有明确降级

## 17.3 安全

- 未登录访客不能批量提交
- 被拉黑用户不能重新请求
- 内容审核失败不默认放行
- 联系方式不能从 Public Card API 泄露
- `agent_only` 原文不能被复述

## 17.4 多端

- 同一个 Card ID 在小程序和 Web 展示一致
- 小程序处理的请求在 Web 可见
- 主人关闭分身后所有端停止新对话
- 不同端共享同一个请求状态

---

# 18. 开发里程碑

## M1：聚焦导航与静态原型

- 撤下 Threads / Games / Discover 主入口
- 完成新的三 Tab
- 完成公开 Card、分身对话、请求详情静态流程
- 使用 Mock 跑通完整故事

验收结果：

> 不接真实 AI，也能让评委理解产品。

## M2：真实资料与分身回答

- Profile V2
- AI 创建 Card
- 权限化资料检索
- 分身问答与来源

验收结果：

> 分身真的了解主人，而不是通用聊天机器人。

## M3：联系请求与同频建议

- 初次训练
- Connection Request
- Vibe Decision
- 主人反馈

验收结果：

> 分身能解释为什么建议认识或暂缓。

## M4：比赛打磨

- 分享和二维码
- 演示账号
- 内容安全
- 弱网与模型失败
- 小程序真机验证
- 90 秒比赛演示

---

# 19. 比赛演示

目标时长：90 秒。

## 第一幕：此刻的我

参赛者回答几个真实问题，AI 生成 VibeCard。

> 传统名片记录过去的职位，VibeCard 表达此刻的我。

## 第二幕：先理解我

评委扫码，向分身提问：

> 他为什么想做这个产品？

分身依据真实资料回答，并显示来源。

## 第三幕：表达来意

评委说明为什么想认识参赛者。分身追问一个具体问题并整理请求。

## 第四幕：真正连接

参赛者看到：

- 对方为什么来
- 共同点
- 分身建议
- 不确定性

参赛者点击“认识一下”。

结束：

> **AI 时代，我们不需要更多联系人。  
> 我们需要更少被错过的关系。**

---

# 20. MVP 最终判断

比赛版只需要证明一件事：

> **一个人愿不愿意让自己的 AI 分身，帮助自己认识真正同频的人？**

因此开发优先级永远是：

```text
分身是否真的理解主人
> 联系请求是否具体
> 判断是否可信且可解释
> Card 是否漂亮
> 其他功能
```

VibeCard 2.0 的产品结构最终是：

```text
VibeCard = 被看见
Vibe Agent = 被理解
Vibe Decision = 保护边界
Vibe Connection = 真正认识
```

Card 是入口，分身是内核，同频关系才是长期价值。
