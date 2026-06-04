import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { format, subDays } from "date-fns";
import { getMetaToken, extractMetaError, evaluateActivityStatus, syncSingleAccountAdData } from "../utils.js";
import { ensureAdAccounts, syncMetaHierarchy } from "../services/meta-hierarchy-sync.service.js";
import { syncStoreData } from "../services/store-sync.service.js";
import { attributePurchases } from "../services/attribution.service.js";
import { aggregateData } from "../services/aggregation.service.js";

const router = Router();

router.post("/sync", async (req, res) => {
  const { startDate, endDate, syncProduct, syncCreative, accounts: requestedAccounts } = req.body;
  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "startDate and endDate are required" });
  }

  try {
    const token = await getMetaToken();
    if (!token) {
      return res
        .status(400)
        .json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }

    const accountsResponse = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "name,account_id,account_status",
          limit: 1000,
          access_token: token,
        },
      },
    );

    // 获取系统的停用账户 ID 且常态过滤 dormant/限制账户
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);
    const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];

    // 仅同步已映射或已绑定的账户 (AccountMapping 或 AdAccount 中的账户)，避免全局请求几千个账户导致封禁
    const dbMappings = await prisma.accountMapping.findMany();
    const dbAdAccounts = await prisma.adAccount.findMany();
    const allowedAccountIds = new Set<string>();
    dbMappings.forEach(m => { if (m.fbAccountId) allowedAccountIds.add(m.fbAccountId.replace("act_", "")); });
    dbAdAccounts.forEach(a => { if (a.fb_account_id) allowedAccountIds.add(a.fb_account_id.replace("act_", "")); });

    // 如果客户端显式传了 requestedAccounts 列表，我们就只同步那个列表
    if (Array.isArray(requestedAccounts) && requestedAccounts.length > 0) {
        requestedAccounts.forEach(id => allowedAccountIds.add(id.replace("act_", "")));
    }

    const accounts = (accountsResponse.data.data || []).filter(
      (a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        if (!allowedAccountIds.has(rawId)) return false; // 必须是已配置的账户
        
        // 如果端上有特定选择，严格过滤非选中的
        if (Array.isArray(requestedAccounts) && requestedAccounts.length > 0) {
            if (!requestedAccounts.map(id => id.replace("act_", "")).includes(rawId)) {
                return false;
            }
        }
        
        const isDormant = DORMANT_ACCOUNT_IDS.includes(rawId);
        return !isDormant;
      }
    );
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    // 使用分批同步逻辑 (每5个一组) 避免 Meta API 限流
    const chunkSize = 5;
    for (let i = 0; i < accounts.length; i += chunkSize) {
      if (stopSync) break;
      const chunk = accounts.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (account: any) => {
          const accountId = account.account_id || account.id;
          try {
            const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token);
            if (activityStatus <= 4) {
                const count = await syncSingleAccountAdData(accountId, startDate, endDate, token);
                totalSynced += count;
            } else {
                console.log(`[Manual API Sync] ⏭️ Skipped Ad-level sync for account ${accountId} (Activity Status: ${activityStatus})`);
            }
          } catch (err: any) {
            lastError = extractMetaError(err);
            const status = err.response?.status;
            if (status === 403) {
              console.warn(
                `[Manual API Sync] ⚠️ Account ${accountId} access restricted (403): ${lastError}`,
              );
            } else {
              console.error(
                `[Manual API Sync] ❌ Error syncing account ${accountId}:`,
                err.response?.data || err.message,
              );
            }
          }
        }),
      );

      // 每批处理后延迟 1.5 秒
      if (i + chunkSize < accounts.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (stopSync && totalSynced === 0) {
      return res.status(401).json({ error: lastError });
    }

    try {
      console.log("Triggering Ensure AdAccounts...");
      await ensureAdAccounts(token);
      console.log("Triggering Meta Hierarchy Sync (including creatives)...");
      await syncMetaHierarchy(token, { syncCreative: true });
      console.log("Triggering Attribution and Aggregation (excluding products & creatives)...");
      await attributePurchases();
      await aggregateData(startDate, endDate, {
        syncProduct: false,
        syncCreative: false
      });
      console.log("Sync pipeline completed successfully.");
    } catch (aggErr) {
      console.error("Aggregation error during sync:", aggErr);
    }

    res.json({
      success: true,
      count: totalSynced,
      error: stopSync ? lastError : undefined,
    });
  } catch (error: any) {
    const msg = extractMetaError(error);
    console.error("Sync error:", error.response?.data || error.message);
    res.status(500).json({ error: msg });
  }
});

