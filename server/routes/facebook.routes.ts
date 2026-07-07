import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

router.get("/auth-url", async (req: any, res) => {
  try {
    const systemConfig = await prisma.systemSetting.findFirst();
    if (!systemConfig || !systemConfig.meta_config_id || !systemConfig.meta_client_id) {
      return res.status(500).json({ error: "系统未配置 Meta 基础应用凭证，请联系超级管理员" });
    }

    const clientId = systemConfig.meta_client_id;
    const configId = systemConfig.meta_config_id;

    // Use the exact redirect URI specified by the user
    const redirectUriVal = "https://1-eight-azure.vercel.app/api/auth/facebook/callback";
    const redirectUri = encodeURIComponent(redirectUriVal);

    const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&config_id=${configId}&response_type=code&scope=business_management,ads_management,email,public_profile`;

    return res.json({ url: authUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
