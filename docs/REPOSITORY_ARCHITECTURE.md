# Repository Layer 重构指南

本指南详述了我们如何将原先耦合在 `service` 层的 Prisma 数据操作，彻底下沉到 `api/repositories` 层。这是一种经典的企业级架构模式（Data Access Object / Repository Pattern）。

## 1. 新的目录结构 (Directory Structure)

```text
api/
├── repositories/                  # ▼ NEW: 数据访问层 (Repository)
│   ├── ad-account.repository.ts   # 广告账户 CRUD
│   ├── ad.repository.ts           # 广告维度 CRUD (待完善 Schema)
│   ├── adset.repository.ts        # 广告组维度 CRUD (待完善 Schema)
│   ├── campaign.repository.ts     # 计划维度 CRUD (待完善 Schema)
│   ├── insight.repository.ts      # 跑量数据/消耗指标 CRUD (已完成)
│   └── sync-log.repository.ts     # 同步日志追踪 CRUD (待完善 Schema)
├── services/                      # ▲ 业务逻辑层 (纯粹的组装与计算)
│   ├── meta/meta.service.ts
│   └── sync/sync.service.ts
└── db/
    └── prisma.ts                  # 全局唯一的 Prisma Client (防止Vercel连接池耗尽)
```

## 2. 职责划分 (Responsibilities)

### Repository 层的职责：

1. **隔离数据库细节**: 它是全系统**唯一**允许 `import { prisma }` 的地方。
2. **复用查询逻辑**: 像 `findActiveAccounts()`、`getDashboardMetrics()` 这种查询，前端路由、AI 分析引擎、数据同步引擎可能都会用到。放在 Repo 层避免了到处复制 `prisma.xxx.findMany()`。
3. **隔离事务与批量写入**: 把所有 `prisma.$transaction([])` 的逻辑放在这里，方便统一添加重试及连接状态捕捉。

### Service 层的约束 (最佳实践)：

1. **禁止导入 Prisma**: 你将不会在任何 `service.ts` 里看到 `prisma.adInsight.create`。
2. **纯粹的“组装厂”**: Service 层调用 `fetchDataFromMeta()`, 然后把原始数据洗成符合数据库 Schema 的 Array/Object，最后传递给 `Repository.batchUpsert(data)`。
3. **缓存(Redis)拦截的最佳地点**: 如果未来加上 Redis 组件，是在 **Service** 里包夹 **Repository**。比如：`const data = await redis.get() || await InsightRepo.get(); redis.set(data)`。

## 3. 调用关系流转示例 (Service -> Repository)

之前在 `sync.service.ts` 里是这么写的（错误示范）：

```ts
// ❌ 错误示范：在 for 循环里发请求，还顺便把 Prisma Upsert 操作写在一起
for (const day of insights) {
  await prisma.adInsight.upsert({ ... })
}
```

改造后的流程（高并发安全、解耦）：

```ts
// ✅ 正确示范：在 api/services/sync/sync.service.ts
const insightsToUpsert = [];
for (const day of metaInsights) {
  insightsToUpsert.push({
    accountId: day.accountId,
    roas: day.purchase_roas,
  }); // 仅仅是组装待写入列表
}
// 传递给仓库层，一次性写库
await InsightRepository.batchUpsertInsights(insightsToUpsert);
```

```ts
// ✅ 正确示范：在 api/repositories/insight.repository.ts (专门处理并发)
static async batchUpsertInsights(insightsData: Prisma.AdInsightCreateInput[]) {
  // 利用 Vercel 并发连接友好的 interactive transaction
  return prisma.$transaction(
    insightsData.map((data) =>
      prisma.adInsight.upsert({
         where: { accountId_date: { accountId: data.accountId, ... } },
         update: data,
         create: data,
      })
    )
  );
}
```

## 4. Prisma 事务与批量写入在高并发下的最佳实践

**面临的挑战**:
在 Vercel (Serverless) 环境下，同时同步 10 个账户的每天数据，在高峰期会同时产生数百个并发 `INSERT/UPDATE` sql 语句，迅速打满 Neon PostgreSQL 的最大连接数 (50-100)，直接报 `connection pool saturated` 错误。

**解决方案**:

1. **`prisma.$transaction` 结合 `map`（见 `batchUpsertInsights`）**: 这是将多次通讯成本优化成一次通讯的终极手法。所有的 `upsert` 会打包发给 PgBouncer 并在一个逻辑连接内原子化执行。如果报错，全部回滚，保证脏数据不入库。
2. **不要滥用 `createMany`**: 因为我们从 Facebook 拉回的数据可能包含过去数天的纠正归因数据，必定会有重复主键。`createMany` (如果开启 skipDuplicates) 无法更新字段，所以必须继续使用打包好的事务 `upsert`。
3. **未来 BullMQ 兼容**: 当以后我们将这个任务放到 Render 上的独立 Node Worker 去跑 BullMQ 时，配合 Repository 层，Worker 可以非常精确地掌控 `Concurrency=5`。由于没有 Vercel 的超时倒计时，加上这层批处理设计，百万行级别的数据同步也会稳如磐石。
