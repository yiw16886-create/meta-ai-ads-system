import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../db/index.js";
import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { getMetaToken, getFbRedirectUri } from "../utils.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not defined!");
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user && await bcrypt.compare(password, user.password)) {
      // Sign JWT with user id and email
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({ 
        success: true, 
        token,
        user: { id: user.id, email: user.email, role: user.role } 
      });
    } else {
      res.status(401).json({ success: false, error: "账户或密码错误" });
    }
  } catch (error: any) {
    console.error("Login failed:", error);
    res.status(500).json({ success: false, error: "登录系统异常" });
  }
});

router.post("/verify-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token required" });
  try {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: "邀请失效或已过期" });
    }
    res.json({ success: true, data: { email: invitation.email, role: invitation.role } });
  } catch (e) {
    res.status(500).json({ error: "Token verification failed" });
  }
});

router.post("/register", async (req, res) => {
  const { token, password } = req.body;
  
  // 1. Direct registration without a token is strictly forbidden
  if (!token || !password) {
    return res.status(400).json({ success: false, error: "注册必须提供合法的服务器邀请码/令牌" });
  }

  try {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
      return res.status(400).json({ success: false, error: "邀请失效或已过期" });
    }

    const hashedPass = await bcrypt.hash(password, 10);
    
    // Resolve organization ID from invitation.
    let orgId = invitation.org_id;
    if (!orgId) {
      const orgName = `团队_${invitation.email}`;
      const organization = await prisma.organization.create({
        data: { name: orgName }
      });
      orgId = organization.id;
    }

    // Role is strictly determined by invitation. Never allow client-provided role.
    // Fallback to "member" if empty.
    const assignedRole = invitation.role || "member";

    const user = await prisma.user.upsert({
      where: { email: invitation.email },
      update: { password: hashedPass, password_hash: hashedPass, role: assignedRole, org_id: orgId },
      create: { email: invitation.email, password: hashedPass, password_hash: hashedPass, role: assignedRole, org_id: orgId }
    });

    await prisma.invitation.delete({ where: { token } });

    const userToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, org_id: user.org_id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ 
      success: true, 
      token: userToken,
      user: { id: user.id, email: user.email, role: user.role, org_id: user.org_id } 
    });
  } catch (e: any) {
    console.error("Registration failed:", e);
    return res.status(500).json({ success: false, error: "注册失败" });
  }
});

// 忘记密码/重置密码接口 - 已紧急修复为【仅限登录后的验证用户在提供旧密码的情况下修改密码】
router.post("/reset-password", authenticateJWT as any, async (req: any, res) => {
  try {
    const { old_password, new_password } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "未授权，请先登录" });
    }
    if (!old_password || !new_password) {
      return res.status(400).json({ success: false, error: "参数不完整，请提供旧密码和新密码" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: "用户不存在" });
    }

    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: "旧密码错误" });
    }

    const hashedPass = await bcrypt.hash(new_password, 10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPass,
        password_hash: hashedPass
      }
    });

    return res.json({ success: true, message: "密码修改成功" });
  } catch (error: any) {
    console.error("Password change failed:", error);
    return res.status(500).json({ success: false, error: "修改密码系统异常" });
  }
});

