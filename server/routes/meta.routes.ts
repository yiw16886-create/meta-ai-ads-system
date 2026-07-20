import { Router } from "express";
import prisma from "../../db/index.js";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import axios from "axios";
import { getMetaToken, extractMetaError, evaluateActivityStatus, syncSingleAccountAdData } from "../utils.js";
import { logContext } from "../logger.js";

const router = Router();

function getCreativeType(objectType: string) {
  if (!objectType) return "IMAGE";
  const type = objectType.toUpperCase();
  if (type.includes("VIDEO")) return "VIDEO";
  if (type.includes("CAROUSEL") || type.includes("NATIVE")) return "CAROUSEL";
  return "IMAGE";
}


// POST /api/meta/bm/invite
router.post("/bm/invite", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "用户未登录或会话已过期" });
    }

    const { business_id, email, role } = req.body;
    if (!business_id || !email) {
      return res.status(400).json({ success: false, error: "请选择商务管理平台 (BM) 并输入邀请邮箱" });
    }

    // 1. 从数据库中查询专属绑定的个人 Access Token (personal_token)
    let personal_token: string | null = null;
    
    // First lookup in FacebookAccount
    const fbAccount = await prisma.facebookAccount.findUnique({
      where: { userId }
    });
    if (fbAccount && fbAccount.accessToken) {
      personal_token = fbAccount.accessToken;
    } else {
      // Second lookup in UserFacebookBinding
      const fbBinding = await prisma.userFacebookBinding.findUnique({
        where: { user_id: userId }
      });
      if (fbBinding && fbBinding.access_token) {
        personal_token = fbBinding.access_token;
      }
    }

    if (!personal_token) {
      return res.status(400).json({ 
        success: false, 
        error: "未找到您的 Facebook 关联凭证。请先在系统内绑定/授权您的 Facebook 账户。" 
      });
    }

    // 从环境变量或数据库配置获取 META_APP_ID
    const systemConfig = await prisma.systemSetting.findFirst();
    const META_APP_ID = process.env.META_APP_ID || systemConfig?.meta_client_id;

    if (!META_APP_ID) {
      return res.status(400).json({
        success: false,
        error: "系统未配置 Meta 基础应用凭证 (App ID/Client ID)，请在超级管理员后台配置或设置环境变量 META_APP_ID。"
      });
    }

    let system_user_id: string | null = null;

    // ==========================================
    // 步骤一：检查该 BM 下是否已存在系统用户（避免重复创建）
    // ==========================================
    try {
      console.log(`[Meta Invite Step 1] Fetching system users for BM: ${business_id}`);
      const listRes = await axios.get(`https://graph.facebook.com/v20.0/${business_id}/system_users`, {
        params: { access_token: personal_token }
      });

      const systemUsers = listRes.data?.data || [];
      const existingBot = systemUsers.find((su: any) => su.name === "BM_Invite_Automation_Bot");

      if (existingBot) {
        system_user_id = existingBot.id;
        console.log(`[Meta Invite Step 1] Found existing bot system user: ${system_user_id}`);
      } else {
        console.log(`[Meta Invite Step 1] Bot system user not found. Creating a new one...`);
        const createRes = await axios.post(
          `https://graph.facebook.com/v20.0/${business_id}/system_users`,
          {
            name: "BM_Invite_Automation_Bot",
            role: "ADMIN",
            access_token: personal_token
          }
        );
        system_user_id = createRes.data?.id;
        console.log(`[Meta Invite Step 1] Successfully created new bot system user: ${system_user_id}`);
      }
    } catch (step1Error: any) {
      console.error("Step 1 (Fetch/Create System User) failed:", step1Error.response?.data || step1Error.message);
      const errMsg = step1Error.response?.data?.error?.message || step1Error.message || "未知错误";
      return res.status(400).json({
        success: false,
        error: `步骤一（获取或创建系统用户）失败: ${errMsg}`,
        details: {
          step: 1,
          title: "步骤一失败: 系统用户创建/查询失败",
          message: `请求 Meta 接口获取或创建系统用户 "BM_Invite_Automation_Bot" 时报错。\n\n具体原因：${errMsg}\n\n建议排查：\n1. 确保个人 Token 具有 business_management 管理权限。\n2. 确认个人账号在目标 BM (${business_id}) 下具有管理员权限。`
        }
      });
    }

    if (!system_user_id) {
      return res.status(400).json({
        success: false,
        error: "步骤一执行失败：未能成功获取或创建系统用户 ID。"
      });
    }

    // ==========================================
    // 步骤二：为该系统用户生成专用的长效免 2FA 令牌
    // ==========================================
    let system_user_token: string | null = null;
    try {
      console.log(`[Meta Invite Step 2] Generating access token for system user: ${system_user_id}`);
      const tokenRes = await axios.post(
        `https://graph.facebook.com/v20.0/${META_APP_ID}/access_tokens`,
        {
          business_id: business_id,
          system_user_id: system_user_id,
          scope: "business_management",
          access_token: personal_token
        }
      );
      system_user_token = tokenRes.data?.access_token;
      console.log(`[Meta Invite Step 2] Successfully generated system user token.`);
    } catch (step2Error: any) {
      console.error("Step 2 (Generate System User Token) failed:", step2Error.response?.data || step2Error.message);
      const errMsg = step2Error.response?.data?.error?.message || step2Error.message || "未知错误";
      return res.status(400).json({
        success: false,
        error: `步骤二（生成免2FA系统令牌）失败: ${errMsg}`,
        details: {
          step: 2,
          title: "步骤二失败: 生成免 2FA 令牌失败",
          message: `在 App (${META_APP_ID}) 节点为系统用户生成 access_token 时报错。\n\n具体原因：${errMsg}\n\n建议排查：\n1. 确认该 Meta 开发者应用 (${META_APP_ID}) 已正确关联/绑定到当前的商务管理平台 (BM)。\n2. 确保在 Meta 开发者后台，应用状态为已发布/可用，且当前个人管理员有权限管理该应用。`
        }
      });
    }

    if (!system_user_token) {
      return res.status(400).json({
        success: false,
        error: "步骤二执行失败：未能生成有效的系统用户 Token。"
      });
    }

    // ==========================================
    // 步骤三：使用系统用户 Token 发起真实的 BM 邀请
    // ==========================================
    try {
      console.log(`[Meta Invite Step 3] Sending BM user invitation via System User Token to: ${email}`);
      const targetRole = role === "Admin" ? "ADMIN" : "EMPLOYEE";
      
      const inviteRes = await axios.post(
        `https://graph.facebook.com/v20.0/${business_id}/business_users`,
        {
          email: email,
          role: targetRole,
          access_token: system_user_token
        }
      );

      console.log(`[Meta Invite Step 3] Invitation sent successfully. Meta response:`, inviteRes.data);
      return res.json({
        success: true,
        message: "已通过系统用户安全通道成功下发官方邀请邮件！",
        data: inviteRes.data
      });
    } catch (step3Error: any) {
      console.error("Step 3 (Send BM Invite) failed:", step3Error.response?.data || step3Error.message);
      const errMsg = step3Error.response?.data?.error?.message || step3Error.message || "未知错误";
      return res.status(400).json({
        success: false,
        error: `步骤三（下发官方邀请邮件）失败: ${errMsg}`,
        details: {
          step: 3,
          title: "步骤三失败: 下发官方邮件失败",
          message: `使用长效令牌向邮箱 ${email} 下发官方邀请时报错。\n\n具体原因：${errMsg}\n\n建议排查：\n1. 确认目标邮箱格式正确，且未被当前的 BM 限制。\n2. 检查当前 BM 邀请额度或权限状态是否正常。`
        }
      });
    }

  } catch (error: any) {
    console.error("Server inside error in BM invite router:", error);
    return res.status(500).json({
      success: false,
      error: "服务器内部错误，处理 BM 邀请时发生异常",
      details: {
        title: "服务器内部错误",
        message: error.message || "请稍后重试"
      }
    });
  }
});

