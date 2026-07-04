import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    settings.forEach((s) => {
      config[s.key] = s.value;
    });
    
    // Safely supply Facebook Client configuration
    config["FACEBOOK_CLIENT_ID"] = config["FACEBOOK_CLIENT_ID"] || process.env.FACEBOOK_CLIENT_ID || "";
    config["FACEBOOK_CONFIG_ID"] = config["FACEBOOK_CONFIG_ID"] || process.env.FACEBOOK_CONFIG_ID || "";
    config["hasFbClientSecret"] = String(!!(config["FACEBOOK_CLIENT_SECRET"] || process.env.FACEBOOK_CLIENT_SECRET));
    config["FB_AUTHORIZED_USER_ID"] = config["FB_AUTHORIZED_USER_ID"] || "";
    
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

export default router;