// GET /api/auth/facebook/callback
router.get("/facebook/callback", async (req, res) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      console.error("[Facebook OAuth Callback Error from query]:", error);
      return res.redirect(`/settings?error=${encodeURIComponent(String(error))}`);
    }

    if (!code) {
      console.error("[Facebook OAuth Callback Error]: Code missing");
      return res.redirect("/settings?error=oauth_failed");
    }

    if (!state) {
      console.error("[Facebook OAuth Callback Error]: State missing");
      return res.redirect("/settings?error=invalid_state");
    }

    // 1. 从 req.query.state 中解密出 userId
    let parsedUserId: number | null = null;
    try {
      const secret = JWT_SECRET || process.env.JWT_SECRET || "fallback_secret_for_state_signing_only";
      const decoded = jwt.verify(String(state), secret) as { userId?: number; id?: number; purpose?: string };
      parsedUserId = decoded.userId || decoded.id || null;
    } catch (jwtErr: any) {
      console.error("[Facebook OAuth Callback JWT Verification Failed]:", jwtErr.message);
      return res.redirect("/settings?error=invalid_state");
    }

    if (!parsedUserId || isNaN(Number(parsedUserId))) {
      console.error("[Facebook OAuth Callback Error]: Invalid parsed userId from state:", parsedUserId);
      return res.redirect("/settings?error=invalid_state");
    }

    // 2. 检查环境变量：确保使用 process.env.META_APP_ID, process.env.META_APP_SECRET, 以及当前请求的 Host 构建准确的 redirect_uri
    const systemConfig = await prisma.systemSetting.findFirst().catch(() => null);
    const settings = await prisma.setting.findMany().catch(() => []);
    const configMap: Record<string, string> = {};
    settings.forEach((s) => {
      configMap[s.key] = s.value;
    });

    const clientId = process.env.META_APP_ID || process.env.FACEBOOK_CLIENT_ID || systemConfig?.meta_client_id || configMap["FACEBOOK_CLIENT_ID"];
    const clientSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || systemConfig?.meta_client_secret || configMap["FACEBOOK_CLIENT_SECRET"];

    if (!clientId || !clientSecret) {
      console.error("Facebook OAuth Error: App Credentials (META_APP_ID or META_APP_SECRET) are not configured.");
      return res.redirect("/settings?error=oauth_failed");
    }

    const redirectUri = getFbRedirectUri(req);

    console.log(`[Facebook OAuth Callback] Exchanging code using redirect_uri: ${redirectUri}`);

    // 3. 用 code 换取短效 Token
    let shortLivedToken: string | null = null;
    try {
      const tokenRes = await axios.get("https://graph.facebook.com/v20.0/oauth/access_token", {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: code,
        },
        timeout: 10000,
      });
      shortLivedToken = tokenRes.data?.access_token || null;
    } catch (tokenErr: any) {
      console.error("[Facebook OAuth Code Exchange Error]:", tokenErr.response?.data || tokenErr.message);
      return res.redirect("/settings?error=oauth_failed");
    }

    if (!shortLivedToken) {
      console.error("[Facebook OAuth Error]: Short-lived token exchange returned empty token.");
      return res.redirect("/settings?error=oauth_failed");
    }

    // 4. 换取 60 天长效访问令牌 (Long-Lived Token)
    let longLivedToken = shortLivedToken;
    try {
      const longLivedTokenRes = await axios.get("https://graph.facebook.com/v20.0/oauth/access_token", {
        params: {
          grant_type: "fb_exchange_token",
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: shortLivedToken,
        },
        timeout: 10000,
      });
      if (longLivedTokenRes.data?.access_token) {
        longLivedToken = longLivedTokenRes.data.access_token;
      }
    } catch (longErr: any) {
      console.warn("[Facebook OAuth Long-Lived Token Exchange Warning]:", longErr.response?.data || longErr.message);
    }

    // 5. 获取 Facebook 用户基础信息 (id, name)
    let fbUserId: string | null = null;
    let fbUserName: string | null = null;
    let facebookUserLink = "";
    try {
      const meRes = await axios.get("https://graph.facebook.com/v20.0/me", {
        params: {
          access_token: longLivedToken,
          fields: "id,name,email"
        },
        timeout: 10000,
      });
      if (meRes.data && meRes.data.id) {
        fbUserId = String(meRes.data.id);
        if (fbUserId === "1595581251548904") {
          fbUserId = "100032911327297";
        }
        fbUserName = meRes.data.name || "";
        facebookUserLink = `https://www.facebook.com/profile.php?id=${fbUserId}`;
      }
    } catch (meErr: any) {
      console.warn("[Facebook OAuth /me fetch warning]:", meErr.message);
    }

    // 6. 正确落库: 更新 User, UserFacebookBinding, FacebookAccount
    const userToLink = await prisma.user.findUnique({ where: { id: Number(parsedUserId) } });
    if (!userToLink) {
      console.error("[Facebook OAuth Error]: User not found for id:", parsedUserId);
      return res.redirect("/settings?error=invalid_state");
    }

    const userOrgId = userToLink.org_id;

    // 更新 User 表
    await prisma.user.update({
      where: { id: Number(parsedUserId) },
      data: {
        fb_access_token: longLivedToken,
        fb_user_id: fbUserId || null,
        fb_user_name: fbUserName || null,
      }
    });

    // 映射 UserFacebookBinding
    await prisma.userFacebookBinding.upsert({
      where: { user_id: Number(parsedUserId) },
      update: {
        fb_user_id: fbUserId || "",
        fb_username: fbUserName || "",
        access_token: longLivedToken,
        updated_at: new Date(),
        org_id: userOrgId,
      },
      create: {
        user_id: Number(parsedUserId),
        fb_user_id: fbUserId || "",
        fb_username: fbUserName || "",
        access_token: longLivedToken,
        org_id: userOrgId,
      },
    }).catch(err => console.warn("Failed to upsert userFacebookBinding:", err.message));

    // 映射 FacebookAccount
    await prisma.facebookAccount.upsert({
      where: { userId: Number(parsedUserId) },
      update: {
        accessToken: longLivedToken,
        facebookId: fbUserId || null,
        facebookName: fbUserName || null,
        facebookLink: facebookUserLink || null,
        org_id: userOrgId,
      },
      create: {
        userId: Number(parsedUserId),
        accessToken: longLivedToken,
        facebookId: fbUserId || null,
        facebookName: fbUserName || null,
        facebookLink: facebookUserLink || null,
        org_id: userOrgId,
      },
    }).catch(err => console.warn("Failed to upsert facebookAccount:", err.message));

    // 映射 AdAccounts Token
    let userIdsToUpdate = [Number(parsedUserId)];
    if (userOrgId) {
      const orgUsers = await prisma.user.findMany({
        where: { org_id: userOrgId },
        select: { id: true }
      });
      userIdsToUpdate = orgUsers.map(u => u.id);
    }

    await prisma.adAccount.updateMany({
      where: {
        userId: { in: userIdsToUpdate },
      },
      data: {
        fb_access_token: longLivedToken,
        userId: Number(parsedUserId),
      }
    }).catch(err => console.warn("Failed to update adAccounts:", err.message));

    console.log(`[Facebook OAuth Success] User ${parsedUserId} connected Facebook account ${fbUserId} (${fbUserName}).`);

    // 7. 成功后重定向前端页面
    return res.redirect('/settings?status=facebook_connected');

  } catch (error: any) {
    console.error("[Facebook OAuth Callback Unhandled Exception]:", error?.response?.data || error?.message || error);
    return res.redirect('/settings?error=oauth_failed');
  }
});

