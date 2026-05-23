# AI Facebook Ads Intelligence Platform

## 企业级架构设计与优化方案指南

本项目核心定位：**“AI辅助决策 + 广告智能分析 + 风险预警平台”**。
核心原则：AI不越权，所有操作均需人工确认。

---

### 1. 完整系统架构 (System Architecture)

基于目前的 Vercel + Node.js + Prisma + Gemini 技术栈，系统整体架构设计如下：

- **接入层 (Edge/CDN)**
  - Vercel Edge Network
  - 静态资源分发与前端路由渲染
- **前端展示层 (Frontend)**
  - React 18 + Vite + Tailwind CSS
  - 状态管理：Zustand (取代冗杂的 Context)
  - 组件库：shadcn/ui (Radix UI)
  - 数据可视化：Recharts (高性能图表)
- **API 网关与服务层 (Backend - Serverless)**
  - Express on Vercel Serverless Functions
  - 核心模块： Auth (认证), Gateway (请求校验), Orchestrator (业务分发)
- **领域服务层 (Domain Services)**
  - Meta Data Sync Service (数据同步服务)
  - AI Diagnosis Engine (AI 分析诊断引擎)
  - Rule-based Anomaly Engine (基于规则的异常检测引擎)
  - Alert & Notification Service (预警服务)
- **数据与队列层 (Data & Async Layer)**
  - 主数据库：Neon PostgreSQL (支持 connection pooling)
  - ORM：Prisma (结合 Prisma Client Extension 实现按组织租户隔离)
  - 缓存与消息队列 (未来扩展)：Upstash Redis + BullMQ
- **第三方集成层 (3rd Party Integrations)**
  - Meta Marketing API
  - Google Gemini API (或可拓展至 Vertex AI)
  - Shopline/Shopify Open API

### 2. 完整目录结构设计

摒弃单文件 `server.ts`，采用企业级应用标准的模块化目录：

```text
├── .env                  # 环境变量配置
├── package.json
├── prisma/
│   ├── schema.prisma     # 数据库多租户模型
│   └── migrations/
├── src/                  # 前端源码
│   ├── components/       # 公共业务组件
│   ├── pages/            # 路由视图层
│   ├── stores/           # Zustand 状态管理
│   ├── hooks/            # 自定义 Hooks
│   ├── lib/              # FE 工具库 (如 API client, utils)
│   └── main.tsx
└── server/               # 后端源码 (基于 Vercel Function 打包)
    ├── index.ts          # Express 注册入口
    ├── middlewares/      # 中间件: auth, rateLimit, tenantGuard
    ├── routes/           # 路由分发
    ├── controllers/      # 控制器: 校验输入，返回结果
    ├── services/         # ★ 核心业务逻辑层
    │   ├── meta.service.ts      # Meta API 交互
    │   ├── ai.service.ts        # Gemini 模型交互与结构化输出
    │   ├── sync.service.ts      # 数据同步编排
    │   └── alert.service.ts     # 预警逻辑
    ├── jobs/             # 异步任务/定时任务入口 (未来供 BullMQ 消费或 Cron 调用)
    └── utils/            # BE 工具方法
```

### 3. 前后端模块拆分

**前端模块 (Frontend Modules):**

1. **统一仪表盘 (Dashboard)**: 跨账户、多视角的全局资产、消耗和预警看板。
2. **AI洞察中心 (AI Insights)**: 专门的话题页面，显示系统推送的诊断卡片、疲劳检测报告和 Funnel 分析。
3. **策略决策流 (Decision Center)**: 展示 AI 给出的具体操作建议，必须包含一个显眼的“确认已人工执行”或“标记为无效建议”按钮。
4. **报表与可视化 (Reporting)**: 时间序列折线图、柱状图，支持下钻到 AdSet/Ad 层级。
5. **多租户配置台 (Settings)**: 组织(Org)配置、成员权限分配、Meta/Shopline 授权配置。

**后端模块 (Backend Modules):**

1. **IAM (Identity & Access)**: 登陆、权限校验 (RBAC)。
2. **Metadata Worker**: 与 Facebook 图谱 API 通信，管理访问令牌 (长效 Token 刷新)。
3. **ETL Pipeline**: 抽取 Meta 与 Shopline 数据 -> 转换格式 -> 批量长连接存入 Postgres。
4. **AI Inference Pipeline**: 从 DB 获取时序数据 -> 构建 Prompt/Schema -> 请求 Gemini -> 解析 JSON 记录入库。

### 4. Prisma 数据库设计 (支持多租户与SaaS)

