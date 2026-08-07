import { Router } from "express";
import prisma from "../../db/index.js";
import { getProductIntelligence } from "../services/product-intelligence.service.js";
import { getCreativeIntelligence } from "../services/creative-intelligence.service.js";
import { attributePurchases } from "../services/attribution.service.js";
import { aggregateData } from "../services/aggregation.service.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/products", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await getProductIntelligence(startDate as string, endDate as string);
    res.json(data);
  } catch (error: any) {
    res.json({ error: "Failed to fetch product intelligence", details: error.message });
  }
});

router.get("/creatives", async (req, res) => {
  const { startDate, endDate, storeFilter } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await getCreativeIntelligence(startDate as string, endDate as string, storeFilter as string);
    
    // Set headers for chunked streaming response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write('[\n');
    for (let i = 0; i < data.length; i++) {
      res.write(JSON.stringify(data[i]));
      if (i < data.length - 1) {
        res.write(',\n');
      }
    }
    res.write('\n]');
    res.end();
  } catch (error: any) {
    if (!res.headersSent) {
      res.json({ error: "Failed to fetch creative intelligence", details: error.message });
    } else {
      res.end();
    }
  }
});

router.get("/creatives/daily", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    // Return empty array since CreativePerformanceDaily is removed for re-development
    res.json([]);
  } catch (error: any) {
    res.json({ error: "Failed to fetch daily creative performance", details: error.message });
  }
});

// 获取素材趋势数据（供走势图使用）
router.get("/creatives/trends", authenticateJWT, async (req: any, res) => {
  try {
    const { startDate, endDate, storeFilter, metric = "spend" } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: "缺少日期参数" });
    }

    // 获取店铺关联的账户
    let accountFilter: any = {};
    if (storeFilter) {
      const mappings = await prisma.accountMapping.findMany({
        where: { 
          status: "ACTIVE",
          store: { name: { equals: storeFilter, mode: "insensitive" } }
        },
        select: { fbAccountId: true },
      });
      const accountIds = mappings.map(m => m.fbAccountId);
      if (accountIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      accountFilter = { accountId: { in: accountIds } };
    }

    // 按日期聚合广告表现数据
    const performances = await prisma.adPerformanceDaily.groupBy({
      by: ["date"],
      where: {
        date: { gte: startDate, lte: endDate },
        ...accountFilter,
      },
      _sum: {
        spend: true,
        impressions: true,
        clicks: true,
        purchases: true,
        purchaseValue: true,
      },
      orderBy: { date: "asc" },
    });

    // 格式化为趋势数据
    const trendData = performances.map(p => {
      const spend = p._sum.spend || 0;
      const revenue = p._sum.purchaseValue || 0;
      const clicks = p._sum.clicks || 0;
      const impressions = p._sum.impressions || 0;
      const purchases = p._sum.purchases || 0;

      let value = 0;
      switch (metric) {
        case "spend": value = Math.round(spend * 100) / 100; break;
        case "roas": value = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0; break;
        case "ctr": value = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0; break;
        case "purchases": value = purchases; break;
      }

      return {
        date: p.date,
        value,
        spend: Math.round(spend * 100) / 100,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        purchases,
      };
    });

    // 获取 Top 5 素材（按 ROAS 排序）
    const topPerformances = await prisma.adPerformanceDaily.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...accountFilter,
      },
      orderBy: { spend: "desc" },
      take: 100,
    });

    // 按 creativeId 聚合 Top 素材
    const creativeMap = new Map<string, { creativeId: string; spend: number; revenue: number; roas: number; name: string }>();
    for (const p of topPerformances) {
      if (!p.creativeId) continue;
      const existing = creativeMap.get(p.creativeId);
      if (existing) {
        existing.spend += p.spend;
        existing.revenue += p.purchaseValue;
      } else {
        creativeMap.set(p.creativeId, {
          creativeId: p.creativeId,
          spend: p.spend,
          revenue: p.purchaseValue,
          roas: 0,
          name: "",
        });
      }
    }

    // 获取素材名称
    const creativeIds = Array.from(creativeMap.keys());
    if (creativeIds.length > 0) {
      const creativeRecords = await prisma.adCreative.findMany({
        where: { creativeId: { in: creativeIds } },
        select: { creativeId: true, name: true },
      });
      for (const c of creativeRecords) {
        const entry = creativeMap.get(c.creativeId);
        if (entry) entry.name = c.name || c.creativeId;
      }
    }

    // 计算 ROAS 并排序
    const topCreatives = Array.from(creativeMap.values())
      .map(c => ({ ...c, roas: c.spend > 0 ? Math.round((c.revenue / c.spend) * 100) / 100 : 0 }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 5);

    // 将 Top 素材附加到最后一条趋势数据中（前端按需取用）
    if (trendData.length > 0) {
      trendData[trendData.length - 1] = {
        ...trendData[trendData.length - 1],
        topCreatives,
      } as any;
    }

    res.json({ success: true, data: trendData });
  } catch (error: any) {
    console.error("[Intelligence] 获取趋势数据失败:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/creatives/clear-metrics", async (req, res) => {
  try {
    // Return success immediately as table is now removed
    res.json({ success: true, message: "素材表现指标的所有数据已成功清除（底层数据表已彻底移除）" });
  } catch (error: any) {
    res.json({ error: "清除素材表现指标数据失败", details: error.message });
  }
});

router.post("/aggregate", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    await attributePurchases();
    const result = await aggregateData(startDate, endDate);
    res.json(result);
  } catch (error: any) {
    res.json({ error: "Failed to aggregate intelligence", details: error.message });
  }
});

export default router;
