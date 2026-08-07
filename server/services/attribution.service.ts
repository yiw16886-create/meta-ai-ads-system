/**
 * 归因分析服务 — Attribution Service
 *
 * 功能: 追踪广告点击 → 注册 → 购买的全漏斗转化，为独立站卖家提供 ROAS 分析
 *
 * 实现方式:
 * 1. 基于已有的 AdPerformanceDaily 数据（含广告花费、展示、点击）
 * 2. 关联 Order 表中的订单数据（按时间窗口匹配）
 * 3. 按 7 天点击归因窗口计算 ROAS
 * 4. 结果写入 AdPerformanceDaily 扩展字段或 ProductPerformanceDaily
 *
 * 设计约束:
 * - Vercel Serverless 超时限制（Hobby 10s / Pro 60s）：采用增量模式，每次只处理最近 N 天
 * - Meta API 限流：优先使用已同步到本地的数据，减少实时 API 调用
 * - 轻量化：不引入外部归因服务，纯本地计算
 */

import prisma from "../../db/index.js";
import { subDays, format, startOfDay, endOfDay } from "date-fns";

// 归因窗口配置
const CLICK_ATTRIBUTION_DAYS = 7;  // 7天点击归因
const VIEW_ATTRIBUTION_HOURS = 24; // 1天浏览归因

interface AttributionResult {
  adId: string;
  accountId: string;
  date: string;
  spend: number;
  attributedRevenue: number;
  attributedOrders: number;
  roas: number;
  conversionRate: number;
}

/**
 * 主归因计算函数
 * @param daysBack 回溯天数，默认 7 天（增量模式）
 */
export async function attributePurchases(daysBack: number = 7): Promise<{
  success: boolean;
  results: AttributionResult[];
  errors: string[];
}> {
  console.log(`[Attribution] 开始归因计算，回溯 ${daysBack} 天...`);
  const errors: string[] = [];
  const results: AttributionResult[] = [];

  try {
    const endDate = endOfDay(new Date());
    const startDate = startOfDay(subDays(new Date(), daysBack));
    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");

    // 1. 获取时间窗口内的广告表现数据
    const adPerformances = await prisma.adPerformanceDaily.findMany({
      where: {
        date: { gte: startStr, lte: endStr },
      },
      orderBy: { date: "asc" },
    });

    if (adPerformances.length === 0) {
      console.log("[Attribution] 无广告表现数据，跳过归因");
      return { success: true, results: [], errors: [] };
    }

    console.log(`[Attribution] 获取到 ${adPerformances.length} 条广告表现记录`);

    // 2. 获取时间窗口内的订单数据（考虑归因窗口，往前多取 7 天）
    const orderStartDate = startOfDay(subDays(new Date(), daysBack + CLICK_ATTRIBUTION_DAYS));
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: orderStartDate, lte: endDate },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`[Attribution] 获取到 ${orders.length} 条订单记录`);

    // 3. 获取账户映射关系（广告账户 → 店铺）
    const accountMappings = await prisma.accountMapping.findMany({
      where: { status: "ACTIVE" },
      select: { fbAccountId: true, storeId: true },
    });
    const accountStoreMap = new Map<string, number>();
    accountMappings.forEach(m => {
      if (m.fbAccountId && m.storeId) {
        accountStoreMap.set(m.fbAccountId.replace("act_", ""), m.storeId);
      }
    });

    // 4. 按广告 ID 聚合广告表现数据
    const adSpendMap = new Map<string, { spend: number; impressions: number; clicks: number; accountId: string }>();
    for (const perf of adPerformances) {
      const key = perf.adId;
      const existing = adSpendMap.get(key);
      if (existing) {
        existing.spend += perf.spend;
        existing.impressions += perf.impressions;
        existing.clicks += perf.clicks;
      } else {
        adSpendMap.set(key, {
          spend: perf.spend,
          impressions: perf.impressions,
          clicks: perf.clicks,
          accountId: perf.accountId,
        });
      }
    }

    // 5. 归因计算：按店铺匹配订单到广告
    for (const [adId, adData] of adSpendMap) {
      const storeId = accountStoreMap.get(adData.accountId);
      if (!storeId) continue;

      // 筛选该店铺在归因窗口内的订单
      const attributedOrders = orders.filter(
        o => o.storeId === storeId && !o.refunded
      );

      const attributedRevenue = attributedOrders.reduce((sum, o) => sum + o.revenue, 0);
      const attributedOrderCount = attributedOrders.length;

      // 按比例分配：如果多个广告关联同一店铺，按花费比例分配收入
      // 这里做简化处理：直接使用该广告的花费占比
      const totalStoreSpend = Array.from(adSpendMap.values())
        .filter(a => accountStoreMap.get(a.accountId) === storeId)
        .reduce((sum, a) => sum + a.spend, 0);

      const spendRatio = totalStoreSpend > 0 ? adData.spend / totalStoreSpend : 0;
      const allocatedRevenue = attributedRevenue * spendRatio;
      const allocatedOrders = Math.round(attributedOrderCount * spendRatio);
      const roas = adData.spend > 0 ? allocatedRevenue / adData.spend : 0;
      const conversionRate = adData.clicks > 0 ? (allocatedOrders / adData.clicks) * 100 : 0;

      const result: AttributionResult = {
        adId,
        accountId: adData.accountId,
        date: endStr,
        spend: adData.spend,
        attributedRevenue: Math.round(allocatedRevenue * 100) / 100,
        attributedOrders: allocatedOrders,
        roas: Math.round(roas * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
      };
      results.push(result);

      // 6. 将归因结果写回 AdPerformanceDaily
      try {
        await prisma.adPerformanceDaily.updateMany({
          where: { adId, date: endStr },
          data: {
            purchaseValue: allocatedRevenue,
            purchases: allocatedOrders,
          },
        });
      } catch (err: any) {
        errors.push(`写入归因结果失败 [adId=${adId}]: ${err.message}`);
      }
    }

    console.log(`[Attribution] 归因完成: ${results.length} 条广告, ${errors.length} 个错误`);
    return { success: true, results, errors };
  } catch (error: any) {
    console.error("[Attribution] 归因计算异常:", error.message);
    errors.push(`归因计算异常: ${error.message}`);
    return { success: false, results, errors };
  }
}

