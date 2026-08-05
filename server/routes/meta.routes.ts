import { Router } from "express";
import prisma from "../../db/index.js";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import axios from "axios";
import { getMetaToken, extractMetaError, evaluateActivityStatus, syncSingleAccountAdData, callMetaApiWithRetry, safeUpsertAdPerformanceDaily, isValidAdAccountName } from "../utils.js";
import { logContext } from "../logger.js";
import { extractMetaAssetHash } from "../services/metaFetchPatch.service.js";

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

// GET /api/meta/accounts
// 极速获取用户绑定的账户列表（优先拉取 Graph API 授权账户，Vercel 耗时 <0.2s）
router.get("/accounts", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const token = await getMetaToken(userId);

    // 1. 本地 DB 查询 (AdAccount + AccountMapping)
    const numUserId = userId ? Number(userId) : null;
    if (!numUserId) {
      return res.json({ success: true, accounts: [] });
    }
    const dbAccounts = await prisma.adAccount.findMany({
      where: { OR: [{ userId: numUserId }, { userId: null }] },
      select: { fb_account_id: true, fb_account_name: true }
    });
    const dbMappings = await prisma.accountMapping.findMany({
      where: { OR: [{ userId: numUserId }, { userId: null }] },
      select: { fbAccountId: true, project: true }
    });

    const dbNameMap = new Map<string, string>();
    dbAccounts.forEach(a => {
      const clean = a.fb_account_id.replace("act_", "").trim();
      if (clean && a.fb_account_name) {
        dbNameMap.set(clean, a.fb_account_name);
      }
    });

    let accountsList: Array<{ accountId: string; name: string }> = [];

    // 2. 如果存在有效 Token，优先从 Meta Graph API 动态拉取当前 Token 有权限的账户列表
    if (token) {
      try {
        const response = await axios.get("https://graph.facebook.com/v19.0/me/adaccounts", {
          params: {
            fields: "name,account_id,account_status",
            limit: 500,
            access_token: token,
          },
          timeout: 4000
        });
        const metaData = response.data?.data || [];
        if (Array.isArray(metaData) && metaData.length > 0) {
          accountsList = metaData
            .filter((acc: any) => isValidAdAccountName(acc.name))
            .map((acc: any) => {
              const clean = String(acc.account_id || acc.id).replace("act_", "").trim();
              const localName = dbNameMap.get(clean);
              return {
                accountId: clean,
                name: localName || acc.name || `Account ${clean}`
              };
            });
        }
      } catch (graphErr: any) {
        console.warn("[/api/meta/accounts] Graph API me/adaccounts lookup warning:", graphErr.message);
      }
    }

    // 3. 如果从 Meta 未拉取到账户，降级使用本地 DB 里的账户
    if (accountsList.length === 0) {
      const accountMap = new Map<string, { accountId: string; name: string }>();

      dbAccounts.forEach(a => {
        const clean = a.fb_account_id.replace("act_", "").trim();
        if (clean) {
          accountMap.set(clean, {
            accountId: clean,
            name: a.fb_account_name || `Account ${clean}`
          });
        }
      });

      dbMappings.forEach(m => {
        const clean = m.fbAccountId.replace("act_", "").trim();
        if (clean && !accountMap.has(clean)) {
          accountMap.set(clean, {
            accountId: clean,
            name: `Account ${clean}`
          });
        }
      });

      accountsList = Array.from(accountMap.values());
    }

    return res.json({ success: true, accounts: accountsList });
  } catch (error: any) {
    console.error("Error in GET /api/meta/accounts:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST & GET /api/meta/sync-account
// 单账户 1~2 秒精简同步，完美适应 Vercel 10s 超时规则
const handleSyncSingleAccount = async (req: AuthenticatedRequest, res: any) => {
  try {
    const userId = req.user?.id;
    const token = await getMetaToken(userId);

    if (!token) {
      return res.status(200).json({ success: false, error: "未绑定 Meta Access Token，请先登录授权" });
    }

    const { accountId, sinceDays, startDate, endDate } = { ...req.query, ...req.body } as {
      accountId?: string;
      sinceDays?: string | number;
      startDate?: string;
      endDate?: string;
    };

    if (!accountId) {
      return res.status(400).json({ success: false, error: "缺少 accountId 参数" });
    }

    const cleanAccountId = String(accountId).replace("act_", "").trim();

    const numUserId = userId ? Number(userId) : null;
    if (!numUserId) {
      return res.status(200).json({ success: false, error: "未登录或用户效验失败", isForbidden: true });
    }

    // 验证该账户是否属于当前用户或未绑定账户
    const ownsAdAccount = await prisma.adAccount.findFirst({
      where: { fb_account_id: { contains: cleanAccountId }, OR: [{ userId: numUserId }, { userId: null }] }
    });
    const ownsMapping = await prisma.accountMapping.findFirst({
      where: { fbAccountId: { contains: cleanAccountId }, OR: [{ userId: numUserId }, { userId: null }] }
    });

    if (!ownsAdAccount && !ownsMapping && req.user?.role !== "SUPER_ADMIN") {
      return res.status(200).json({
        success: false,
        accountId: cleanAccountId,
        error: "无权访问或同步该广告账户",
        isForbidden: true
      });
    }

    // 如果账户未绑定 userId，自动归属给当前同步用户
    if (ownsAdAccount && ownsAdAccount.userId === null) {
      await prisma.adAccount.updateMany({
        where: { fb_account_id: { contains: cleanAccountId } },
        data: { userId: numUserId }
      }).catch(() => null);
    }
    if (ownsMapping && ownsMapping.userId === null) {
      await prisma.accountMapping.updateMany({
        where: { fbAccountId: { contains: cleanAccountId } },
        data: { userId: numUserId }
      }).catch(() => null);
    }

    const { format, subDays } = await import("date-fns");
    let sDate = startDate;
    let eDate = endDate;

    if (!sDate || !eDate) {
      const days = typeof sinceDays === "number" ? sinceDays : parseInt(String(sinceDays || 3), 10);
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const pastStr = format(subDays(new Date(), days), "yyyy-MM-dd");
      sDate = sDate || pastStr;
      eDate = eDate || todayStr;
    }

    // 调用底层单账户同步（只向 Meta 发起这 1 个账户的 Graph API 请求，1~2s 完成）
    const syncedRecords = await syncSingleAccountAdData(cleanAccountId, sDate, eDate, token);

    return res.json({
      success: true,
      accountId: cleanAccountId,
      startDate: sDate,
      endDate: eDate,
      syncedRecords,
      message: `账户 ${cleanAccountId} 数据同步成功 (${syncedRecords} 条)`
    });
  } catch (error: any) {
    const rawAcc = req.body?.accountId || req.query?.accountId || "unknown";
    const metaErrorMsg = extractMetaError(error);
    const is502 = error.status === 502 || error.response?.status === 502 || (metaErrorMsg && (metaErrorMsg.includes("502") || metaErrorMsg.includes("网关")));
    const is403 = error.status === 403 || error.response?.status === 403 || (metaErrorMsg && (metaErrorMsg.includes("403") || metaErrorMsg.includes("OAuthException") || metaErrorMsg.includes("200")));

    if (is502) {
      console.warn(`[Sync Account Info] Account ${rawAcc} transient gateway error (502): ${metaErrorMsg}`);
    } else {
      console.info(`[Sync Account Info] Account ${rawAcc} skipped or restricted: ${metaErrorMsg}`);
    }

    return res.status(200).json({
      success: false,
      accountId: rawAcc,
      error: metaErrorMsg || "同步该账户失败",
      isForbidden: is403,
      isGatewayError: is502
    });
  }
};

router.get("/sync-account", authenticateJWT as any, handleSyncSingleAccount);
router.post("/sync-account", authenticateJWT as any, handleSyncSingleAccount);

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
        return res.status(200).json({ success: true, message: "未绑定 Facebook 账号或 Token 已清空" });
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

      const dbMappings = userId ? await prisma.accountMapping.findMany({
        where: { OR: [{ userId: Number(userId) }, { userId: null }] }
      }) : [];
      const dbAdAccounts = userId ? await prisma.adAccount.findMany({
        where: { OR: [{ userId: Number(userId) }, { userId: null }] }
      }) : [];
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
          const existingMapping = await prisma.accountMapping.findFirst({
            where: { fbAccountId: cleanAccountId }
          });
          const targetStoreId = existingMapping?.storeId || null;

          await prisma.adAccount.upsert({
            where: { fb_account_id: cleanAccountId },
            update: {
              activityStatus,
              fb_account_name: account.name || `Account ${cleanAccountId}`,
              fb_access_token: token,
              ...(targetStoreId ? { storeId: targetStoreId } : {})
            },
            create: {
              fb_account_id: cleanAccountId,
              fb_account_name: account.name || `Account ${cleanAccountId}`,
              fb_access_token: token,
              storeId: targetStoreId,
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
        if (!isSilent || forceRefresh || activityStatus === 1 || activityStatus === 2 || account.account_status === 1) {
          shouldDoDepthSync = true;
        } else if (activityStatus === 3) {
          shouldDoDepthSync = true;
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
          const is403 = err.response?.status === 403 || (err.message && err.message.includes("403"));
          if (is403) {
            console.warn(`[Stream Sync Ads] Skipping restricted account ${cleanAccountId} (403 Forbidden)`);
          } else {
            console.error(`[Stream Sync Ads] Error syncing account ${accountId}:`, err.message);
          }
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
const handleSyncCreatives = async (
  req: AuthenticatedRequest,
  res: any
) => {
  const writeStream = (payload: Record<string, any>) => {
    if (!res.writableEnded) {
      res.write(`${JSON.stringify(payload)}\n`);
    }
  };

  const parseNumber = (value: any): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getActionValue = (
    actions: any[],
    acceptedTypes: string[]
  ): number => {
    if (!Array.isArray(actions)) return 0;
    const item = actions.find((action: any) =>
      acceptedTypes.includes(String(action?.action_type || ""))
    );
    return parseNumber(item?.value);
  };

  try {
    const userId = Number(req.user?.id);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "用户未登录或会话已过期"
      });
    }

    const token = await getMetaToken(userId);
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "未绑定 Facebook 账号或 Token 已失效"
      });
    }

    const requestData = {
      ...req.query,
      ...(req.body || {})
    } as {
      startDate?: string;
      endDate?: string;
    };

    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    const startDate = requestData.startDate || sevenDaysAgo;
    const endDate = requestData.endDate || today;

    const accounts = await prisma.adAccount.findMany({
      where: {
        userId,
        fb_account_name: { notIn: [null, ""] }
      },
      include: { store: true }
    });

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    writeStream({
      type: "start",
      status: "started",
      accountCount: accounts.length,
      startDate,
      endDate
    });

    let totalAds = 0;
    let totalCreatives = 0;
    let totalInsights = 0;
    let successfulAccounts = 0;
    let failedAccounts = 0;

    for (const account of accounts) {
      if (account.activityStatus > 3) {
        writeStream({
          type: "account_skipped",
          status: "skipped",
          accountId: account.fb_account_id,
          message: "账户处于停用或休眠状态"
        });
        continue;
      }

      const cleanAccountId = String(account.fb_account_id)
        .replace(/^act_/, "")
        .trim();
      const actId = `act_${cleanAccountId}`;

      writeStream({
        type: "account_start",
        status: "processing",
        accountId: cleanAccountId,
        accountName: account.fb_account_name || cleanAccountId
      });

      try {
        let adsNextUrl: string | null =
          `https://graph.facebook.com/v21.0/${actId}/ads`;
        let isFirstAdsRequest = true;
        let accountAdCount = 0;
        let accountCreativeCount = 0;

        while (adsNextUrl) {
          const adsResponse = await callMetaApiWithRetry(
            adsNextUrl,
            {
              method: "GET",
              params: isFirstAdsRequest
                ? {
                    fields:
                      "id,name,status,adset_id,campaign_id,creative{id,name}",
                    limit: 100,
                    access_token: token
                  }
                : undefined,
              timeout: 45000
            },
            3
          );

          isFirstAdsRequest = false;
          const metaAds = Array.isArray(adsResponse.data?.data)
            ? adsResponse.data.data
            : [];

          for (const metaAd of metaAds) {
            const adId = String(metaAd.id || "").trim();
            const creativeId = String(metaAd.creative?.id || "").trim();
            if (!adId) continue;

            const adsetId =
              String(metaAd.adset_id || "").trim() ||
              `unknown-adset-${adId}`;
            const campaignId =
              String(metaAd.campaign_id || "").trim() ||
              `unknown-campaign-${adId}`;

            if (creativeId) {
              const extracted = await extractMetaAssetHash(creativeId, token);
              const videoId = extracted?.videoId || null;
              const imageHash = extracted?.imageHash || null;
              const previewUrl = extracted?.previewUrl || null;
              const materialType = videoId
                ? "VIDEO"
                : getCreativeType(extracted?.data?.object_type || "");

              await prisma.adCreative.upsert({
                where: { creativeId },
                update: {
                  fbAccountId: cleanAccountId,
                  name:
                    metaAd.creative?.name ||
                    extracted?.data?.name ||
                    `Creative ${creativeId}`,
                  type: materialType,
                  mediaType: materialType,
                  storeId: account.storeId,
                  imageHash,
                  videoId,
                  previewUrl,
                  imageUrl: extracted?.data?.image_url || previewUrl,
                  landingUrl: extracted?.landingUrl || null,
                  pageId: extracted?.pageId || null,
                  pageName: extracted?.pageName || null,
                  effectivePostId: extracted?.effectivePostId || null,
                  metaAssetId: imageHash || videoId || null
                },
                create: {
                  creativeId,
                  fbAccountId: cleanAccountId,
                  mediaType: materialType,
                  storeId: account.storeId,
                  name:
                    metaAd.creative?.name ||
                    extracted?.data?.name ||
                    `Creative ${creativeId}`,
                  type: materialType,
                  hookRate: 0,
                  imageHash,
                  videoId,
                  previewUrl,
                  imageUrl: extracted?.data?.image_url || previewUrl,
                  landingUrl: extracted?.landingUrl || null,
                  pageId: extracted?.pageId || null,
                  pageName: extracted?.pageName || null,
                  effectivePostId: extracted?.effectivePostId || null,
                  metaAssetId: imageHash || videoId || null
                }
              });

              accountCreativeCount++;
              totalCreatives++;
            }

            await prisma.ad.upsert({
              where: { id: adId },
              update: {
                name: metaAd.name || `Ad ${adId}`,
                adsetId,
                campaignId,
                accountId: cleanAccountId,
                creativeId: creativeId || null,
                storeId: account.storeId
              },
              create: {
                id: adId,
                name: metaAd.name || `Ad ${adId}`,
                adsetId,
                campaignId,
                accountId: cleanAccountId,
                creativeId: creativeId || null,
                storeId: account.storeId
              }
            });

            accountAdCount++;
            totalAds++;

            writeStream({
              type: "ad_synced",
              status: "success",
              accountId: cleanAccountId,
              adId,
              creativeId: creativeId || null,
              name: metaAd.name || `Ad ${adId}`
            });
          }

          adsNextUrl = adsResponse.data?.paging?.next || null;
        }

        let insightsNextUrl: string | null =
          `https://graph.facebook.com/v21.0/${actId}/insights`;
        let isFirstInsightsRequest = true;
        let accountInsightCount = 0;

        while (insightsNextUrl) {
          const insightsResponse = await callMetaApiWithRetry(
            insightsNextUrl,
            {
              method: "GET",
              params: isFirstInsightsRequest
                ? {
                    level: "ad",
                    time_range: JSON.stringify({
                      since: startDate,
                      until: endDate
                    }),
                    time_increment: 1,
                    fields:
                      "date_start,ad_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values",
                    limit: 200,
                    access_token: token
                  }
                : undefined,
              timeout: 45000
            },
            3
          );

          isFirstInsightsRequest = false;
          const insights = Array.isArray(insightsResponse.data?.data)
            ? insightsResponse.data.data
            : [];

          for (const insight of insights) {
            const adId = String(insight.ad_id || "").trim();
            const date = String(insight.date_start || "").trim();
            if (!adId || !date) continue;

            const databaseAd = await prisma.ad.findUnique({
              where: { id: adId },
              select: { creativeId: true }
            });

            const purchases = getActionValue(insight.actions, [
              "purchase",
              "omni_purchase",
              "offsite_conversion.fb_pixel_purchase"
            ]);
            const purchaseValue = getActionValue(insight.action_values, [
              "purchase",
              "omni_purchase",
              "offsite_conversion.fb_pixel_purchase"
            ]);
            const addToCart = getActionValue(insight.actions, [
              "add_to_cart",
              "omni_add_to_cart",
              "offsite_conversion.fb_pixel_add_to_cart"
            ]);
            const initiateCheckout = getActionValue(insight.actions, [
              "initiate_checkout",
              "omni_initiated_checkout",
              "offsite_conversion.fb_pixel_initiate_checkout"
            ]);

            await safeUpsertAdPerformanceDaily(adId, date, {
              accountId: cleanAccountId,
              creativeId: databaseAd?.creativeId || null,
              spend: parseNumber(insight.spend),
              impressions: Math.trunc(parseNumber(insight.impressions)),
              reach: Math.trunc(parseNumber(insight.reach)),
              clicks: Math.trunc(parseNumber(insight.clicks)),
              linkClicks: Math.trunc(
                parseNumber(insight.inline_link_clicks)
              ),
              purchases: Math.trunc(purchases),
              purchaseValue,
              addToCart: Math.trunc(addToCart),
              initiateCheckout: Math.trunc(initiateCheckout)
            });

            accountInsightCount++;
            totalInsights++;
          }

          insightsNextUrl = insightsResponse.data?.paging?.next || null;
        }

        successfulAccounts++;
        writeStream({
          type: "account_complete",
          status: "success",
          accountId: cleanAccountId,
          ads: accountAdCount,
          creatives: accountCreativeCount,
          insights: accountInsightCount
        });
      } catch (error: any) {
        failedAccounts++;
        const metaError = error.response?.data?.error;
        const errorMessage =
          metaError?.message || error.message || "素材与指标同步失败";

        console.error(
          `[Stream Sync Creatives] Error syncing account ${cleanAccountId}:`,
          {
            status: error.response?.status || null,
            code: metaError?.code || null,
            subcode: metaError?.error_subcode || null,
            type: metaError?.type || null,
            message: errorMessage
          }
        );

        writeStream({
          type: "account_error",
          status: "error",
          accountId: cleanAccountId,
          error: errorMessage,
          statusCode: error.response?.status || null,
          errorCode: metaError?.code || null,
          errorSubcode: metaError?.error_subcode || null
        });
      }
    }

    writeStream({
      type: "complete",
      status: failedAccounts > 0 ? "partial_success" : "success",
      totalAds,
      totalCreatives,
      totalInsights,
      successfulAccounts,
      failedAccounts
    });

    return res.end();
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.error?.message ||
      error.message ||
      "素材同步失败";

    console.error("[Stream Sync Creatives] Global failure:", errorMessage);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }

    writeStream({
      type: "global_error",
      status: "error",
      error: errorMessage
    });
    return res.end();
  }
};

router.get("/sync-creatives", authenticateJWT as any, handleSyncCreatives);
router.post("/sync-creatives", authenticateJWT as any, handleSyncCreatives);

export default router;
