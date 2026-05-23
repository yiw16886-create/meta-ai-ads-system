# Infrastructure Layer 重构指南

本指南详解如何将系统的关键耗时路径（Meta 接口拉取、AI大模型推理）从 **同步阻塞的“一波打死”模型** 转入 **高吞吐、高可用的“异步任务流架构”**。

## 1. 目录结构 (Directory Structure)

```text
api/infrastructure/
├── cache/
│   └── redis.client.ts          # 单例 Redis 连接配置池
├── queue/
│   ├── queue.factory.ts         # 基于 BullMQ 的队列工厂 (生产线)
│   └── jobs.interface.ts        # 严格约束 payload 类型 (TypeScript)
└── workers/                     # 消费端 (Consumer) - 专门用于无超时环境
    ├── base.worker.ts
    ├── meta-sync.worker.ts      # 并发拉取 Meta，控制 Limit
    └── ai-analysis.worker.ts    # 并行访问 Gemini，写库并推送到 WS
```

## 2. Queue 设计与 Job Payload (队列与有效载荷)

原有的设计是循环 await，所有风险集于主进程。
我们重构为了 `Producer - Queue - Consumer` 模型。

**Payload (Job Type)**:

```ts
export interface AiDiagnosisJobPayload {
  accountId: string;
  triggerSource: "CRON" | "MANUAL" | "WEBHOOK";
}
```

通过 `jobId: 'ai-{accountId}-{date}'` 实现了**幂等性 (Idempotent)** 投递，如果用户在一分钟内连续按十下“体检”，只会生成一个任务，不会重复消耗 Gemini Tokens。

## 3. Worker 隔离与重试机制 (Resiliency & Retry)

在 `ai-analysis.worker.ts` 我们使用 BullMQ 原生的配置来极大提高系统容错：

- `attempts: 3`: 网络抖动导致调用 Gemini 报错 500 时自动重试最多 3 次。
- `backoff: exponential`: 避退策略，每次重试的时间指数增长，防止密集请求触发更大的防御机制。

## 4. 死信队列 (Dead Letter Queue - DLQ)

通过 `removeOnFail: { age: 86400 }`。如果一个任务真的在重连三次后依然失败（比如：客户撤销了 FB 授权或者欠费），它将被扔到 Redis 里的 Failed 集合中停留 24 小时。方便运营排查错误详情并一键重跑失败队列。

## 5. Rate Limit 协调与高并发优化 (Throttling)

Vercel 并发量极大，一次发起 100个 Meta HTTP 拉取请求势必会触发 429 配额锁死：

- Worker 配置了 `concurrency: 5` (AI 大模型 并发上限)、`concurrency: 10` (Meta API 并发上限)。
- **跨机器的流控限制 (Limiter)**：即使你启用了 3 个 Worker 容器，BullMQ 配置的 `limiter: { max: 10, duration: 60000 }` 将强行接管，实现 **“全宇宙一分钟最多发 10 笔诊断”**，直接从源头解决 Rate Limit 烦恼。

## 6. Vercel 兼容性考量

BullMQ 本质上是一套寄生于 Redis 的常驻内存程序。
**渐进式重构方案**：

- Vercel 负责通过 `/api/async/sync` 生成任务并 push 到 Upstash/Redis（由于不需要等结果，Vercel 接口会在 200 毫秒极速返回 202 Accepted 释放计算资源）。
- **真正的 Worker 层**可以单独部署在 Render/Railway 上的免费/5$ 小 Node 环境（永不休眠，永不超时）。
- **前端感知**：通过 WebSocket 或者轮询前端 `/api/jobs/:id/status` 查看完成进度。

## 7. Webhook 与 Cron 架构 (调度系统)

使用 Vercel Cron 或者 GitHub Actions 作为系统的**心脏起搏器**：
每天晚上 02:00，调用网关 webhook `/api/cron/daily-sync`。
网关不执行耗时计算，它唯一的任务是从 Postgres 里取出全网 `Status=ACTIVE` 的 50 个广告账户的 AccountID，全部打进 `meta-sync-queue` 队列。剩下的脏活交给背后慢慢消化。