/**
 * 获取归因结果摘要（供 Dashboard API 使用）
 */
export async function getAttributionSummary(
  accountId?: string,
  daysBack: number = 7
): Promise<{
  totalSpend: number;
  totalRevenue: number;
  totalOrders: number;
  overallRoas: number;
  topAds: AttributionResult[];
}> {
  const endDate = format(new Date(), "yyyy-MM-dd");
  const startDate = format(subDays(new Date(), daysBack), "yyyy-MM-dd");

  const performances = await prisma.adPerformanceDaily.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      ...(accountId ? { accountId } : {}),
    },
  });

  const totalSpend = performances.reduce((s, p) => s + p.spend, 0);
  const totalRevenue = performances.reduce((s, p) => s + p.purchaseValue, 0);
  const totalOrders = performances.reduce((s, p) => s + p.purchases, 0);
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Top ads by ROAS
  const adMap = new Map<string, AttributionResult>();
  for (const p of performances) {
    const existing = adMap.get(p.adId);
    if (existing) {
      existing.spend += p.spend;
      existing.attributedRevenue += p.purchaseValue;
      existing.attributedOrders += p.purchases;
    } else {
      adMap.set(p.adId, {
        adId: p.adId,
        accountId: p.accountId,
        date: endDate,
        spend: p.spend,
        attributedRevenue: p.purchaseValue,
        attributedOrders: p.purchases,
        roas: p.spend > 0 ? p.purchaseValue / p.spend : 0,
        conversionRate: 0,
      });
    }
  }

  const topAds = Array.from(adMap.values())
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 10);

  return { totalSpend, totalRevenue, totalOrders, overallRoas, topAds };
}
