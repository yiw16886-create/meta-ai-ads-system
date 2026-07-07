import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { testSmtpConnection } from "../services/email.service.js";

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

    if (userFbAccount) {
      config["FB_AUTHORIZED_USER_ID"] = userFbAccount.facebookId || "";
      config["FB_AUTHORIZED_USER_NAME"] = userFbAccount.facebookName || "";
      config["FB_AUTHORIZED_USER_LINK"] = userFbAccount.facebookLink || "";
      config["META_ACCESS_TOKEN"] = userFbAccount.accessToken || "";
    } else {
      // Fallback: If no user-specific FacebookAccount exists, but global settings have a valid token, we use the global values.
      const globalToken = config["META_ACCESS_TOKEN"];
      if (globalToken && userId) {
        // Auto-migrate: Create a user-specific FacebookAccount entry to synchronize them properly
        try {
          await prisma.facebookAccount.create({
            data: {
              userId,
              accessToken: globalToken,
              facebookId: config["FB_AUTHORIZED_USER_ID"] || null,
              facebookName: config["FB_AUTHORIZED_USER_NAME"] || null,
              facebookLink: config["FB_AUTHORIZED_USER_LINK"] || null,
            }
          });
          console.log(`⚡ Auto-migrated global Facebook configuration to user ID: ${userId}`);
        } catch (migErr) {
          console.warn("Auto-migration of FacebookAccount failed:", migErr);
        }
      }
      config["FB_AUTHORIZED_USER_ID"] = config["FB_AUTHORIZED_USER_ID"] || "";
      config["FB_AUTHORIZED_USER_NAME"] = config["FB_AUTHORIZED_USER_NAME"] || "";
      config["FB_AUTHORIZED_USER_LINK"] = config["FB_AUTHORIZED_USER_LINK"] || "";
      config["META_ACCESS_TOKEN"] = config["META_ACCESS_TOKEN"] || "";
    }
    
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/meta-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token is required" });
  try {
    // 1. Validate the token
    const valRes = await axios.get("https://graph.facebook.com/v21.0/me", {
      params: { access_token: token },
    });
    if (!valRes.data || !valRes.data.id) {
       return res.status(400).json({ error: "无效的 Meta 访问令牌" });
    }

    // 2. Save to settings
    await prisma.setting.upsert({
      where: { key: "META_ACCESS_TOKEN" },
      update: { value: token },
      create: { key: "META_ACCESS_TOKEN", value: token },
    });

    const now = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: "META_TOKEN_UPDATED_AT" },
      update: { value: now },
      create: { key: "META_TOKEN_UPDATED_AT", value: now },
    });

    // 3. Update all AdAccounts where token is different or null
    const result = await prisma.adAccount.updateMany({
      where: {
        OR: [
          { fb_access_token: { not: token } },
          { fb_access_token: null }
        ]
      },
      data: {
        fb_access_token: token,
      }
    });

    res.json({ success: true, updatedAccountsCount: result.count, timestamp: now });
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

router.post("/", async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Key is required" });
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

export default router;
