import prisma from "../../db/index.js";

export interface DailyInsightPayload {
  accountId: string;
  date: string;
  accountName?: string;
  reach?: number;
  impressions?: number;
  clicks?: number;
  spend?: number;
  addToCart?: number;
  initiateCheckout?: number;
  purchases?: number;
  purchaseValue?: number;
}

/**
 * 重构数据落库逻辑：按 (accountId, date) 唯一键覆写
 * UNIQUE(accountId, date) 严格覆写（禁止使用 += 累加更新）
 */
export async function upsertDailyInsightRecord(payload: DailyInsightPayload) {
  const cleanAccountId = payload.accountId.replace("act_", "").trim();
  const date = payload.date;
  const accountName = payload.accountName || `Account ${cleanAccountId}`;

  const reach = payload.reach || 0;
  const impressions = payload.impressions || 0;
  const clicks = payload.clicks || 0;
  const spend = payload.spend || 0;
  const addToCart = payload.addToCart || 0;
  const initiateCheckout = payload.initiateCheckout || 0;
  const purchases = payload.purchases || 0;
  const purchaseValue = payload.purchaseValue || 0;

  const cpc = clicks > 0 ? spend / clicks : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const atcRate = clicks > 0 ? (addToCart / clicks) * 100 : 0;
  const checkoutRate = clicks > 0 ? (initiateCheckout / clicks) * 100 : 0;
  const cpp = purchases > 0 ? spend / purchases : 0;
  const roas = spend > 0 ? purchaseValue / spend : 0;

  const recordData = {
    accountName,
    reach,
    impressions,
    clicks,
    spend,
    addToCart,
    initiateCheckout,
    purchases,
    purchaseValue,
    cpc,
    ctr,
    atcRate,
    checkoutRate,
    cpp,
    roas,
    updatedAt: new Date(),
  };

  // 唯一复合索引: accountId_date
  return await prisma.adInsight.upsert({
    where: {
      accountId_date: {
        accountId: cleanAccountId,
        date: date,
      },
    },
    update: recordData,
    create: {
      accountId: cleanAccountId,
      date: date,
      ...recordData,
    },
  });
}

/**
 * 批量同步落库（循环单天数据并覆写）
 */
export async function batchUpsertDailyInsights(insights: DailyInsightPayload[]) {
  let count = 0;
  for (const item of insights) {
    if (item.accountId && item.date) {
      await upsertDailyInsightRecord(item);
      count++;
    }
  }
  return count;
}

/**
 * 重置脏数据清理
 */
export async function cleanDirtyInsightsData() {
  console.log("🧹 [Clean Data] Truncating dirty AdInsight records...");
  const result = await prisma.adInsight.deleteMany({});
  console.log(`🧹 [Clean Data] Cleared ${result.count} records from AdInsight.`);
  return result;
}