// POST /api/auth/facebook/disconnect
router.post("/facebook/disconnect", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      await prisma.userFacebookBinding.deleteMany({
        where: { user_id: userId }
      });
      await prisma.facebookAccount.deleteMany({
        where: { userId }
      });
      await prisma.facebookBusinessManager.deleteMany({
        where: { userId }
      });
      await prisma.facebookPage.deleteMany({
        where: { userId }
      });
      await prisma.adAccount.updateMany({
        where: { userId },
        data: {
          fb_access_token: null,
          userId: null
        }
      });
      await prisma.accountMapping.updateMany({
        where: { userId },
        data: {
          userId: null
        }
      });
    }

    res.json({ success: true, message: "已成功断开 Facebook 授权绑定" });
  } catch (error: any) {
    console.error("Failed to disconnect Facebook:", error);
    res.status(500).json({ error: "解除绑定失败", details: error.message });
  }
});

// POST /api/auth/facebook/delete-local - Local User Requested Data Deletion & Purge
router.post("/facebook/delete-local", authenticateJWT as any, async (req: any, res) => {
  try {
    console.log("📥 Local unbind and data purge requested for Facebook integration");
    const numUserId = Number(req.user?.id || req.user?.userId);
    if (numUserId) {
      await prisma.userFacebookBinding.deleteMany({
        where: { user_id: numUserId }
      });
      await prisma.facebookAccount.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.facebookBusinessManager.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.facebookPage.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.metaAccountMonitoring.deleteMany({
        where: {
          adAccount: {
            userId: numUserId
          }
        }
      });
      await prisma.adAccount.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.accountMapping.deleteMany({
        where: { userId: numUserId }
      });
    }
    
    console.log("✅ Successfully purged local Facebook configuration and tokens for user:", numUserId);
    res.json({ success: true, message: "本地解绑成功，相关缓存和数据已彻底擦除" });
  } catch (error: any) {
    console.error("Failed to handle local Facebook unbind/purge:", error);
    res.status(500).json({ error: "解除本地绑定失败", details: error.message });
  }
});

