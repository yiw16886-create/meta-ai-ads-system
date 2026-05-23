# Meta Insights Pro - 现有项目重构与拆分路线图

针对项目中已然存在的庞大 `api/server.ts` 以及现有的 Vercel 部署环境，我们将采取**“稳态迁移，分治重构”**的策略实施企业级改造。

---

## 1. 最优重构目录结构 (目标架构)

彻底摒弃单文件管理，在 `api/` 目录下构建如下企业级结构：

```text
api/
├── index.ts                // (Entry) Express 与 Vite 的挂载点
├── app.ts                  // (App) Express 实例与全局中间件、路由总线注册
├── db/
│   └── prisma.ts           // Prisma 单例 (规避 Vercel 热重启与连接池耗尽)
├── middlewares/
│   ├── auth.middleware.ts  // 统一 Token/RBAC 鉴权
│   ├── error.middleware.ts // 统一错误捕获格式化返回
│   └── catchAsync.ts       // 包装异步路由，免写重复的 try-catch
├── routes/                 // (路由器)
│   ├── index.ts            // 聚合文件
│   ├── auth.routes.ts
│   ├── meta.routes.ts      // 账户、Insights
│   ├── stores.routes.ts    // 关联的店铺业务
│   ├── ai.routes.ts        // Gemini 分析业务
│   └── sync.routes.ts      // 同步触发端点 (供内部或 Cron)
├── controllers/            // (调度者) 仅负责解析 Req -> 传给 Service -> 封装 Res
│   ├── auth.controller.ts
│   ├── meta.controller.ts
│   ├── stores.controller.ts
│   └── ai.controller.ts
├── services/               // ★ (核心层) 所有的业务与 DB 操作都在这里
│   ├── meta.service.ts     // fetch Meta API、限流重试、游标翻页
│   ├── shopline.service.ts
│   ├── ai.service.ts       // 构造 Prompt，请求 Gemini
│   ├── sync.service.ts     // 负责调度并清洗 Meta/Shopline 数据写入 Prisma
│   └── repository.ts       // 选做: 极复杂的 DB 查询封装
└── utils/                  // (工具)
    ├── AppError.ts         // 业务异常基类
    └── logger.ts           // Winston/Pino 日志或标准化 console.log
```

---

## 2. 模块拆分与职责划分详解

- **Routes (`routes/`):** 绝对不写业务逻辑。职责仅为绑定 HTTP Method、路径、中间件与 Controller。
- **Controllers (`controllers/`):** 负责校验入参 (`req.body` / `req.query`) 的合法性，抛出 400 错误；合法则传给 Service 获取数据，然后使用 `res.json()` 发送，保证网络层与业务层隔离。
- **Services (`services/`):** 专注业务。不要在这里出现任何 `req` 和 `res` 对象！`meta.service.ts` 专注如何拿数据，`sync.service.ts` 调用 `meta.service` 和 `prisma` 专注数据入库。
- **Middlewares (`middlewares/`):** 把现有的每一个 `app.get` 里重复的 `const token = await getMetaToken(); if(!token) ...` 逻辑提取成 `@CheckMetaToken` / `authMiddleware` 统一拦截。

---

## 3. Vercel 环境下痛点诊断与应对 (血泪教训)

由于你运行 Serverless 上，必须正视其架构天生克制“长期任务”的特点。

### 🚨 哪些逻辑绝对不可放在 Vercel？哪些接口必会超时？

目前的 `/api/cron/sync-monthly` 以及所有存在 `for (const account of accounts) { await axios.get(...) }` 且拉取周期超过 7 天的长耗时接口，**在商用化时 100% 会触发 Vercel 504 Gateway Timeout (即便 Pro 最高限制为 300秒)**。

- 尤其是 Meta API 会限流降速；
- 尤其是分页层级较深的 Ad Insights 拉取。

### 🚀 哪些地方需要 Redis？(缓存降压)

1. **授权信息 (Meta Token)**：高频使用，避免每次请求都查寻 `prisma.setting`。
2. **Dashboard 大盘日级数据**：对于 `startDate` 到 `endDate` 是过去固定时间的数据请求，使用 URL 或请求体做 hash 存入 Redis，TTL 设为 `2h-6h`。这能让首屏直接在 50ms 内加载，而不是等 Prisma 去求和。