// GET & POST /api/meta/sync-ads (Streaming NDJSON format)
const handleSyncAds = async (req: AuthenticatedRequest, res: any) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, is_silent, force_refresh } = { ...req.query, ...req.body } as {
      startDate?: string;
      endDate?: string;
      is_silent?: string | boolean;
      force_refresh?: string | boolean;
    };

    const isSilent = is_silent === 'true' || is_silent === true;
    const forceRefresh = force_refresh === 'true' || force_refresh === true;

    await logContext.run({ is_silent: isSilent }, async () => {
      const { format, subDays } = await import("date-fns");
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

      // Decoupled dates: silent background tasks force today & yesterday,
      // while manual click synchronous requests use custom/selected dates.
      const sDate = isSilent ? yesterdayStr : (startDate || todayStr);
      const eDate = isSilent ? todayStr : (endDate || todayStr);

      const logDebug = (message: string, ...args: any[]) => {
        if (!isSilent) {
          console.log(message, ...args);
        }
      };

      const token = await getMetaToken(userId);
      if (!token) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
      }

      // Fetch account list from Meta Graph API
      let accounts: any[] = [];
      try {
        const accountsResponse = await axios.get(
          `https://graph.facebook.com/v19.0/me/adaccounts`,
          {
            params: {
              fields: "name,account_id,account_status,amount_spent",
              limit: 1000,
              access_token: token,
            },
          }
        );
        accounts = accountsResponse.data?.data || [];
      } catch (apiErr: any) {
        console.error("[Stream Sync Ads] Failed to fetch accounts from Meta API, fallback to mapped:", apiErr.message);
      }

      const dbMappings = await prisma.accountMapping.findMany();
      const dbAdAccounts = await prisma.adAccount.findMany();
      const allowedAccountIds = new Set<string>();
      dbMappings.forEach(m => { if (m.fbAccountId) allowedAccountIds.add(m.fbAccountId.replace("act_", "")); });
      dbAdAccounts.forEach(a => { if (a.fb_account_id) allowedAccountIds.add(a.fb_account_id.replace("act_", "")); });

      const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];
      const filteredAccounts = accounts.filter((a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        return !DORMANT_ACCOUNT_IDS.includes(rawId);
      });

      // Merge allowed accounts
      const existingAccountIds = new Set(filteredAccounts.map((a: any) => (a.account_id || a.id || "").replace("act_", "")));
      for (const allowedId of allowedAccountIds) {
        if (!existingAccountIds.has(allowedId) && !DORMANT_ACCOUNT_IDS.includes(allowedId)) {
          filteredAccounts.push({ account_id: allowedId, account_status: 1 });
        }
      }

      // Configure streaming headers
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      console.log(`⏰ [Stream Sync Ads] 启动同步任务... (IsSilent: ${isSilent}, ForceRefresh: ${forceRefresh}, FilteredAccounts: ${filteredAccounts.length})`);

      let processedCount = 0;
      let activeCount = 0;
      let skippedCount = 0;
      const startTime = Date.now();

      for (const account of filteredAccounts) {
        processedCount++;
        const accountId = account.account_id || account.id;
        const cleanAccountId = accountId.replace("act_", "");

        // 1. Get real-time spend from Meta response and evaluate activityStatus based on database history & intelligent resurrection
        const realTimeSpend = account.amount_spent ? parseInt(account.amount_spent, 10) / 100 : 0;
        let activityStatus = 4;
        try {
          activityStatus = await evaluateActivityStatus(accountId, account.account_status, token, realTimeSpend);
        } catch (err: any) {
          console.error(`[Stream Sync Ads] Error evaluating activity status for ${cleanAccountId}:`, err.message);
        }

        // Update in database safely (using upsert in case the account records do not exist yet)
        try {
          let unassignedStore = await prisma.store.findUnique({
            where: { name: "未分配" }
          });
          if (!unassignedStore) {
            unassignedStore = await prisma.store.create({
              data: {
                name: "未分配",
                platform: "shopline",
                timezone: "America/Los_Angeles"
              }
            });
          }

          await prisma.adAccount.upsert({
            where: { fb_account_id: cleanAccountId },
            update: {
              activityStatus,
              fb_account_name: account.name || `Account ${cleanAccountId}`,
              fb_access_token: token
            },
            create: {
              fb_account_id: cleanAccountId,
              fb_account_name: account.name || `Account ${cleanAccountId}`,
              fb_access_token: token,
              storeId: unassignedStore.id,
              activityStatus
            }
          });

          await prisma.metaAccountMonitoring.upsert({
            where: { accountId: cleanAccountId },
            update: {
              activityStatus,
              status: account.account_status,
              accountName: account.name || `Account ${cleanAccountId}`,
              amountSpent: realTimeSpend
            },
            create: {
              accountId: cleanAccountId,
              accountName: account.name || `Account ${cleanAccountId}`,
              activityStatus,
              status: account.account_status,
              amountSpent: realTimeSpend
            }
          }).catch(() => {});
        } catch (err: any) {
          console.error(`[Stream Sync Ads] Error updating database records for ${cleanAccountId}:`, err.message);
        }

        // Determine depth sync for Insights
        let shouldDoDepthSync = false;
        if (activityStatus === 1 || activityStatus === 2) {
          shouldDoDepthSync = true;
        } else if (activityStatus === 3) {
          shouldDoDepthSync = !!forceRefresh;
        } else {
          shouldDoDepthSync = false;
        }

        logDebug(`[Stream Sync Ads] Processing account ${cleanAccountId}: StatusLevel=${activityStatus}, DepthSync=${shouldDoDepthSync}`);

        if (!shouldDoDepthSync) {
          skippedCount++;
          // Skip depth sync: stream existing insights if present, else send stub
          const dbData = await prisma.adInsight.findMany({
            where: {
              accountId: cleanAccountId,
              date: {
                gte: sDate,
                lte: eDate
              }
            }
          });

          if (dbData.length > 0) {
            for (const row of dbData) {
              res.write(JSON.stringify(row) + "\n");
            }
          } else {
            res.write(JSON.stringify({
              accountId: cleanAccountId,
              accountName: account.name || `Account ${cleanAccountId}`,
              date: sDate,
              reach: 0,
              impressions: 0,
              clicks: 0,
              spend: 0,
              purchases: 0,
              purchaseValue: 0,
              ctr: 0,
              cpc: 0,
              roas: 0
            }) + "\n");
          }
          continue;
        }

        activeCount++;
        try {
          // Sync the account's ad data to the database (without creatives)
          await syncSingleAccountAdData(accountId, sDate, eDate, token);

          // Fetch newly synced AdInsight records for this account from the database
          const dbData = await prisma.adInsight.findMany({
            where: {
              accountId: cleanAccountId,
              date: {
                gte: sDate,
                lte: eDate
              }
            }
          });

          // Write each synced record back to the response stream
          for (const row of dbData) {
            res.write(JSON.stringify(row) + "\n");
          }

          // If no records were fetched, send a stub so frontend knows this account sync finished
          if (dbData.length === 0) {
            res.write(JSON.stringify({
              accountId: cleanAccountId,
              accountName: account.name || `Account ${cleanAccountId}`,
              date: sDate,
              reach: 0,
              impressions: 0,
              clicks: 0,
              spend: 0,
              purchases: 0,
              purchaseValue: 0,
              ctr: 0,
              cpc: 0,
              roas: 0
            }) + "\n");
          }
        } catch (err: any) {
          console.error(`[Stream Sync Ads] Error syncing account ${accountId}:`, err.message);
          res.write(JSON.stringify({
            accountId: cleanAccountId,
            error: err.message || "Failed to sync account"
          }) + "\n");
        }
      }

      (console as any).forceLog(`[✅ Meta Sync Summary] 自动轮询结束 | 共处理 ${processedCount} 个账户，活跃深度同步 ${activeCount} 个，跳过/一级更新 ${skippedCount} 个，耗时 ${Date.now() - startTime} ms`);

      // Trigger post-sync alignment tasks in background (non-blocking, creative set to false!)
      try {
        const { ensureAdAccounts, syncMetaHierarchy } = await import("../services/meta-hierarchy-sync.service.js");
        const { attributePurchases } = await import("../services/attribution.service.js");
        const { aggregateData } = await import("../services/aggregation.service.js");

        Promise.resolve().then(async () => {
          try {
            logDebug("[Stream Sync Background] Performing post-sync alignment (excluding creatives)...");
            await ensureAdAccounts(token);
            await syncMetaHierarchy(token, { syncCreative: false, forceRefreshCampaigns: forceRefresh });
            await attributePurchases();
            await aggregateData(sDate, eDate, { syncProduct: false, syncCreative: false });
            logDebug("[Stream Sync Background] Completed background alignment.");
          } catch (bgErr: any) {
            console.error("[Stream Sync Background] Alignment error:", bgErr.message);
          }
        });
      } catch (bgLoadErr: any) {
        console.error("[Stream Sync Background] Load error:", bgLoadErr.message);
      }

      res.write(JSON.stringify({ type: "SYNC_COMPLETE", timestamp: Date.now() }) + "\n");
      res.end();
    });
  } catch (error: any) {
    console.error("[Stream Sync Ads] Global stream sync failure:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "流式同步失败" });
    } else {
      res.end();
    }
  }
};

