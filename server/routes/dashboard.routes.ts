import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

/**
 * GET /api/dashboard/stats
 * 修复看板 API 的日期过滤与聚合查询 (SUM)
 */
router.get("/stats", async (req: any, res) => {
  const { startDate, endDate, accountId, storeId } = req.query;

  try {
    const userId = req.user?.id ? Number(req.user.id) : null;
    if (!userId) {
      return res.json({
        success: true,
        summary: { grandSpend: 0, grandRevenue: 0, grandImpressions: 0, grandClicks: 0, grandPurchases: 0, grandAddToCart: 0, grandInitiateCheckout: 0, grandRoas: 0 },
        accounts: []
      });
    }

    const sDate = startDate ? String(startDate).slice(0, 10) : undefined;
    const eDate = endDate ? String(endDate).slice(0, 10) : undefined;

    const isSuperAdmin = req.user?.role === "SUPER_ADMIN";
    
    const userAccounts = await prisma.adAccount.findMany({
      ...(isSuperAdmin ? {} : { where: { OR: [{ userId }, { userId: null }] } }),
      select: { fb_account_id: true }
    });
    const mappings = await prisma.accountMapping.findMany({
      ...(isSuperAdmin ? {} : { where: { OR: [{ userId }, { userId: null }] } }),
      select: { fbAccountId: true }
    });

    const accountSet = new Set<string>();
    userAccounts.forEach(a => accountSet.add(a.fb_account_id.replace("act_", "").trim()));
    mappings.forEach(m => accountSet.add(String(m.fbAccountId).replace("act_", "").trim()));

    const userAccountIds = Array.from(accountSet);

    if (!isSuperAdmin && userAccountIds.length === 0) {
      return res.json({
        success: true,
        summary: { grandSpend: 0, grandRevenue: 0, grandImpressions: 0, grandClicks: 0, grandPurchases: 0, grandAddToCart: 0, grandInitiateCheckout: 0, grandRoas: 0 },
        accounts: []
      });
    }

    const whereClause: any = {};

    if (sDate || eDate) {
      whereClause.date = {};
      if (sDate) whereClause.date.gte = sDate;
      if (eDate) whereClause.date.lte = eDate;
    }

    if (accountId) {
      const cleanAccId = String(accountId).replace("act_", "").trim();
      if (userAccountIds.includes(cleanAccId)) {
        whereClause.accountId = cleanAccId;
      } else {
        return res.json({
          success: true,
          summary: { grandSpend: 0, grandRevenue: 0, grandImpressions: 0, grandClicks: 0, grandPurchases: 0, grandAddToCart: 0, grandInitiateCheckout: 0, grandRoas: 0 },
          accounts: []
        });
      }
    } else if (storeId) {
      const parsedStoreId = parseInt(String(storeId), 10);
      if (!isNaN(parsedStoreId)) {
        const storeAccounts = await prisma.adAccount.findMany({
          where: isSuperAdmin ? { storeId: parsedStoreId } : { storeId: parsedStoreId, OR: [{ userId }, { userId: null }] },
          select: { fb_account_id: true }
        });
        const storeMappings = await prisma.accountMapping.findMany({
          where: isSuperAdmin ? { storeId: parsedStoreId } : { storeId: parsedStoreId, OR: [{ userId }, { userId: null }] },
          select: { fbAccountId: true }
        });
        storeMappings.forEach(m => storeAccounts.push({ fb_account_id: m.fbAccountId }));
        const accIds = storeAccounts.map(a => a.fb_account_id.replace("act_", "").trim());
        whereClause.accountId = { in: accIds };
      } else {
        whereClause.accountId = { in: userAccountIds };
      }
    } else {
      whereClause.accountId = { in: userAccountIds };
    }

    // 可以在 Prisma findMany 后按 accountId 进行 SUM 统计，或者用 prisma.adInsight.groupBy
    const rawInsights = await prisma.adInsight.findMany({
      where: whereClause,
      orderBy: { date: "asc" }
    });

    const accountAggregates: Record<string, {
      accountId: string;
      accountName: string;
      totalSpend: number;
      totalRevenue: number;
      totalImpressions: number;
      totalClicks: number;
      totalPurchases: number;
      totalAddToCart: number;
      totalInitiateCheckout: number;
    }> = {};

    let grandSpend = 0;
    let grandRevenue = 0;
    let grandImpressions = 0;
    let grandClicks = 0;
    let grandPurchases = 0;

    for (const row of rawInsights) {
      const accId = row.accountId;
      if (!accountAggregates[accId]) {
        accountAggregates[accId] = {
          accountId: accId,
          accountName: row.accountName || `Account ${accId}`,
          totalSpend: 0,
          totalRevenue: 0,
          totalImpressions: 0,
          totalClicks: 0,
          totalPurchases: 0,
          totalAddToCart: 0,
          totalInitiateCheckout: 0,
        };
      }

      const agg = accountAggregates[accId];
      agg.totalSpend += row.spend || 0;
      agg.totalRevenue += row.purchaseValue || 0;
      agg.totalImpressions += row.impressions || 0;
      agg.totalClicks += row.clicks || 0;
      agg.totalPurchases += row.purchases || 0;
      agg.totalAddToCart += row.addToCart || 0;
      agg.totalInitiateCheckout += row.initiateCheckout || 0;

      grandSpend += row.spend || 0;
      grandRevenue += row.purchaseValue || 0;
      grandImpressions += row.impressions || 0;
      grandClicks += row.clicks || 0;
      grandPurchases += row.purchases || 0;
    }

    const accountList = Object.values(accountAggregates).map(a => ({
      ...a,
      roas: a.totalSpend > 0 ? a.totalRevenue / a.totalSpend : 0,
      cpc: a.totalClicks > 0 ? a.totalSpend / a.totalClicks : 0,
      ctr: a.totalImpressions > 0 ? (a.totalClicks / a.totalImpressions) * 100 : 0,
    }));

    const summary = {
      totalSpend: grandSpend,
      totalRevenue: grandRevenue,
      totalImpressions: grandImpressions,
      totalClicks: grandClicks,
      totalPurchases: grandPurchases,
      totalROAS: grandSpend > 0 ? grandRevenue / grandSpend : 0,
      cpc: grandClicks > 0 ? grandSpend / grandClicks : 0,
      ctr: grandImpressions > 0 ? (grandClicks / grandImpressions) * 100 : 0,
      dateRange: { startDate: sDate, endDate: eDate },
    };

    res.json({
      summary,
      accounts: accountList,
      dailyInsights: rawInsights,
    });
  } catch (error: any) {
    console.error("Dashboard stats error:", error);
    res.json({
      summary: { spend: 0, revenue: 0, roas: 0, conversions: 0 },
      accounts: [],
      stores: []
    });
  }
});

/**
 * POST /api/dashboard/clean-dirty-data
 * 重置脏数据清理 & 重新触发同步
 */
router.post("/clean-dirty-data", async (req: any, res) => {
  return res.status(410).json({
    success: false,
    error: "该全表清理接口已停用",
    details: "请使用 /api/settings/cleanup-dirty-data 的预览与确认批次流程。",
  });
});

export default router;
