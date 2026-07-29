import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { testSmtpConnection } from "../services/email.service.js";
import { isSafeHost } from "../ssrf.util.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { triggerInitialFullSync } from "../services/meta-hierarchy-sync.service.js";

const router = Router();

router.get("/", async (req: any, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    settings.forEach((s) => {
      config[s.key] = s.value;
    });
    
    // Safely supply Facebook Client configuration based on Super Admin role
    const userId = req.user?.id;
    let dbUser = null;
    if (userId) {
      dbUser = await prisma.user.findUnique({ where: { id: userId } });
    }
    const isSuperAdmin = dbUser?.role === "SUPER_ADMIN" || dbUser?.role === "admin";

    if (isSuperAdmin) {
      const sysSetting = await prisma.systemSetting.findFirst();
      config["FACEBOOK_CLIENT_ID"] = sysSetting?.meta_client_id || config["FACEBOOK_CLIENT_ID"] || process.env.FACEBOOK_CLIENT_ID || "";
      config["FACEBOOK_CONFIG_ID"] = sysSetting?.meta_config_id || config["FACEBOOK_CONFIG_ID"] || process.env.FACEBOOK_CONFIG_ID || "";
      config["hasFbClientSecret"] = String(!!(sysSetting?.meta_client_secret || config["FACEBOOK_CLIENT_SECRET"] || process.env.FACEBOOK_CLIENT_SECRET));
    } else {
      delete config["FACEBOOK_CLIENT_ID"];
      delete config["FACEBOOK_CONFIG_ID"];
      delete config["FACEBOOK_CLIENT_SECRET"];
      config["hasFbClientSecret"] = "false";
    }
    
    // Multi-user isolation overrides for Facebook Account details
    let userFbAccount = null;
    if (userId) {
      userFbAccount = await prisma.facebookAccount.findUnique({
        where: { userId }
      });
    }

    if (userFbAccount && userFbAccount.accessToken) {
      config["FB_AUTHORIZED_USER_ID"] = userFbAccount.facebookId || "";
      config["FB_AUTHORIZED_USER_NAME"] = userFbAccount.facebookName || "";
      config["FB_AUTHORIZED_USER_LINK"] = userFbAccount.facebookLink || "";
      config["hasMetaToken"] = "true";
      // Do not expose real access token
    } else {
      // 绝对不能因为全局配置存在，就把上一个用户的绑定名字渲染给新用户！
      config["FB_AUTHORIZED_USER_ID"] = "";
      config["FB_AUTHORIZED_USER_NAME"] = "";
      config["FB_AUTHORIZED_USER_LINK"] = "";
      config["hasMetaToken"] = "false";
    }
    
    // Data desensitization: remove sensitive credentials
    delete config["META_ACCESS_TOKEN"];
    delete config["FACEBOOK_CLIENT_SECRET"];
    
    for (const key of Object.keys(config)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("gemini_key") || lowerKey.includes("_token")) {
        delete config[key];
      }
    }

    res.json(config);
  } catch (err) {
    res.json({ error: "Failed to fetch settings" });
  }
});

router.post("/meta-token", authenticateJWT as any, async (req: any, res) => {
  const { token } = req.body;
  const userId = req.user?.id;
  if (!token) return res.status(400).json({ error: "Token is required" });
  if (!userId) return res.status(401).json({ error: "用户未登录" });

  try {
    // 1. Validate the token
    const valRes = await axios.get("https://graph.facebook.com/v21.0/me", {
      params: { access_token: token },
    });
    if (!valRes.data || !valRes.data.id) {
       return res.status(400).json({ error: "无效的 Meta 访问令牌" });
    }

    const fbUserId = valRes.data.id;
    const fbUserName = valRes.data.name || "";

    // 2. Save directly to User model
    await prisma.user.update({
      where: { id: userId },
      data: {
        fb_access_token: token,
        fb_user_id: fbUserId,
        fb_user_name: fbUserName,
      }
    });

    // 3. Save to UserFacebookBinding
    await prisma.userFacebookBinding.upsert({
      where: { user_id: userId },
      update: {
        fb_user_id: fbUserId,
        fb_username: fbUserName,
        access_token: token,
        updated_at: new Date()
      },
      create: {
        user_id: userId,
        fb_user_id: fbUserId,
        fb_username: fbUserName,
        access_token: token
      }
    });

    // 4. Save to FacebookAccount
    await prisma.facebookAccount.upsert({
      where: { userId },
      update: {
        accessToken: token,
        facebookId: fbUserId,
        facebookName: fbUserName,
      },
      create: {
        userId,
        accessToken: token,
        facebookId: fbUserId,
        facebookName: fbUserName,
      }
    });

    // 触发绑定后首次全量初始化同步 (Initial Full Sync)
    triggerInitialFullSync(userId, token).catch(syncErr => {
      console.error(`[Save Meta Token] Trigger initial full sync failed for user ${userId}:`, syncErr);
    });

    res.json({ success: true, message: "Facebook 授权 Token 绑定成功" });
  } catch (err: any) {
    console.error("[Save Meta Token Error]:", err);
    if (axios.isAxiosError(err)) {
        res.status(400).json({ 
            error: "Meta API 连通失败，请检查令牌是否有效: " + (err.response?.data?.error?.message || err.message) 
        });
    } else {
        res.json({
          error: "Failed to save meta token",
          details: err instanceof Error ? err.message : String(err),
        });
    }
  }
});