router.get("/sync-ads", authenticateJWT as any, handleSyncAds);
router.post("/sync-ads", authenticateJWT as any, handleSyncAds);

// GET & POST /api/meta/sync-creatives (Streaming NDJSON format)
const handleSyncCreatives = async (req: AuthenticatedRequest, res: any) => {
  try {
    const userId = req.user?.id;
    const token = await getMetaToken(userId);
    if (!token) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }

    const { startDate, endDate } = { ...req.query, ...req.body } as { startDate?: string; endDate?: string };
    const { format } = await import("date-fns");
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const sDate = startDate || todayStr;
    const eDate = endDate || todayStr;

    const accounts = await prisma.adAccount.findMany({
      include: { store: true }
    });

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log(`[Stream Sync Creatives] Starting streaming sync for ${accounts.length} accounts`);

    for (const acc of accounts) {
      if (acc.activityStatus > 3) continue;
      const actId = acc.fb_account_id.startsWith('act_') ? acc.fb_account_id : `act_${acc.fb_account_id}`;
      
      try {
        const creativesUrl = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
        const creativesRes = await axios.get(creativesUrl, {
          params: { fields: "id,name,object_type,status", limit: 100, access_token: token }
        });
        const creatives = creativesRes.data?.data || [];

        for (const creative of creatives) {
          const type = getCreativeType(creative.object_type);
          
          await prisma.adCreative.upsert({
            where: { creativeId: creative.id },
            update: {
              name: creative.name,
              type: type,
              storeId: acc.storeId
            },
            create: {
              creativeId: creative.id,
              fbAccountId: acc.fb_account_id,
              mediaType: type || "IMAGE",
              storeId: acc.storeId,
              name: creative.name || `Creative ${creative.id}`,
              type: type,
              hookRate: 0
            }
          });

          // Stream the newly processed creative back to client
          res.write(JSON.stringify({
            id: creative.id,
            creativeId: creative.id,
            name: creative.name || `Creative ${creative.id}`,
            type,
            accountId: acc.fb_account_id,
            storeName: acc.store ? acc.store.name : "未分配",
            status: "success"
          }) + "\n");
        }
      } catch (err: any) {
        console.error(`[Stream Sync Creatives] Error syncing creatives for ${acc.fb_account_id}:`, err.message);
      }
    }

    // Trigger aggregateData for creatives in the background (non-blocking)
    try {
      const { aggregateData } = await import("../services/aggregation.service.js");
      Promise.resolve().then(async () => {
        try {
          console.log("[Stream Sync Creatives Background] Running aggregation...");
          await aggregateData(sDate, eDate, { syncProduct: false, syncCreative: true });
          console.log("[Stream Sync Creatives Background] Aggregation done.");
        } catch (aggErr: any) {
          console.error("[Stream Sync Creatives Background] Aggregation error:", aggErr.message);
        }
      });
    } catch (e) {}

    res.end();
  } catch (error: any) {
    console.error("[Stream Sync Creatives] Global failure:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "素材流式同步失败" });
    } else {
      res.end();
    }
  }
};

router.get("/sync-creatives", authenticateJWT as any, handleSyncCreatives);
router.post("/sync-creatives", authenticateJWT as any, handleSyncCreatives);

export default router;