router.post("/sync-store", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  try {
    console.log(`[Manual Store Sync] Starting store sync: ${startDate} to ${endDate}`);
    await syncStoreData(startDate, endDate);
    await aggregateData(startDate, endDate, { syncProduct: true, syncCreative: false });
    return res.json({ success: true, message: "店铺和订单数据同步成功" });
  } catch (error: any) {
    console.error("Store sync error:", error);
    return res.status(500).json({ error: error.message || "店铺和订单数据同步失败" });
  }
});

router.post("/sync-creatives", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  try {
    const token = await getMetaToken();
    if (!token) {
      return res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }
    console.log(`[Manual Creative Sync] Starting creative adcreatives sync: ${startDate} to ${endDate}`);
    await syncMetaHierarchy(token, { syncCreative: true });
    await aggregateData(startDate, endDate, { syncProduct: false, syncCreative: true });
    return res.json({ success: true, message: "创意素材数据同步成功" });
  } catch (error: any) {
    console.error("Creative sync error:", error);
    return res.status(500).json({ error: extractMetaError(error) });
  }
});

router.get("/cron/sync-monthly", async (req, res) => {
  console.log("⏰ Starting background sync: Last 30 days...");
  try {
    const token = await getMetaToken();
    if (!token)
      throw new Error("Meta Access Token is not configured in settings.");

    const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    // 1. 获取所有子账户
    const accountsResponse = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "name,account_id,account_status",
          limit: 1000,
          access_token: token,
        },
      },
    );

    // 获取系统的停用账户 ID 且常态过滤 dormant/限制账户
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);
    const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];

    const accounts = (accountsResponse.data.data || []).filter(
      (a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        const isDormant = DORMANT_ACCOUNT_IDS.includes(rawId);
        return !isDormant;
      }
    );
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    // 2. 遍历同步每个账户
    for (const account of accounts) {
      if (stopSync) break;
      const accountId = account.account_id || account.id;
      try {
        const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token);
        if (activityStatus <= 4) {
             const count = await syncSingleAccountAdData(accountId, startDate, endDate, token);
             totalSynced += count;
        } else {
             console.log(`[Cron Sync] ⏭️ Skipped Ad-level sync for account ${accountId} (Activity Status: ${activityStatus})`);
        }
      } catch (accErr: any) {
        lastError = extractMetaError(accErr);
        const status = accErr.response?.status;
        if (status === 403) {
          console.warn(
            `[Cron Sync] ⚠️ Account ${accountId} access restricted (403): ${lastError}`,
          );
        } else {
          console.error(
            `[Cron Sync] ❌ Failed for account ${accountId}:`,
            accErr.response?.data || accErr.message,
          );
        }
      }
    }

    if (stopSync && totalSynced === 0) {
      throw new Error(lastError);
    }

    console.log(`✅ Background sync finished. Total rows: ${totalSynced}`);
    res.json({
      success: true,
      count: totalSynced,
      range: { startDate, endDate },
      error: stopSync ? lastError : undefined,
    });
  } catch (error: any) {
    const msg = extractMetaError(error);
    const status = error.response?.status;
    console.error(`[Cron Sync] Global failure (${status || "Unknown"}):`, msg);
    res.status(500).json({ error: msg });
  }
});

export default router;