import { Router } from "express";
import prisma from "../../db/index.js";
import { cleanDirtyInsightsData } from "../services/syncService.js";
import { getMetaToken, syncSingleAccountAdData } from "../utils.js";

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

    const userAccounts = await prisma.adAccount.findMany({
      where: { userId },
      select: { fb_account_id: true }
    });
    const userAccountIds = userAccounts.map(a => a.fb_account_id.replace("act_", "").trim());

    if (userAccountIds.length === 0) {
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
          where: { storeId: parsedStoreId, userId },
          select: { fb_account_id: true }
        });
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
  try {
    const { resync, startDate, endDate } = req.body || {};
    const deleteResult = await cleanDirtyInsightsData();

    let reSyncedAccounts = 0;

    if (resync) {
      const token = await getMetaToken(req.user?.id);
      if (token) {
        const mappings = await prisma.accountMapping.findMany({
          select: { fbAccountId: true }
        });

        const sDate = startDate || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
        const eDate = endDate || new Date().toISOString().split("T")[0];

        for (const m of mappings) {
          if (m.fbAccountId) {
            try {
              await syncSingleAccountAdData(m.fbAccountId, sDate, eDate, token);
              reSyncedAccounts++;
            } catch (syncErr: any) {
              console.warn(`[Clean & Resync] Failed for account ${m.fbAccountId}:`, syncErr.message);
            }
          }
        }
      }
    }

    res.json({
      success: true,
      message: "脏数据清理成功！",
      deletedRecords: deleteResult.count,
      reSyncedAccounts
    });
  } catch (error: any) {
    console.error("Clean dirty data error:", error);
    res.json({ success: false, message: error?.message });
  }
});

export default router;