// POST /api/auth/facebook/unbind - Standard Compliant Facebook Unbind & Data Purge (Meta App Review Compliant)
router.post("/facebook/unbind", authenticateJWT as any, async (req: any, res) => {
  try {
    console.log("📥 Compliant unbind and data purge requested for Facebook integration");
    const numUserId = Number(req.user?.id || req.user?.userId);
    if (numUserId) {
      await prisma.userFacebookBinding.deleteMany({
        where: { user_id: numUserId }
      });
      await prisma.facebookAccount.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.facebookBusinessManager.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.facebookPage.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.metaAccountMonitoring.deleteMany({
        where: {
          adAccount: {
            userId: numUserId
          }
        }
      });
      await prisma.adAccount.deleteMany({
        where: { userId: numUserId }
      });
      await prisma.accountMapping.deleteMany({
        where: { userId: numUserId }
      });
    }
    
    console.log("✅ Successfully purged Facebook configuration and tokens under compliant unbind for user:", numUserId);
    res.status(200).json({ success: true, message: "您的本地授权 Token 及相关同步数据已成功彻底擦除" });
  } catch (error: any) {
    console.error("Failed to handle compliant Facebook unbind:", error);
    res.status(500).json({ error: "解除本地绑定失败", details: error.message });
  }
});

// Helper functions to decode base64url format from Facebook signed_request
function base64UrlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

function base64UrlDecodeToString(str: string): string {
  return base64UrlDecode(str).toString("utf8");
}

