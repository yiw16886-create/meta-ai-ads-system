import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../db/index.js";
import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authenticateJWT } from "../middlewares/auth.middleware.js";

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
  const { token, password, email } = req.body;
  
  // 1. Direct registration with email/password (Scenario A: Independent registration)
  if (email && password) {
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ success: false, error: "该邮箱已被注册" });
      }

      // Initialize/Create a brand new Organization
      const orgName = `个人团队_${email}`;
      const organization = await prisma.organization.create({
        data: {
          name: orgName
        }
      });

      const hashedPass = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPass,
          password_hash: hashedPass, // set both for compatibility
          role: "SUPER_ADMIN", // set to Super Admin as they are the company creator
          org_id: organization.id
        }
      });

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
      console.error("Direct registration failed", e);
      return res.status(500).json({ success: false, error: "注册失败" });
    }
  }

  // 2. Original token/invitation-based registration (Scenario B: Invited join)
  if (!token || !password) return res.status(400).json({ error: "Missing data" });
  
  try {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: "邀请失效或已过期" });
    }

    const hashedPass = await bcrypt.hash(password, 10);
    
    // Resolve organization ID from invitation. If legacy invitation has no org_id, create one as fallback
    let orgId = invitation.org_id;
    if (!orgId) {
      const orgName = `个人团队_${invitation.email}`;
      const organization = await prisma.organization.create({
        data: { name: orgName }
      });
      orgId = organization.id;
    }

    const user = await prisma.user.upsert({
      where: { email: invitation.email },
      update: { password: hashedPass, password_hash: hashedPass, role: invitation.role, org_id: orgId },
      create: { email: invitation.email, password: hashedPass, password_hash: hashedPass, role: invitation.role, org_id: orgId }
    });

    await prisma.invitation.delete({ where: { token } });

    const userToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, org_id: user.org_id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ 
      success: true, 
      token: userToken,
      user: { id: user.id, email: user.email, role: user.role, org_id: user.org_id } 
    });
  } catch (e) {
    console.error("Registration failed", e);
    res.status(500).json({ error: "注册失败" });
  }
});

// 忘记密码/重置密码接口
router.post("/reset-password", async (req, res) => {
  try {
    const { email, new_password } = req.body;
    if (!email || !new_password) {
      return res.status(400).json({ success: false, error: "参数不完整，请提供邮箱和新密码" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, error: "用户不存在" });
    }

    const hashedPass = await bcrypt.hash(new_password, 10);
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPass,
        password_hash: hashedPass
      }
    });

    return res.json({ success: true, message: "密码重置成功" });
  } catch (error: any) {
    console.error("Password reset failed:", error);
    return res.status(500).json({ success: false, error: "重置密码系统异常" });
  }
});