router.post("/", authenticateJWT as any, async (req: any, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Key is required" });
  if (key === "META_ACCESS_TOKEN" || key === "meta_access_token") {
    return res.status(400).json({ error: "硬编码全局 META_ACCESS_TOKEN 已废除，请通过账号绑定使用动态 Token" });
  }
  try {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Save Token Error]:", err);
    if (
      err.name === "PrismaClientInitializationError" ||
      err.message?.includes("Authentication failed")
    ) {
      res
        .status(500)
        .json({
          error:
            "数据库连接失败，请检查环境变量 DATABASE_URL 是否正确或密码是否已过期。",
        });
    } else {
      res
        .status(500)
        .json({
          error: "Failed to save setting",
          details: err instanceof Error ? err.message : String(err),
        });
    }
  }
});

router.post("/test-smtp", async (req, res) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, targetEmail } = req.body;
  
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return res.status(400).json({ error: "SMTP 主机、端口、账户和密码均为必填项" });
  }

  // SSRF Protection: Validate SMTP_HOST
  if (!(await isSafeHost(SMTP_HOST))) {
    return res.status(403).json({ error: "Security Error: Invalid or prohibited SMTP host address" });
  }

  const emailToTest = targetEmail || SMTP_USER; // Default to self-send
  const portNum = parseInt(SMTP_PORT, 10);

  try {
    console.log(`[SMTP Route] Testing connection with host=${SMTP_HOST} port=${portNum} user=${SMTP_USER} toEmail=${emailToTest}`);
    const result = await testSmtpConnection(
      SMTP_HOST,
      portNum,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM || "",
      emailToTest
    );

    if (result.success) {
      res.json({ success: true, message: "邮件服务连接并测试发送成功！请检查您的邮箱收件箱。" });
    } else {
      res.status(400).json({ error: "SMTP 连接或发送失败", details: result.error });
    }
  } catch (err: any) {
    console.error("[SMTP Route] test-smtp handler error:", err);
    res.json({ error: "测试邮件服务时发生内部异常", details: err.message });
  }
});

const dirtyIdMarkers = ["mock", "dummy", "fake", "sample"];
const knownFabricatedInsightWindow = {
  accountId: "1352072466719315",
  date: { gte: "2026-06-08", lte: "2026-06-15" },
};

function dirtyEntityWhere() {
  return {
    OR: dirtyIdMarkers.flatMap((marker) => [
      { id: { contains: marker, mode: "insensitive" as const } },
      { accountId: { contains: marker, mode: "insensitive" as const } },
    ]),
  };
}

function markerInsightWhere() {
  return {
    OR: dirtyIdMarkers.map((marker) => ({
      accountId: { contains: marker, mode: "insensitive" as const },
    })),
  };
}

async function inspectDirtyData(client: any = prisma) {
  const [markerInsights, fabricatedWindowInsights, ads, adSets, campaigns, dirtyHealthBms, unverifiedStatusBms] = await Promise.all([
    client.adInsight.count({ where: markerInsightWhere() }),
    client.adInsight.count({ where: knownFabricatedInsightWindow }),
    client.ad.count({ where: dirtyEntityWhere() }),
    client.adSet.count({ where: dirtyEntityWhere() }),
    client.campaign.count({ where: dirtyEntityWhere() }),
    client.facebookBusinessManager.count({
      where: {
        OR: [
          { healthDetails: { contains: "mock", mode: "insensitive" } },
          { healthDetails: { contains: "dummy", mode: "insensitive" } },
          { healthDetails: { contains: "fake", mode: "insensitive" } },
        ],
      },
    }),
    client.facebookBusinessManager.count({
      where: {
        status: { in: ["DISABLED", "RESTRICTED", "UNKNOWN"] },
        OR: [
          { syncStatus: { not: "SUCCESS" } },
          { syncError: { not: null } },
        ],
      },
    }),
  ]);
  return {
    markerInsights,
    fabricatedWindowInsights,
    ads,
    adSets,
    campaigns,
    dirtyHealthBms,
    unverifiedStatusBms,
  };
}

