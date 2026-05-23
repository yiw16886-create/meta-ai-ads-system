# Meta API 同步体系重构指南 (Route B)

本指南详述了我们如何将原先耦合在 `server.ts` 内部极其危险的同步循环拉取动作，重构为符合 **高可用、容错、可扩展、Vercel兼容** 的企业级同步架构。

## 1. 全新 `services/meta` 与 `services/sync` 目录结构

摒弃 axios inline fetching，采用封装良好的 HTTP Client 拦截器与 Service 双层架构：

```text
api/services/
├── meta/
│   ├── meta.client.ts     // (Core) 拦截器：负责 Error Retry 和 Rate Limit Check
│   └── meta.service.ts    // (Business) 组装 Facebook Graph URL，提供 Cursor 翻页
└── sync/
    └── sync.service.ts    // (Orchestrator) 调用 MetaService 获取数据并写 Prisma Upsert
```

## 2. 错误重试 (Error Retry Mechanism)

由于网络波动或 Graph API 临时 502/503 异常常常导致整个同步链条中断。
在 `meta.client.ts` 中，我们集成了 **Exponential Backoff 重试机制**：

- **最大重试次数**: `MAX_RETRIES = 3`
- **延时策略**: 若为 429 (Rate Limit) 或网络断开，则采用 `2000ms * 2^retryCount` 的指数避退策略；
- **无感重试**: 这对上层 `sync.service.ts` 完全透明，开发者无需再手写冗繁的 `try/catch + setTimeout`。

## 3. 限流保护 (Rate Limit Handling)

Meta (Facebook) API 采用动态配额系统 (Business Use Case Usage)。
传统的应对方式是“遇到 429 再说”，这往往导致整个应用被锁很长时间。

我们在 `meta.client.ts` 的 Axios Response Interceptor 中加入了 **主动预警机制**：

1. 请求返回时自动提取 Header: `x-business-use-case-usage`。
2. 解析 `call_count`, `total_cputime`, `total_time`。
3. 一旦探测到配额消耗 > 80%，触发警报。
4. **【未来兼容】**：可在此时将 `{accountId}` 写入 Redis 黑名单 TTL 5分钟，强行切断 Worker 对于该账号的读取，完美规避 429。

## 4. Vercel-Compatible 的同步任务拆分方案

Vercel Hobby 存在 10s 超时，Pro 存在 300s 超时 (且占用长连接极其昂贵)。如果使用早前的 `for` 循环遍历所有广告账户同步数据，必然宕机。

**现在的拆分解耦方案：颗粒化隔离**
我们重构了 `SyncService.syncAccountInsights(accountId, startDate, endDate)`，这使得同步的最小粒度被局限在**单一 Account** 内。

- **短期方案 (现已实现):** `/api/sync` 将多账号列表分块为 `chunkSize = 3` 的数组矩阵，使用 `Promise.allSettled` 并行消化，极大压缩了原有的串行耗时。
- **降级 Vercel 超时:** 通过在 `meta.service.ts` 强行覆盖 `fields` 拉取最必要的列，以及设置 `limit: 50`。防止单账户多天数拉出几十 M 体积的 JSON 将 Vercel 实例内存撑爆。

## 5. BullMQ 未来的异步架构兼容 (Task Queue Ready)

现在的 `syncAccountInsights` 已经是一个“纯粹的无状态 Worker Function”。
这意味着在将来上马 BullMQ 之后，**一行后端核心代码都不需要改**！

**未来的扩展流程如下**：

1. **Producer 层**: 触发 Cron 时，网关遍历 50 个 Store，向 Render/Railway 上的 Redis 丢入 500 个 JSON Message (Job): `{"type": "SYNC_ACCOUNT", "payload": {"accountId": "123", "since": "2024-01-01"}}`。
2. **Consumer 层**: 你编写一个单独的 Worker 文件，监听该 BullMQ Channel。
3. **Task Execution**:
   ```ts
   // /worker/syncWorker.ts
   worker.process(async (job) => {
     // 直接复用现成的底层方法！
     await SyncService.syncAccountInsights(
       job.data.accountId,
       token,
       job.data.dateRange,
     );
   });
   ```
4. 取代原来的阻塞响应，接口只回复: `{"message": "Sync jobs queued."}`

## 6. TypeScript & Prisma 优化

我们已经在 `SyncService` 内部构建了基于 Prisma `upsert` 的严格更新机制：

```ts
await prisma.adInsight.upsert({
  where: { accountId_date: { accountId, date } },
  update: { ...newData },
  create: { accountId, date, ...newData },
});
```

这种幂等设计 (Idempotent) 保证了即便由于 Vercel 发起重试，或是未来通过 BullMQ 并发消费，**也不会引发重复插入或主键冲突崩溃**。