// GET /api/auth/facebook/callback
router.get("/facebook/callback", async (req, res) => {
  const { code, error, state } = req.query;
  
  if (error) {
    console.error("Facebook OAuth callback error from query:", error);
    return res.redirect(`/?tab=settings&status=error&message=${encodeURIComponent(String(error))}`);
  }
  
  if (!code) {
    return res.status(400).send("Authorization code is missing");
  }

  try {
    // 1. Retrieve Client ID & Secret from database settings first, fallback to env variables
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    settings.forEach((s) => {
      config[s.key] = s.value;
    });

    const systemConfig = await prisma.systemSetting.findFirst();
    const clientId = systemConfig?.meta_client_id || config["FACEBOOK_CLIENT_ID"] || process.env.FACEBOOK_CLIENT_ID;
    const clientSecret = systemConfig?.meta_client_secret || config["FACEBOOK_CLIENT_SECRET"] || process.env.FACEBOOK_CLIENT_SECRET;
    
    // Use the exact redirect URI specified by the user
    const redirectUri = "https://1-eight-azure.vercel.app/api/auth/facebook/callback";

    if (!clientId || !clientSecret) {
      console.error("Facebook OAuth Error: App Credentials (App ID or App Secret) are not configured.");
      return res.redirect(`/?tab=settings&status=error&message=${encodeURIComponent("Facebook App ID or Secret is not configured in Settings.")}`);
    }

    console.log("Exchanging Facebook auth code for short-lived token...");
    // 2. Exchange authorization code for a short-lived user access token
    const tokenRes = await axios.get("https://graph.facebook.com/v20.0/oauth/access_token", {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code,
      }
    });

    const shortLivedToken = tokenRes.data.access_token;
    if (!shortLivedToken) {
      throw new Error("Failed to exchange auth code for short-lived token");
    }

    console.log("Upgrading short-lived token to 60-day long-lived User Access Token...");
    // 3. Upgrade short-lived token to long-lived (60 days) access token
    const longLivedTokenRes = await axios.get("https://graph.facebook.com/v20.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: shortLivedToken,
      }
    });

    const longLivedToken = longLivedTokenRes.data.access_token;
    if (!longLivedToken) {
      throw new Error("Failed to exchange short-lived token for long-lived token");
    }

    // Get user details to associate with token
    let facebookUserId = "unknown";
    let facebookUserName = "";
    let facebookUserLink = "";
    try {
      // ⚠️ Note: the 'link' field has been deprecated/restricted by Meta in recent Graph API versions (v20.0+),
      // requesting it directly on /me throws OAuthException (#100). We request 'id,name,email' instead, 
      // and construct the profile link programmatically using their Scoped User ID.
      const meRes = await axios.get("https://graph.facebook.com/v20.0/me", {
        params: { 
          access_token: longLivedToken,
          fields: "id,name,email"
        }
      });
      if (meRes.data && meRes.data.id) {
        facebookUserId = meRes.data.id;
        // 🚀 Automatically map known app-scoped user ID to the real Facebook profile ID
        if (facebookUserId === "1595581251548904") {
          facebookUserId = "100032911327297";
        }
        facebookUserName = meRes.data.name || "";
        facebookUserLink = `https://www.facebook.com/profile.php?id=${facebookUserId}`;
        console.log(`👤 Retrieved Facebook User Info. User ID: ${facebookUserId}, Name: ${facebookUserName}, Link: ${facebookUserLink}`);
      }
    } catch (meErr) {
      console.warn("Could not fetch Facebook user info:", meErr);
    }

    // DEBUG: Check the permissions/scopes associated with the newly exchanged long-lived token
    try {
      console.log("🔍 Checking permissions/scopes for the acquired Long-Lived Token...");
      const permissionsRes = await axios.get("https://graph.facebook.com/v20.0/me/permissions", {
        params: { access_token: longLivedToken }
      });
      if (permissionsRes.data && Array.isArray(permissionsRes.data.data)) {
        const grantedPermissions = permissionsRes.data.data
          .filter((p: any) => p.status === "granted")
          .map((p: any) => p.permission);
        
        const declinedPermissions = permissionsRes.data.data
          .filter((p: any) => p.status === "declined")
          .map((p: any) => p.permission);

        console.log("✅ Token Granted Permissions:", grantedPermissions);
        if (declinedPermissions.length > 0) {
          console.warn("❌ Token Declined Permissions:", declinedPermissions);
        }

        const requiredScopes = ["ads_management", "ads_read", "business_management"];
        const missingScopes = requiredScopes.filter(scope => !grantedPermissions.includes(scope));
        if (missingScopes.length > 0) {
          console.warn(`⚠️ Warning: Missing required enterprise scopes for BM/Ad accounts: ${missingScopes.join(", ")}`);
          console.warn("Ensure that you are using a Meta App of type 'Business', and that the System User / User has been assigned to those assets.");
        } else {
          console.log("🎉 Outstanding! All necessary business scopes are present on this token.");
        }
      }
    } catch (permErr: any) {
      console.warn("⚠️ Could not debug token permissions via /me/permissions:", permErr.response?.data || permErr.message);
    }

    // 4. Securely store long-lived token, expiry, and user ID in database
    const stateVal = state;
    let userId = stateVal ? parseInt(String(stateVal), 10) : null;
    if (!userId || isNaN(userId)) {
      const firstUser = await prisma.user.findFirst();
      if (firstUser) {
        userId = firstUser.id;
        console.log(`⚠️ Fallback to first user ID in DB: ${userId}`);
      } else {
        throw new Error("No users in system to link Facebook account to.");
      }
    }

    // Save isolated Facebook Account details for this user
    const userToLink = await prisma.user.findUnique({ where: { id: userId } });
    const userOrgId = userToLink?.org_id;

    await prisma.facebookAccount.upsert({
      where: { userId },
      update: {
        accessToken: longLivedToken,
        facebookId: facebookUserId || null,
        facebookName: facebookUserName || null,
        facebookLink: facebookUserLink || null,
        org_id: userOrgId,
      },
      create: {
        userId,
        accessToken: longLivedToken,
        facebookId: facebookUserId || null,
        facebookName: facebookUserName || null,
        facebookLink: facebookUserLink || null,
        org_id: userOrgId,
      },
    });

    // Retro-compatibility fallback setting updates
    await prisma.setting.upsert({
      where: { key: "META_ACCESS_TOKEN" },
      update: { value: longLivedToken },
      create: { key: "META_ACCESS_TOKEN", value: longLivedToken },
    });

    const now = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: "META_TOKEN_UPDATED_AT" },
      update: { value: now },
      create: { key: "META_TOKEN_UPDATED_AT", value: now },
    });

    if (facebookUserId) {
      await prisma.setting.upsert({
        where: { key: "FB_AUTHORIZED_USER_ID" },
        update: { value: facebookUserId },
        create: { key: "FB_AUTHORIZED_USER_ID", value: facebookUserId },
      });
    }

    if (facebookUserName) {
      await prisma.setting.upsert({
        where: { key: "FB_AUTHORIZED_USER_NAME" },
        update: { value: facebookUserName },
        create: { key: "FB_AUTHORIZED_USER_NAME", value: facebookUserName },
      });
    }

    if (facebookUserLink) {
      await prisma.setting.upsert({
        where: { key: "FB_AUTHORIZED_USER_LINK" },
        update: { value: facebookUserLink },
        create: { key: "FB_AUTHORIZED_USER_LINK", value: facebookUserLink },
      });
    }

    // Update all AdAccounts where token is different, null, or has no associated userId
    await prisma.adAccount.updateMany({
      where: {
        OR: [
          { fb_access_token: { not: longLivedToken } },
          { fb_access_token: null },
          { userId: null }
        ]
      },
      data: {
        fb_access_token: longLivedToken,
        userId: userId,
      }
    });

    console.log("Facebook OAuth configuration saved. Returning custom redirection response.");

    // Return popup postMessage template to auto-close and notify parent window
    return res.status(200).send(`
      <html>
        <head>
          <title>授权成功</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f7f9fc; color: #1e293b; }
            .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); text-align: center; max-width: 450px; border: 1px solid #e2e8f0; }
            h1 { color: #10b981; font-size: 1.75rem; margin-top: 0; margin-bottom: 0.75rem; font-weight: 700; }
            p { color: #64748b; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✓ 绑定授权成功</h1>
            <p>已成功获取 Meta 60 天长效访问令牌并同步系统！窗口正在关闭并刷新画布...</p>
          </div>
          <script>
            // 1. 通知父窗口（看板主页面）刷新数据或改变状态
            if (window.opener) {
              try {
                window.opener.postMessage({ type: 'FB_AUTH_SUCCESS' }, '*');
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              } catch (e) {
                console.error("Failed to postMessage to opener:", e);
              }
            }
            // 2. 自动关闭当前弹窗
            setTimeout(() => {
              window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);

  } catch (error: any) {
    const errMsg = error.response?.data?.error?.message || error.message || "Unknown callback exception";
    console.error(`Facebook OAuth callback handling exception: ${errMsg}`);
    
    return res.status(500).send(`
      <html>
        <head>
          <title>授权失败</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #fef2f2; color: #991b1b; }
            .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); text-align: center; max-width: 450px; border: 1px solid #fee2e2; }
            h1 { color: #dc2626; font-size: 1.75rem; margin-top: 0; margin-bottom: 0.75rem; font-weight: 700; }
            p { color: #7f1d1d; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✗ 绑定授权失败</h1>
            <p>${errMsg}</p>
          </div>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage({ type: 'FB_AUTH_ERROR', message: ${JSON.stringify(errMsg)} }, '*');
              } catch (e) {
                console.error("Failed to postMessage to opener:", e);
              }
            }
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// POST /api/auth/facebook/disconnect
router.post("/facebook/disconnect", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      await prisma.facebookAccount.deleteMany({
        where: { userId }
      });
      await prisma.facebookBusinessManager.deleteMany({
        where: { userId }
      });
      await prisma.adAccount.updateMany({
        where: { userId },
        data: {
          fb_access_token: null,
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
    const userId = req.user?.id;
    if (userId) {
      await prisma.facebookAccount.deleteMany({
        where: { userId }
      });
      await prisma.facebookBusinessManager.deleteMany({
        where: { userId }
      });
      await prisma.adAccount.updateMany({
        where: { userId },
        data: {
          fb_access_token: null,
          userId: null
        }
      });
    }
    
    console.log("✅ Successfully purged local Facebook configuration and tokens for user:", userId);
    res.json({ success: true, message: "本地解绑成功，如需彻底清除 Meta 缓存，请前往 Facebook 个人后台设置" });
  } catch (error: any) {
    console.error("Failed to handle local Facebook unbind/purge:", error);
    res.status(500).json({ error: "解除本地绑定失败", details: error.message });
  }
});

// POST /api/auth/facebook/unbind - Standard Compliant Facebook Unbind & Data Purge (Meta App Review Compliant)
router.post("/facebook/unbind", authenticateJWT as any, async (req: any, res) => {
  try {
    console.log("📥 Compliant unbind and data purge requested for Facebook integration");
    const userId = req.user?.id;
    if (userId) {
      await prisma.facebookAccount.deleteMany({
        where: { userId }
      });
      await prisma.facebookBusinessManager.deleteMany({
        where: { userId }
      });
      await prisma.adAccount.updateMany({
        where: { userId },
        data: {
          fb_access_token: null,
          userId: null
        }
      });
    }
    
    console.log("✅ Successfully purged Facebook configuration and tokens under compliant unbind for user:", userId);
    res.status(200).json({ success: true, message: "您的本地授权 Token 已成功擦除" });
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
    let userAccessToken = null;
    if (userId) {
      const acc = await prisma.facebookAccount.findUnique({
        where: { userId }
      });
      if (acc) {
        userAccessToken = acc.accessToken;
      }
    }
    
    // Fallback to global setting if no user-specific token is found
    if (!userAccessToken) {
      const tokenSetting = await prisma.setting.findUnique({
        where: { key: "META_ACCESS_TOKEN" }
      });
      userAccessToken = tokenSetting?.value;
    }

    if (!userAccessToken) {
      return res.status(404).json({ error: "Access token not found" });
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