// Historical fake-data cleanup is always two-step: preview first, then explicit apply.
router.post("/cleanup-dirty-data", async (req: any, res) => {
  const userId = Number(req.user?.id);
  const actor = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, org_id: true, status: true },
      })
    : null;
  const normalizedRole = String(actor?.role || "").toUpperCase();
  if (!actor || actor.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(normalizedRole)) {
    return res.status(403).json({ success: false, error: "仅管理员可检查或处理历史虚假数据" });
  }

  try {
    const { apply = false, batchId, confirmation, includeBmRepair = false } = req.body || {};
    if (!apply) {
      const candidates = await inspectDirtyData();
      const batch = await prisma.metaActionLog.create({
        data: {
          userId: actor.id,
          orgId: actor.org_id,
          action: "CLEANUP_HISTORICAL_FAKE_DATA",
          status: "PENDING",
          requestJson: {
            mode: "PREVIEW",
            knownFabricatedWindow: knownFabricatedInsightWindow,
            idMarkers: dirtyIdMarkers,
          },
          resultJson: { candidates },
        },
      });
      return res.json({
        success: true,
        applied: false,
        batchId: batch.id,
        confirmation: `DELETE_FAKE_DATA_${batch.id}`,
        candidates,
        warning: "当前仅完成预览，没有修改数据库。BM 健康状态默认不会修改；确认数量后再提交 apply=true。",
      });
    }

    if (!batchId || confirmation !== `DELETE_FAKE_DATA_${batchId}`) {
      return res.status(400).json({ success: false, error: "清理批次或确认字符串不正确" });
    }
    const batch = await prisma.metaActionLog.findFirst({
      where: {
        id: String(batchId),
        userId: actor.id,
        action: "CLEANUP_HISTORICAL_FAKE_DATA",
        status: "PENDING",
      },
    });
    if (!batch) {
      return res.status(404).json({ success: false, error: "清理批次不存在、已执行或不属于当前用户" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const before = await inspectDirtyData(tx);
      const deletedMarkerInsights = await tx.adInsight.deleteMany({ where: markerInsightWhere() });
      const sanitizedWindowInsights = await tx.adInsight.updateMany({
        where: knownFabricatedInsightWindow,
        data: {
          addToCart: 0,
          initiateCheckout: 0,
          purchases: 0,
          purchaseValue: 0,
          atcRate: 0,
          checkoutRate: 0,
          cpp: 0,
          roas: 0,
        },
      });
      const deletedAds = await tx.ad.deleteMany({ where: dirtyEntityWhere() });
      const deletedAdSets = await tx.adSet.deleteMany({ where: dirtyEntityWhere() });
      const deletedCampaigns = await tx.campaign.deleteMany({ where: dirtyEntityWhere() });

      let cleanedBmHealth = 0;
      let resetBmStatus = 0;
      if (includeBmRepair === true) {
        const dirtyBms = await tx.facebookBusinessManager.findMany({
          where: {
            OR: [
              { healthDetails: { contains: "mock", mode: "insensitive" } },
              { healthDetails: { contains: "dummy", mode: "insensitive" } },
              { healthDetails: { contains: "fake", mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        for (const bm of dirtyBms) {
          await tx.facebookBusinessManager.update({
            where: { id: bm.id },
            data: {
              healthDetails: null,
              status: "PENDING_SYNC",
              syncStatus: "FAILED",
              syncError: "历史非真实健康数据已清除，等待重新同步 Meta",
            },
          });
        }
        const resetBms = await tx.facebookBusinessManager.updateMany({
          where: {
            status: { in: ["DISABLED", "RESTRICTED", "UNKNOWN"] },
            OR: [
              { syncStatus: { not: "SUCCESS" } },
              { syncError: { not: null } },
            ],
          },
          data: { status: "PENDING_SYNC" },
        });
        cleanedBmHealth = dirtyBms.length;
        resetBmStatus = resetBms.count;
      }

      return {
        before,
        deleted: {
          markerInsights: deletedMarkerInsights.count,
          ads: deletedAds.count,
          adSets: deletedAdSets.count,
          campaigns: deletedCampaigns.count,
          cleanedBmHealth,
          resetBmStatus,
        },
        bmRepairApplied: includeBmRepair === true,
        sanitized: {
          fabricatedWindowInsights: sanitizedWindowInsights.count,
          preservedFields: ["spend", "reach", "impressions", "clicks", "cpc", "ctr"],
          resetFields: [
            "addToCart",
            "initiateCheckout",
            "purchases",
            "purchaseValue",
            "atcRate",
            "checkoutRate",
            "cpp",
            "roas",
          ],
        },
      };
    });

    await prisma.metaActionLog.update({
      where: { id: batch.id },
      data: {
        status: "SUCCESS",
        resultJson: result,
      },
    });
    return res.json({
      success: true,
      applied: true,
      batchId: batch.id,
      result,
      message: "测试 ID 记录已清理；污染时间窗保留真实基础指标，仅转化指标归零并等待重新同步 Meta。",
    });
  } catch (error: any) {
    if (req.body?.batchId) {
      await prisma.metaActionLog.updateMany({
        where: {
          id: String(req.body.batchId),
          userId: actor.id,
          status: "PENDING",
        },
        data: {
          status: "FAILED",
          errorMessage: error.message,
        },
      }).catch(() => null);
    }
    console.error("Failed to cleanup historical fake data:", error);
    return res.status(500).json({
      success: false,
      error: "清理数据库失败",
      details: error.message,
    });
  }
});

export default router;