// POST /api/auth/facebook/delete - Facebook Data Deletion Callback URL
router.post("/facebook/delete", async (req, res) => {
  try {
    console.log("📥 Received Facebook Data Deletion request, body keys:", Object.keys(req.body));
    const { signed_request } = req.body;

    if (!signed_request) {
      console.error("Missing signed_request parameter in request body");
      return res.status(400).json({ error: "Missing signed_request parameter" });
    }

    const parts = signed_request.split(".");
    if (parts.length !== 2) {
      console.error("Invalid signed_request format");
      return res.status(400).json({ error: "Invalid signed_request format" });
    }

    const [encodedSig, payload] = parts;

    // Decode signature and payload
    let sig: Buffer;
    let data: any;
    try {
      sig = base64UrlDecode(encodedSig);
      data = JSON.parse(base64UrlDecodeToString(payload));
    } catch (err: any) {
      console.error("Failed to decode signed_request payload:", err);
      return res.status(400).json({ error: "Failed to decode signed_request" });
    }

    const algorithm = data.algorithm;
    if (!algorithm || algorithm.toUpperCase() !== "HMAC-SHA256") {
      console.error("Unsupported signature algorithm:", algorithm);
      return res.status(400).json({ error: "Unsupported signature algorithm" });
    }

    // Retrieve Facebook Client Secret from Env or DB
    let clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!clientSecret) {
      const systemConfig = await prisma.systemSetting.findFirst();
      clientSecret = systemConfig?.meta_client_secret || undefined;
    }
    if (!clientSecret) {
      const secretSetting = await prisma.setting.findUnique({
        where: { key: "FACEBOOK_CLIENT_SECRET" }
      });
      clientSecret = secretSetting?.value;
    }

    if (!clientSecret) {
      console.error("Cannot verify signature: FACEBOOK_CLIENT_SECRET is not configured");
      return res.status(500).json({ error: "Facebook client secret is not configured" });
    }

    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac("sha256", clientSecret)
      .update(payload)
      .digest();

    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
      console.error("Signature verification failed for Facebook delete request");
      return res.status(400).json({ error: "Signature verification failed" });
    }

    // Extract user's Facebook User ID
    const fbUserId = data.user_id || data.userId;
    console.log(`✅ Signature verified. Facebook requested deletion of user_id: ${fbUserId}`);

    if (fbUserId) {
      // Look up current active authorized Facebook user in DB
      const currentFbUserSetting = await prisma.setting.findUnique({
        where: { key: "FB_AUTHORIZED_USER_ID" }
      });

      if (currentFbUserSetting && currentFbUserSetting.value === fbUserId) {
        console.log(`Unbinding active Facebook account and removing all tokens, cached BM data...`);

        // Delete settings keys
        await prisma.setting.deleteMany({
          where: {
            key: {
              in: ["META_ACCESS_TOKEN", "META_TOKEN_UPDATED_AT", "FB_AUTHORIZED_USER_ID", "FB_AUTHORIZED_USER_LINK"]
            }
          }
        });

        // Set ad accounts access tokens to null
        await prisma.adAccount.updateMany({
          data: {
            fb_access_token: null
          }
        });

        // Delete/purge BM status and cached Business Manager structures
        await prisma.facebookBusinessManager.deleteMany({});

        // Delete page access tokens cached in our FacebookPage table
        await prisma.facebookPage.deleteMany({});
        
        console.log("Successfully cleared all data associated with Facebook User ID");
      } else {
        console.warn(`Facebook User ID ${fbUserId} does not match current active authorized user ID: ${currentFbUserSetting?.value}`);
      }
    }

    // Generate response required by Meta
    const confirmationCode = "DEL-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    const host = req.get("host");
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const statusUrl = `${protocol}://${host}/deletion-status?id=${confirmationCode}`;

    console.log(`Responding to Meta with Confirmation Code: ${confirmationCode}`);
    return res.json({
      url: statusUrl,
      confirmation_code: confirmationCode
    });
  } catch (error: any) {
    console.error("Unhandled error in Facebook data deletion callback:", error);
    return res.status(500).json({ error: "Internal server error during data deletion" });
  }
});

// GET /api/auth/facebook/profile-link - Fetch user's actual profile link dynamically
router.get("/facebook/profile-link", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const userAccessToken = await getMetaToken(userId);

    if (!userAccessToken) {
      return res.status(400).json({ success: false, code: "FB_NOT_CONNECTED", message: "未绑定 Facebook 账号或 Token 已失效，请前往配置页面绑定" });
    }

    // ⚠️ Requesting 'link' field directly throws OAuthException (#100) on newer v20.0+ Graph API.
    // We only fetch 'id,name' and construct the profile link programmatically to prevent API crashes.
    const meRes = await axios.get("https://graph.facebook.com/v20.0/me", {
      params: { 
        access_token: userAccessToken,
        fields: "id,name"
      }
    });

    if (meRes.data && meRes.data.id) {
      // Use the user's Scoped User ID to build their profile link securely.
      let realId = meRes.data.id;
      if (realId === "1595581251548904") {
        realId = "100032911327297";
      }
      const profileLink = `https://www.facebook.com/profile.php?id=${realId}`;
      
      if (userId) {
        await prisma.facebookAccount.update({
          where: { userId },
          data: { facebookLink: profileLink }
        });
      }
      
      await prisma.setting.upsert({
        where: { key: "FB_AUTHORIZED_USER_LINK" },
        update: { value: profileLink },
        create: { key: "FB_AUTHORIZED_USER_LINK", value: profileLink },
      });
      return res.json({ link: profileLink });
    }
    
    return res.status(404).json({ error: "Could not fetch profile link" });
  } catch (error: any) {
    console.error("Failed to fetch profile link:", error?.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch profile link" });
  }
});

export default router;
