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
    res.status(500).json({ error: "Failed to fetch settings" });
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
        res.status(500).json({
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
    res.status(500).json({ error: "测试邮件服务时发生内部异常", details: err.message });
  }
});

// Clean up dirty historical mock/dummy database records & caches
router.post("/cleanup-dirty-data", async (req: any, res) => {
  try {
    console.log("🧹 Admin request: Cleaning up all mock/dummy database records...");

    // 1. Delete AdInsights with mock/dummy accountIds
    const deletedInsights = await prisma.adInsight.deleteMany({
      where: {
        OR: [
          { accountId: { contains: "mock" } },
          { accountId: { contains: "dummy" } },
          { accountId: { contains: "fake" } },
          { accountId: { contains: "sample" } }
        ]
      }
    });

    // 2. Delete Ads, AdSets, Campaigns with mock/dummy indicators
    const deletedAds = await prisma.ad.deleteMany({
      where: {
        OR: [
          { id: { contains: "mock" } },
          { id: { contains: "dummy" } },
          { name: { contains: "mock" } },
          { name: { contains: "dummy" } },
          { name: { contains: "sample" } },
          { accountId: { contains: "mock" } },
          { accountId: { contains: "dummy" } }
        ]
      }
    });

    const deletedAdSets = await prisma.adSet.deleteMany({
      where: {
        OR: [
          { id: { contains: "mock" } },
          { id: { contains: "dummy" } },
          { name: { contains: "mock" } },
          { name: { contains: "dummy" } },
          { name: { contains: "sample" } },
          { accountId: { contains: "mock" } },
          { accountId: { contains: "dummy" } }
        ]
      }
    });

    const deletedCampaigns = await prisma.campaign.deleteMany({
      where: {
        OR: [
          { id: { contains: "mock" } },
          { id: { contains: "dummy" } },
          { name: { contains: "mock" } },
          { name: { contains: "dummy" } },
          { name: { contains: "sample" } },
          { accountId: { contains: "mock" } },
          { accountId: { contains: "dummy" } }
        ]
      }
    });

    // 3. Clean up BMs which might have mock data in healthDetails
    const bms = await prisma.facebookBusinessManager.findMany();
    let updatedBmsCount = 0;
    for (const bm of bms) {
      if (bm.healthDetails && (bm.healthDetails.includes("mock") || bm.healthDetails.includes("dummy"))) {
        const cleanHealth = JSON.stringify({
          adAccounts: { total: 0, active: 0, disabled: 0, pendingReview: 0, details: [] },
          pages: { total: 0, published: 0, unpublished: 0, details: [] },
          pixels: { total: 0, details: [] },
          lastSynced: new Date().toISOString()
        });

        await prisma.facebookBusinessManager.update({
          where: { id: bm.id },
          data: { healthDetails: cleanHealth }
        });
        updatedBmsCount++;
      }
    }

    // 4. 把数据库里所有尚未经过 Meta API 验证、却被误标记为 DISABLED / RESTRICTED / UNKNOWN 的 BM 状态批量重置为 PENDING_SYNC
    const resetBms = await prisma.facebookBusinessManager.updateMany({
      where: {
        status: { in: ["DISABLED", "RESTRICTED", "UNKNOWN"] },
        OR: [
          { syncStatus: { not: "SUCCESS" } },
          { syncError: { not: null } }
        ]
      },
      data: {
        status: "PENDING_SYNC"
      }
    });

    res.json({
      success: true,
      message: "成功清理數據庫中所有的歷史虛假與 Mock 數據！",
      details: {
        deletedInsightsCount: deletedInsights.count,
        deletedCampaignsCount: deletedCampaigns.count,
        deletedAdSetsCount: deletedAdSets.count,
        deletedAdsCount: deletedAds.count,
        updatedBmsCount,
        resetBmsCount: resetBms.count
      }
    });
  } catch (error: any) {
    console.error("Failed to cleanup mock database records:", error);
    res.status(500).json({
      success: false,
      error: "清理數據庫失敗",
      details: error.message
    });
  }
});

export default router;
