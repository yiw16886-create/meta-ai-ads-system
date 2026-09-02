import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { getMetaToken, extractMetaError, evaluateActivityStatus, isUserFacebookConnected } from "../utils.js";

const router = Router();

router.get("/accounts", async (req: any, res) => {
  try {
    const { refresh } = req.query;
    const userId = req.user?.id;
    if (!userId) {
      return res.json({
        accounts: [],
        stats: { total: 0, active: 0, hasSpend: 0 }
      });
    }

    const isSuperAdmin = req.user?.role === "SUPER_ADMIN" || req.user?.role === "admin";

    // 1. Fetch persistent cache
    let cachedAccounts = await prisma.metaAccountMonitoring.findMany({
      include: { adAccount: true }
    });

    // If cache is empty, populate from existing AdAccounts in DB
    if (cachedAccounts.length === 0) {
      const dbAdAccounts = await prisma.adAccount.findMany();
      if (dbAdAccounts.length > 0) {
        for (const da of dbAdAccounts) {
          const cleanId = (da.fb_account_id || "").replace(/^act_/, "").trim();
          if (!cleanId) continue;
          try {
            await prisma.metaAccountMonitoring.upsert({
              where: { accountId: cleanId },
              update: {
                accountName: da.fb_account_name || cleanId,
                status: 1,
                activityStatus: da.activityStatus || 1,
              },
              create: {
                accountId: cleanId,
                accountName: da.fb_account_name || cleanId,
                status: 1,
                activityStatus: da.activityStatus || 1,
                spendCap: 0,
                amountSpent: 0,
                balance: 0,
                currency: "USD",
                timezone: "America/Los_Angeles"
              }
            });
          } catch (e) {}
        }
        cachedAccounts = await prisma.metaAccountMonitoring.findMany({
          include: { adAccount: true }
        });
      }
    }

    if (!isSuperAdmin) {
      cachedAccounts = cachedAccounts.filter(acc => {
        if (!acc.adAccount) return true;
        return acc.adAccount.userId === null || acc.adAccount.userId === Number(userId);
      });
    }

    // 2. If user specifically requested a force refresh, attempt Meta API sync with paginated fetching
    let syncWarning: string | null = null;
    let syncedCount = 0;
    if (refresh === "true") {
      const token = await getMetaToken(userId);
      if (token) {
        try {
          console.log("🔄 Starting paginated Meta Account Monitoring & Balance sync...");
          let url: string | null = "https://graph.facebook.com/v19.0/me/adaccounts";
          let params: any = {
            fields: "name,account_id,account_status,spend_cap,amount_spent,balance,currency,timezone_name",
            limit: 100,
            access_token: token,
          };

          const rawAccounts: any[] = [];
          while (url) {
            const accountsRes: any = await axios.get(url, {
              params,
              timeout: 25000,
            });

            const pageList = accountsRes.data?.data || [];
            rawAccounts.push(...pageList);

            if (accountsRes.data?.paging?.next) {
              url = accountsRes.data.paging.next;
              params = undefined; // URL already includes query params
            } else {
              url = null;
            }
          }

          syncedCount = rawAccounts.length;
          console.log(`✅ Successfully fetched ${syncedCount} ad accounts from Meta Graph API. Persisting to monitoring cache...`);

          if (rawAccounts.length > 0) {
            for (const acc of rawAccounts) {
              const cleanAccId = String(acc.account_id || "").replace(/^act_/, "").trim();
              if (!cleanAccId) continue;
              await prisma.metaAccountMonitoring.upsert({
                where: { accountId: cleanAccId },
                update: {
                  accountName: acc.name || cleanAccId,
                  status: acc.account_status,
                  spendCap: acc.spend_cap ? parseInt(acc.spend_cap, 10) / 100 : 0,
                  amountSpent: acc.amount_spent ? parseInt(acc.amount_spent, 10) / 100 : 0,
                  balance: acc.balance ? parseInt(acc.balance, 10) / 100 : 0,
                  currency: acc.currency || "USD",
                  timezone: acc.timezone_name || "America/Los_Angeles",
                },
                create: {
                  accountId: cleanAccId,
                  accountName: acc.name || cleanAccId,
                  status: acc.account_status,
                  spendCap: acc.spend_cap ? parseInt(acc.spend_cap, 10) / 100 : 0,
                  amountSpent: acc.amount_spent ? parseInt(acc.amount_spent, 10) / 100 : 0,
                  balance: acc.balance ? parseInt(acc.balance, 10) / 100 : 0,
                  currency: acc.currency || "USD",
                  timezone: acc.timezone_name || "America/Los_Angeles",
                }
              });
            }

            cachedAccounts = await prisma.metaAccountMonitoring.findMany({
              include: { adAccount: true }
            });
            if (!isSuperAdmin) {
              cachedAccounts = cachedAccounts.filter(acc => {
                if (!acc.adAccount) return true;
                return acc.adAccount.userId === null || acc.adAccount.userId === Number(userId);
              });
            }
          }
        } catch (apiErr: any) {
          const isTimeout = apiErr.code === "ECONNABORTED" || apiErr.message?.includes("timeout");
          syncWarning = isTimeout
            ? "Meta API 连接超时，已自动返回数据库缓存数据"
            : `Meta API 同步异常 (${apiErr.message})，已返回数据库缓存数据`;
          console.warn("⚠️ Meta API refresh status:", syncWarning);
        }
      }
    }

    const userAccountIds = cachedAccounts.map(acc => acc.accountId);
    const userAccountIdsVariants = Array.from(
      new Set(userAccountIds.flatMap(id => [id, `act_${id}`, id.replace(/^act_/, "")]))
    );

    // 3. Filter logic based on AdInsight (Last 30 days and 7 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const activeAccounts = await prisma.adInsight.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: userAccountIdsVariants },
        date: { gte: thirtyDaysAgoStr },
        spend: { gt: 0 }
      },
    });
    const activeAccountIds = new Set(
      activeAccounts.map(acc => acc.accountId.replace(/^act_/, ""))
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const weeklySpend = await prisma.adInsight.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: userAccountIdsVariants },
        date: { 
          gte: sevenDaysAgoStr,
          lt: todayStr // 排除今天，取过去 7 个完整自然日的数据
        }
      },
      _sum: {
        spend: true
      }
    });

    const weeklySpendMap = new Map<string, number>();
    weeklySpend.forEach(ws => {
      const cleanId = ws.accountId.replace(/^act_/, "");
      weeklySpendMap.set(cleanId, (ws._sum?.spend || 0) / 7);
    });

    // 4. Combine Cache + DB Insights
    const monitoringData = cachedAccounts.map((acc) => {
      const cleanAccountId = acc.accountId.replace(/^act_/, "");
      const avgDailySpend = weeklySpendMap.get(cleanAccountId) || 0;
      const hasSpendLast30Days = activeAccountIds.has(cleanAccountId);
      
      let realTimeBalance = 0;
      if (!acc.spendCap || acc.spendCap === 0) {
        realTimeBalance = Infinity;
      } else {
        // 可用余额 = 总限额 - 已花费
        realTimeBalance = acc.spendCap - (acc.amountSpent || 0);
        
        // 容错安全锁
        if (realTimeBalance < 0) realTimeBalance = 0;
      }
      
      let estimatedDays = null;
      if (avgDailySpend > 0) {
        if (realTimeBalance === Infinity) {
          estimatedDays = Infinity;
        } else {
          // 可用天数 = 实际可用余额 (actualBalance) / 七日均消 (avgDailySpend)
          estimatedDays = Math.round(realTimeBalance / avgDailySpend);
        }
      }

      let statusText = "异常";
      switch (acc.status) {
        case 1: statusText = "正常 (ACTIVE)"; break;
        case 2: statusText = "停用 (DISABLED)"; break;
        case 3: statusText = "待清退 (UNSETTLED)"; break;
        default: statusText = `异常 (${acc.status})`;
      }

      return {
        id: `act_${acc.accountId}`,
        accountId: acc.accountId,
        name: acc.accountName || `未命名 (${acc.accountId})`,
        accountStatus: acc.status,
        statusText,
        currency: acc.currency || "USD",
        spendCap: acc.spendCap || 0,
        amountSpent: acc.amountSpent || 0,
        balance: realTimeBalance,
        avgDailySpend,
        estimatedDays,
        usagePercent: (acc.spendCap || 0) > 0 ? ((acc.amountSpent || 0) / acc.spendCap!) * 100 : 0,
        timezone: acc.timezone,
        hasSpendLast30Days,
        lastUpdatedInCache: acc.updatedAt,
        activityStatus: 0
      };
    });

    // 计算最新的消耗记录时间以确定活跃标签 1(活跃)、2(一般)、5(超30天警告)、4(超60天/无消耗休眠)、3(停用)
    const latestSpendDates = await prisma.adInsight.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: userAccountIdsVariants },
        spend: { gt: 0 }
      },
      _max: {
        date: true
      }
    });

    const latestSpendMap = new Map<string, string>();
    latestSpendDates.forEach(r => {
      if (r._max?.date) {
        const cleanId = r.accountId.replace(/^act_/, "");
        latestSpendMap.set(cleanId, r._max.date);
      }
    });

    monitoringData.forEach(item => {
      const cleanId = item.accountId;
      (item as any).status = item.accountStatus; // preserve fbStatus

      const lastSpendDateStr = latestSpendMap.get(cleanId);
      if (lastSpendDateStr) {
        const d1 = new Date(lastSpendDateStr);
        const d2 = new Date();
        d1.setHours(0,0,0,0);
        d2.setHours(0,0,0,0);
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 30) {
          item.activityStatus = 1; // Green: Highly Active
        } else if (diffDays <= 60) {
          item.activityStatus = 2; // Blue: Active
        } else if (diffDays <= 90) {
          item.activityStatus = 3; // Orange: Warn
        } else {
          item.activityStatus = 4; // Gray: Dormant
        }
      } else {
        item.activityStatus = 4; // Dormant/No Spend ever
      }
    });

    // 异步在后台同步更新活跃度到数据库（非阻塞返回响应）
    setImmediate(async () => {
      try {
        const activeAdAccounts = await prisma.adAccount.findMany({
          where: isSuperAdmin ? {} : { userId: Number(userId) },
          select: { fb_account_id: true }
        });
        const activeAccountIdsInDb = new Set(activeAdAccounts.map(a => a.fb_account_id));
        
        for (const item of monitoringData) {
          try {
            await prisma.metaAccountMonitoring.update({
              where: { accountId: item.accountId },
              data: { 
                activityStatus: item.activityStatus,
                status: item.accountStatus
              }
            });
            if (activeAccountIdsInDb.has(item.accountId)) {
              await prisma.adAccount.update({
                where: { fb_account_id: item.accountId },
                data: { activityStatus: item.activityStatus }
              });
            }
          } catch (e) {}
        }
      } catch (e) {}
    });

    const filteredMonitoringData = monitoringData;

    // Provide structured JSON with accounts and stats
    res.json({
      accounts: filteredMonitoringData,
      warning: syncWarning,
      syncedCount,
      stats: {
        total: filteredMonitoringData.length,
        active: filteredMonitoringData.filter(a => a.accountStatus === 1).length,
        hasSpend: filteredMonitoringData.filter(a => a.hasSpendLast30Days).length
      }
    });
  } catch (error: any) {
    console.error("[Monitoring API] Error:", error.message);
    res.status(500).json({ error: error.message, accounts: [], stats: { total: 0, active: 0, hasSpend: 0 } });
  }
});

router.post("/accounts/:accountId/reset", async (req: any, res) => {
  const { accountId } = req.params;
  try {
    const token = await getMetaToken(req.user?.id);
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    const cleanAccId = accountId.replace("act_", "").trim();

    // Meta API: POST act_{id}?spend_cap_action=reset
    await axios.post(`https://graph.facebook.com/v19.0/act_${cleanAccId}`, null, {
      params: {
        spend_cap_action: "reset",
        access_token: token
      }
    });

    res.json({ success: true, message: "限额已成功重置" });
  } catch (error: any) {
    console.error(`[Reset Cap] Failed for ${accountId}:`, error.response?.data || error.message);
    res.json({ error: extractMetaError(error) });
  }
});

export default router;