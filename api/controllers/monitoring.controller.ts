import { Request, Response, NextFunction } from "express";
import axios from "axios";
import prisma from "../db.js";
import { getMetaToken, extractMetaError } from "../utils.js";

export class MonitoringController {
  static async listMonitoringAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refresh } = req.query;
      const token = await getMetaToken();
      if (!token) {
        res.status(400).json({ error: "Meta Token 未配置" });
        return;
      }

      // 1. Fetch persistent cache or refresh if requested
      let cachedAccounts = await prisma.metaAccountMonitoring.findMany();
      
      if (refresh === "true" || cachedAccounts.length === 0) {
        console.log("🔄 Refreshing Meta Account Monitoring data from API...");
        const accountsRes = await axios.get(`https://graph.facebook.com/v22.0/me/adaccounts`, {
          params: {
            fields: "name,account_id,account_status,spend_cap,amount_spent,balance,currency,timezone_name",
            limit: 500,
            access_token: token,
          },
        });

        const rawAccounts = accountsRes.data.data || [];
        
        // Update DB Cache in transaction
        await prisma.$transaction(
          rawAccounts.map((acc: any) => 
            prisma.metaAccountMonitoring.upsert({
              where: { accountId: acc.account_id },
              update: {
                accountName: acc.name,
                status: acc.account_status,
                spendCap: acc.spend_cap ? parseInt(acc.spend_cap, 10) / 100 : 0,
                amountSpent: acc.amount_spent ? parseInt(acc.amount_spent, 10) / 100 : 0,
                balance: acc.balance ? parseInt(acc.balance, 10) / 100 : 0,
                currency: acc.currency,
                timezone: acc.timezone_name,
              },
              create: {
                accountId: acc.account_id,
                accountName: acc.name,
                status: acc.account_status,
                spendCap: acc.spend_cap ? parseInt(acc.spend_cap, 10) / 100 : 0,
                amountSpent: acc.amount_spent ? parseInt(acc.amount_spent, 10) / 100 : 0,
                balance: acc.balance ? parseInt(acc.balance, 10) / 100 : 0,
                currency: acc.currency,
                timezone: acc.timezone_name,
              }
            })
          )
        );
        
        cachedAccounts = await prisma.metaAccountMonitoring.findMany();
      }

      // 2. Filter logic based on AdInsight (Last 30 days and 7 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const activeAccounts = await prisma.adInsight.groupBy({
        by: ["accountId"],
        where: {
          date: { gte: thirtyDaysAgoStr },
          spend: { gt: 0 }
        },
      });
      const activeAccountIds = activeAccounts.map(acc => acc.accountId);

      const todayStr = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const weeklySpend = await prisma.adInsight.groupBy({
        by: ["accountId"],
        where: {
          date: { 
            gte: sevenDaysAgoStr,
            lt: todayStr // 排除今天，取过去 7 个完整自然日的数据
          }
        },
        _sum: {
          spend: true
        }
      });

      const weeklySpendMap = new Map();
      weeklySpend.forEach(ws => {
        weeklySpendMap.set(ws.accountId, (ws._sum.spend || 0) / 7);
      });

      // 3. Combine Cache + DB Insights
      const monitoringData = cachedAccounts.map((acc) => {
        const avgDailySpend = weeklySpendMap.get(acc.accountId) || 0;
        const hasSpendLast30Days = activeAccountIds.includes(acc.accountId);
        
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

      const adAccounts = await prisma.adAccount.findMany({ select: { fb_account_id: true, activityStatus: true } });
      const activityMap = new Map();
      adAccounts.forEach(a => activityMap.set(a.fb_account_id, a.activityStatus));
      
      monitoringData.forEach(item => {
         item.activityStatus = activityMap.get(item.accountId) || 2;
      });

      res.json({
        accounts: monitoringData,
        stats: {
          total: monitoringData.length,
          active: monitoringData.filter(a => a.accountStatus === 1).length,
          hasSpend: monitoringData.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { accountId } = req.params;
    try {
      const token = await getMetaToken();
      if (!token) {
        res.status(400).json({ error: "Meta Token 未配置" });
        return;
      }

      // Meta API: POST act_{id}?spend_cap_action=reset
      await axios.post(`https://graph.facebook.com/v22.0/act_${accountId}`, null, {
        params: {
          spend_cap_action: "reset",
          access_token: token
        }
      });

      res.json({ success: true, message: "限额已成功重置" });
    } catch (error: any) {
      console.error(`[Reset Cap] Failed for ${accountId}:`, error.response?.data || error.message);
      res.status(500).json({ error: extractMetaError(error) });
    }
  }
}
