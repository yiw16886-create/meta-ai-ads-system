import { Router } from "express";
import prisma from "../../db/index.js";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_state_signing_only";

router.get("/auth-url", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未授权操作，请先登录" });
    }

    const systemConfig = await prisma.systemSetting.findFirst();
    if (!systemConfig || !systemConfig.meta_config_id || !systemConfig.meta_client_id) {
      return res.status(500).json({ error: "系统未配置 Meta 基础应用凭证，请联系超级管理员" });
    }

    const clientId = systemConfig.meta_client_id;
    const configId = systemConfig.meta_config_id;

    // Use the exact redirect URI specified by the user
    const redirectUriVal = "https://1-eight-azure.vercel.app/api/auth/facebook/callback";
    const redirectUri = encodeURIComponent(redirectUriVal);

    // Generate a signed state JWT token with 10-minute expiry to protect against CSRF and identify current user securely
    const stateToken = jwt.sign(
      { userId, purpose: "facebook-oauth" },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&config_id=${configId}&response_type=code&scope=business_management,ads_management,email,public_profile&state=${encodeURIComponent(stateToken)}`;

    return res.json({ url: authUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 【4. 企业 Facebook 绑定关联接口：POST /api/facebook/bind】
router.post("/bind", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "未授权，无法绑定" });
    }

    const { fb_user_id, fb_username, access_token } = req.body;
    if (!fb_user_id || !fb_username || !access_token) {
      return res.status(400).json({ success: false, error: "参数不完整，绑定失败" });
    }

    // 核心入库隔离逻辑 (Upsert)
    const binding = await prisma.userFacebookBinding.upsert({
      where: { user_id: userId },
      update: {
        fb_user_id,
        fb_username,
        access_token,
        updated_at: new Date()
      },
      create: {
        user_id: userId,
        fb_user_id,
        fb_username,
        access_token
      }
    });

    return res.json({
      success: true,
      message: "Facebook 关联绑定成功",
      binding: {
        id: binding.id,
        user_id: binding.user_id,
        fb_user_id: binding.fb_user_id,
        fb_username: binding.fb_username,
        authorized_at: binding.authorized_at
      }
    });
  } catch (error: any) {
    console.error("Facebook binding failed:", error);
    return res.status(500).json({ success: false, error: "关联绑定 Facebook 失败，请稍后重试", details: error.message });
  }
});

export default router;
