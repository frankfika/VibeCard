# now 云函数（任务 4.5）

个人「最近动态」（Now）的数据层：主人确认发布的一小段最近动态，展示在
Card 上（最多 3 条最新的有效动态）。Now 不是公共 Feed——没有关注流、
推荐、点赞、评论或排名。

## 集合：`now_items`

字段镜像 `packages/shared/now.ts`（schemaVersion: 1）：
`ownerId / text / topic / sourceMemoryId / status / publishedAt / expiresAt / createdAt / updatedAt`

- `status`: `draft | published | archived | hidden | deleted`
- `topic`: `current_work | completed_work | exploring | looking_for | offer_help`
- 有效（active）= `status === 'published'` 且（`expiresAt === null` 或 `expiresAt > now`）
- 归档 / 隐藏 / 删除 / 过期内容永远不会公开出现，也不会作为访客对话的证据
- 发布 Now 不会改变来源记忆（sourceMemoryId）的可见性；本函数不读写
  `memories` 集合

## 权限

- 所有写操作按调用者 OPENID 在服务端过滤：只有主人能创建或修改自己的动态
- Vibe/agent 只能经由 `createNowDraft` 创建草稿提议，没有任何发布路径；
  发布永远是主人显式操作（`publishNowItem`）
- `getActiveNowItems` 是唯一的公开读口：只从数据库读取 `status='published'`
  的记录，过期项在投影前剔除，返回字段裁剪为 `{ id, text, topic, publishedAt }`

## 需要的索引（docs/engineering/ARCHITECTURE.md §4）

在微信云开发控制台为 `now_items` 集合建立：

1. `ownerId + status + publishedAt`（公开投影与主人列表查询）
2. `ownerId + expiresAt`（过期清理 / 有效性判断）