```prisma
// --- 多租户与权限体系 ---
model Organization {
  id        String   @id @default(cuid())
  name      String
  users     OrgUser[]
  adAccounts AdAccount[]
  alerts    RiskAlert[]
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  orgs      OrgUser[]
}

model OrgUser {
  orgId     String
  userId    String
  role      Role     @default(VIEWER) // OWNER, ADMIN, MEMBER, VIEWER
  org       Organization @relation(fields: [orgId], references: [id])
  user      User         @relation(fields: [userId], references: [id])
  @@id([orgId, userId])
}

// --- 数据同步层 ---
model AdAccount {
  id             String   @id // 对应 act_id
  orgId          String
  metaToken      String   // 应加密存储
  name           String
  insights       AdInsight[]
  diagnoses      AiDiagnosis[]
  org            Organization @relation(fields: [orgId], references: [id])
}

model AdInsight {
  id          String   @id @default(cuid())
  accountId   String
  date        DateTime @db.Date
  spend       Float
  cpm         Float
  ctr         Float
  cpc         Float
  purchases   Int
  roas        Float
  // ... 其他指标
  account     AdAccount @relation(fields: [accountId], references: [id])
  @@unique([accountId, date])
  @@index([date])
}

// --- AI与预警层 ---
model AiDiagnosis {
  id          String   @id @default(cuid())
  accountId   String
  healthScore Int      // 1-100
  analysis    Json     // AI详细分析结果
  suggestions Json     // 数组格式的建议，如更换素材、拓量等
  level       AlertLevel // INFO, WARNING, CRITICAL
  createdAt   DateTime @default(now())
  account     AdAccount @relation(fields: [accountId], references: [id])
}

model RiskAlert {
  id          String   @id @default(cuid())
  orgId       String
  title       String
  message     String
  metric      String   // 异常的指标名：CPM_SPIKE, ROAS_DROP
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())
  org         Organization @relation(fields: [orgId], references: [id])
}

enum Role { OWNER ADMIN MEMBER VIEWER }
enum AlertLevel { INFO WARNING CRITICAL }
```

### 5. Meta API 同步架构

- **分离拉取与计算**：通过 Vercel Cron 每小时触发一次 `/api/cron/sync-hourly`。
- **批量请求优化 (Batch API)**：拒绝在 `for` 循环中发起海量 HTTP 请求。充分利用 Facebook Graph API 的 Batch Request 特性或 `/insights` 端点的分页。
- **差异同步逻辑 (Upsert)**：仅同步今天、昨天和过去 7 天的数据，因为归因窗口（通常为 7d-click, 1d-view）导致的历史数据会回溯更新。

### 6. AI 分析架构

系统不做“漫无目的”的提问。所有的 AI 诊断基于**结构化编排**：

1. **上下文组装 (Context Builder)**: 提取账户过往 7-14 天的数据形成 Pandas-like 文本表格。
2. **特定任务的 Prompt (Task Prompts)**: 针对此场景调用特定指令，例如"素材疲劳检测Prompt"。
3. **结构化输出约束**: 通过 `@google/genai` 强制要求 Gemini 输出严格匹配预定 `responseSchema` (JSON) 模型，确保下游数据库能直接提取 `healthScore`, `risks` 和 `actionableItems`。

### 7. 异常检测架构 (Rule + AI 组合拳)

- **规则引擎 (第一道防线)**: 高速、廉价。当今日消费速率 (Burn Rate) 飙升、或 CPM 环比昨天增加 > 50%、CTR < 1% 时，直接触发 `Rule based Alert`。无需每次都调用 AI。
- **AI 趋势检测 (第二道防线)**: 应对"温水煮青蛙"式的渐进恶化。AI 每天分析一次 14 天平滑曲线，发现 ROAS 的隐性下降趋势或转化漏斗断层，产出 `AiDiagnosis` 记录。

### 8. 广告健康评分系统 (Health Scoring System)

结合静态阈值与相对指标：

- **基准分 100**。
- **核心数据表现 (占 40分)**：依据行业中位数（如 ROAS ≥ 2 为满分，<1扣20分）。
- **生命周期指标 (占 30分)**：频率 (Frequency) 过高则扣分，疲劳度上升扣分。
- **操作频率/账户结构 (占 30分)**：受众重叠度 (Audience Overlap 估算)、创意数量是否匮乏。

最终产出如：**82/100 (健康，但受众接近疲劳)**。

### 9. Vercel Serverless 优化方案

- **超时问题**：Vercel Pro/Hobby function 最大耗时有限制 (Hobby 10s -> Pro 300s)。将重度数据同步任务拆分成单账户粒度的请求，或依赖定时任务多批次触发。
- **无状态设计**：不要在 Express `.ts` 运行时中存储 `global` 变量的缓存。
- **Edge Cache**：对于 `/api/insights/dashboard` 之类的公共高频访问报表，设置适当的 `Cache-Control: s-maxage=60, stale-while-revalidate` 标头以减少数据库读取。

### 10. Redis 缓存设计 (结合 Upstash Redis)

- `meta_token:{accountId}`: 高频读取解密。
- `cache:daily_dashboard:{orgId}:{date}`: 将整个组织昨日的总汇总数据存入 Redis (过期时间 6 小时)，极大地缓解冷启动查表时间。
- `rate_limit:{ip}` 和 `rate_limit:{orgId}`: 基于 Upstash 构建全局防刷。

### 11. BullMQ 未来扩展方案

当应用拥有超过 50 个客户，Vercel Cron 容易超时或遭遇 Graph API 并发墙。
部署独立的 Render/Railway Worker 运行 BullMQ 实例：

