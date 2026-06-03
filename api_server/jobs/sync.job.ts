import cron from "node-cron";
import axios from "axios";
import { format, subDays } from "date-fns";
import prisma from "../db";
import { getMetaToken, evaluateActivityStatus, syncSingleAccountAdData } from "../utils";
import { aggregateData } from "../services/aggregation.service";
import { attributePurchases } from '../services/attribution-calc.service';

// -- SCHEDULE JOBS --
export function initCronJobs(): void {
  // Run daily aggregation at 2:00 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("Triggering daily aggregation job via cron...");
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];
      await attributePurchases();
      await aggregateData(dateStr, dateStr);
    } catch (error) {
      console.error("Daily aggregation job failed:", error);
    }
  });

  // Start background auto-sync loop (every 2 hours)
  const intervalMs = 2 * 60 * 60 * 1000;
  setInterval(runBackgroundSync, intervalMs);
  console.log("[后台任务] 已开启自动同步，频率: 每 2 小时");
}

export async function runBackgroundSync(): Promise<void> {
  const syncId = format(new Date(), "HH:mm:ss");
  console.log(`[后台同步 | ${syncId}] 🔄 开始后台静默同步: 过去 30 定时数据...`);

  try {
    const token = await getMetaToken();
    if (!token) {
      console.log(`[后台同步 | ${syncId}] ⚠️ 同步中止: Meta Token 未配置`);
      return;
    }

    const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    // 1. 获取账户列表
    let accountsRes;
    try {
      accountsRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/adaccounts`,
        {
          params: {
            fields: "name,account_id,account_status",
            limit: 1000,
            access_token: token,
          },
        },
      );
    } catch (apiErr: any) {
      const status = apiErr.response?.status;
      if (status >= 500) {
        console.warn(
          `[后台同步 | ${syncId}] ⚠️ Meta API 服务端暂时不可用 (${status})，将在下次同步重试。`,
        );
        return;
      }
      throw apiErr;
    }

    // 获取系统的停用账户 ID 且常态过滤 dormant/限制账户
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);
    const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];

    // 只排除 dormant 的广告账户
    const accounts = (accountsRes.data.data || []).filter(
      (a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        const isDormant = DORMANT_ACCOUNT_IDS.includes(rawId);
        return !isDormant;
      }
    );
    const totalAccounts = accounts.length;
    console.log(
      `[后台同步 | ${syncId}] 📂 发现 ${totalAccounts} 个有效广告账户，开始分批抓取...`,
    );

    // 2. 分批处理 (5个一组)
    const chunkSize = 5;
    let syncedCount = 0;

    for (let i = 0; i < accounts.length; i += chunkSize) {
      const chunk = accounts.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (account: any) => {
          const accountId = account.account_id || account.id;
          try {
            const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token);
            if (activityStatus <= 4) {
               await syncSingleAccountAdData(accountId, startDate, endDate, token);
            } else {
               console.log(`[后台同步 | ${syncId}] ⏭️ 跳过账户 ${accountId} (活跃度: ${activityStatus})`);
            }
            syncedCount++;
            if (syncedCount % 10 === 0 || syncedCount === totalAccounts) {
              console.log(
                `[后台同步 | ${syncId}] 📈 进度: ${syncedCount}/${totalAccounts} 账户`,
              );
            }
          } catch (err: any) {
            const status = err.response?.status;
            const metaError = err.response?.data?.error?.message || err.message;
            if (status === 403) {
              console.warn(
                `[后台同步 | ${syncId}] ⚠️ 账户 ${accountId} 无权限或被限制访问 (403): ${metaError}`,
              );
            } else if (status >= 500) {
              console.warn(
                `[后台同步 | ${syncId}] ⚠️ Meta 账户 ${accountId} 服务端不可用 (${status}): ${metaError}`,
              );
            } else {
              console.error(
                `[后台同步 | ${syncId}] ❌ 账户 ${accountId} 同步失败:`,
                metaError,
              );
            }
          }
        }),
      );

      // 强制延迟 2 秒防止限流
      if (i + chunkSize < accounts.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(
      `[后台同步 | ${syncId}] ✅ 同步完成! 共处理 ${totalAccounts} 个账户`,
    );
  } catch (error: any) {
    const status = error.response?.status;
    const metaError = error.response?.data?.error?.message || error.message;
    console.error(
      `[后台同步 | ${syncId}] 🚨 全局同步异常 (${status || "Unknown"}):`,
      metaError,
    );
  }
}