### 📦 哪些地方未来适合 BullMQ？哪些适合独立的 Worker 服务？

对于无法在 Vercel 300 秒内跑完的任务，必须剥离出 **Queue (BullMQ)** 与 **Worker (后台进程)**。

- **同步拆分 (BullMQ)**：`sync-monthly` 端点只负责生成并抛出 N 个任务 (如任务体: `{"accountId": 123, "date": "2024-05-01"}`) 放入队列（耗时 < 1秒），然后直接响应客户端 200 OK。
- **长期进程 (Worker 服务)**：找一台最便宜的长驻留服务器 (Railway / Render / Heroku / AWS EC2) 专门消费 Redis / BullMQ 队列。Worker 可以安心地在后台花 5 分钟去请求 Meta 并写入数据库，不用担心断连，甚至自动处理 Retry 和 Backoff。
- **重度 AI 推理生成 (Worker)**：如果生成几万字的深度多账户分析报告，必须放后台 Worker 异步跑，并将状态存库(`status: 'PENDING' -> 'COMPLETED'`)，前端轮询或 SSE 获取结果。

---

## 4. 实战重构演进路线 (执行三步走)

### 🚩 第一步：基建设施解耦与脏代码分离 (无痛清理)

**核心目标：隔离单文件应用并打造基础工具链，避免改坏原逻辑。**

1. 创建 `api/db/prisma.ts`，将实例化单独隔离并加入防止开发模式重复建连的 `global` 垫片判断。
2. 构建 `api/utils/AppError.ts` 和统一错误拦截中间件 `api/middlewares/errorHandler.ts`，彻底抛弃到处乱写的 `res.status(500).json({ error: ... })`。
3. 把所有的内部辅助函数如 `getMetaToken()`, `getSmtpConfig()` 全部抽到对应的 `api/services/settings.service.ts` 里面去。

### 🚩 第二步：业务模型拆分与路由搬迁 (外科手术)

**核心目标：将 `server.ts` 肢解为网状路由控制模型。**

1. 建立 `routes/` 和 `controllers/` 文件夹。
2. **搬迁 Store 组**：先把 `/api/stores/*` 相关的增删改查全盘切入 `stores.routes.ts` 和 `stores.controller.ts`，配合 `shopline.service.ts` 去处理，通过 POSTMAN 测试保证该分支功能 100% 同等平移。
3. **搬迁 Auth 组**：分离 `/api/auth/*` 与 `/api/users/*`，使用统一的 Auth Middleware 完成身份信息挂载。（奠定 SaaS 的 RBAC 基石）。
4. **搬迁 AI 组**：将 `app.post("/api/ai/chat")` 和 `diagnose` 转移到 `ai.controller.ts`。在此处引入专门的 `ai.service.ts` 来组装长文本 Context 和对 Gemini 打 API。
5. 清理 `server.ts`，使其最终只剩 `app.use('/api/stores', storesRoutes)` 这样的入口代码与 Vite 承接代理逻辑。

### 🚩 第三步：解决高并发与 Vercel 架构缺陷 (企业级重塑)

**核心目标：数据同步改造与队列扩展预留，正式踏入 SaaS 架构。**

1. **同步逻辑降级**：彻底重写 `api/services/sync.service.ts`。禁止在 Vercel 接口死等大循环。当前可以将同步操作优化为按账户分组并发。将多账号多天数的拉力化整为零：允许前端页面发起一个 Account 维度的粒度较细的请求同步，通过多请求并发。
2. **数据 Repository 层抽取**：涉及排行榜、多组织汇合排序的 Prisma 查询提取进 `api/services/repository/` 或作为 Model 层方法复用，保证 Dashboard 的统计调用和内部同步写入使用的是同一套 ORM 定义逻辑。
3. **引入 Queue 的准备工作**：将同步逻辑重构为纯业务方法 `syncAccountData(accountId, dateRange)`，不在内部写 `res.json`。这样未来一但接入 BullMQ，只需要挂载一个 Worker 消费这句方法，实现零成本转换背景任务调度。