- **Queue**: `meta-sync` (每15分钟放入账号ID同步消耗)
- **Queue**: `ai-insight-generation` (慢任务队列，防止阻塞核心同步)
- **Queue**: `email-alert` (投递风险预警邮件)

### 12. 多租户 SaaS 架构最佳实践

- **组织隔离 (Organization ID)**：所有的业务关键表 (AdAccount, Store, Users, Rules) 必须强制拥有 `orgId` 外键。
- **API 中间件拦截**: `/api/*` 请求通过 JWT 或 Session 解析出当前用户的所属 `orgId`，并在所有数据库查询中强制附带 `where: { orgId }` 条件。这是避免数据越权串表的黄金法则。

### 13. 权限系统设计 (RBAC)

- `OWNER`: 拥有结算、修改公司、添加删除成员的所有权限。
- `ADMIN`: 可绑定/解绑 Meta 授权，修改预警阈值。
- `MEMBER`: 可查看数据、要求 AI 触发新的诊断并点击“标记已人工修复”。
- `VIEWER`: 只读报表视图，无法修改任何配置或查看 Token。

### 14. 数据同步最佳实践

- **指数退避重试 (Exponential Backoff)**：对于网络不稳定带来的 502/503。
- **增量拉取与 Cursor**：如果获取素材级 (Ad Level) 分析，必定触发分页。必须处理 `next` cursor，直到拉完昨日变动。

### 15. Meta API Rate Limit 处理方案

通过读取 Meta 返回的响应头 `x-business-use-case-usage` 解析：

```json
{
  "111053000": [
    {
      "type": "ads_management",
      "call_count": 8,
      "total_cputime": 1,
      "total_time": 1
    }
  ]
}
```

若发现某类别的 usage 超过了 **80%**，立即让 Worker 对于该账户执行 `Delay (Sleep)` 策略，并发出系统内部预警，避免账号被系统层面上锁。

### 16. 高性能数据库方案 (Neon Postgres)

- **PgBouncer 线程池**: 在 Vercel 中为 Prisma 使用带 `?pgbouncer=true` 的池化连接端点，避免高并发下耗尽 Neon 连接数。
- **复合索引**: 为 `AdInsight` 建立 `@@index([accountId, date])` 的组合索引。分析场景均是 "按账户聚合特定时间区间的消耗"。
- **冷热数据分离设计**：AI 系统其实更多看重近 30-90 天的数据。旧的一年以前的数据仅提供大盘汇总统计，避免每次聚合所有海量明细全表。

### 17. AI 分析流程 (AI Analysis Flow)

1. **触发 (Cron/Action)**: 每日凌晨 1 点执行或用户点击"强制诊断"。
2. **Context Aggregation**: 并行读取 `AdInsight (Meta)` + `StoreStats (Shopify)`。
3. **System prompt 装载**: “你是高级投放师...禁止输出修改代码...”
4. **LLM Chain (Gemini 1.5 Pro)**: 推理长文本并计算漏斗流失。
5. **Format Validation**: 如果解析 JSON 出错，回退方案。
6. **Persistence**: 保存分析结果入库，并在首页 Dashboard 展示红点提示。

### 18. AI 建议生成流程 (决不越权)

1. 分析出**根本原因** (如：CTR 低导致后端即使转化高也跑不动量)。
2. 调用内部 Prompt Template 输出**行动指南库** (如 "建议测试 3 个前 3 秒吸引眼球的新视频片段"或"扩大类似受众")。
3. 生成的数据结构必须有 `actionable: true, type: "HUMAN_ADVICE"` 标记。
4. 前端展示一个待办列表 (Todo List)。投放师线下/前往业务后台操作后，点击平台上“已解决”按钮。系统将记录该操作审计日志。

### 19. AI 风险预警流程 (Alerting)

将**发现风险**的时间敏感性从“天级”缩小到“小时级”。
每小时的轻量同步发现 ROAS 跌破某底线，即触发：

1. Rule Match -> `AlertLevel.CRITICAL`
2. AI Quick Look -> "发现异常，建议立刻暂停该组测试"
3. Webhook推送 -> （未来可接入企业微信、飞书、Slack机器人）。

### 20. 未来商业化建议 (Commercialization Roadmap)

- **Phase 1 (MVP)**：单机/少数企业内部自用工具。重在完善底层架构的拆分（拆离单文件 `server.ts`）。
- **Phase 2 (Growth)**: 面向小型代理商提供订阅制 (SaaS)。提供多层级的角色分享链接。(基础版 $99/月支持 5 个账号，进阶版 $299/月)。
- **Phase 3 (Enterprise)**: 开通基于 RAG (Retrieval-Augmented Generation) 的私有模型微调。允许大品牌客户上传自己过往 5 年的高回报素材，AI 可以学习属于其品牌的“爆款特征”，做专门的预测与推荐。
- **Value Proposition (商业价值)**：卖点不要说“我们能自动化管广告”，而是宣传“**您的 24/7 智能策略分析师团队，保障资金安全并挖掘隐性增长点。**”

---

_本文档为架构演进核心蓝图，后续开发均应参考此原则进行代码模块的切分。_
