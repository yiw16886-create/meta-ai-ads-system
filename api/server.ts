import express, { Request, Response, NextFunction } from "express";
import path from "path";
import axios from "axios";
import prisma from "./db.js";
import { subDays, format } from "date-fns";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "crypto";

// Helper to get SMTP config
async function getSmtpConfig() {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]
      }
    }
  });
  
  const configMap: Record<string, string> = {};
  settings.forEach(s => { configMap[s.key] = s.value; });
  
  if (!configMap.SMTP_HOST || !configMap.SMTP_USER || !configMap.SMTP_PASS) return null;
  
  return {
    host: configMap.SMTP_HOST,
    port: parseInt(configMap.SMTP_PORT || "465"),
    secure: configMap.SMTP_PORT === "465",
    auth: {
      user: configMap.SMTP_USER,
      pass: configMap.SMTP_PASS
    },
    from: configMap.SMTP_FROM || configMap.SMTP_USER
  };
}

async function sendInvitationEmail(email: string, token: string, role: string) {
  const config = await getSmtpConfig();
  if (!config) {
    console.warn("SMTP settings not configured, skipping email send. Token:", token);
    return false;
  }
  
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });
  
  const registerUrl = `${process.env.APP_URL || ''}/?token=${token}#/login`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #2563eb; padding: 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Meta Insights Pro 邀请函</h1>
      </div>
      <div style="padding: 32px; background-color: white;">
        <p style="font-size: 16px; color: #1e293b; margin-top: 0;">您好！</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">您已被邀请作为 <strong>${role === 'admin' ? '管理员' : '成员'}</strong> 加入 Meta Insights Pro 仪表板。请点击下方按钮设置您的登录密码并激活账户。</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${registerUrl}" style="background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">激活账户</a>
        </div>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 0;">此链接 24 小时内有效。如果按钮无法点击，请复制以下链接到浏览器访问：</p>
        <p style="font-size: 14px; color: #2563eb; word-break: break-all;">${registerUrl}</p>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #64748b; margin: 0;">&copy; 2026 Meta Insights Pro. All rights reserved.</p>
      </div>
    </div>
  `;
  
  try {
    await transporter.sendMail({
      from: config.from,
      to: email,
      subject: "邀请您加入 Meta Insights Pro 团队",
      html
    });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to send invitation email:", error);
    let recommendation = "";
    if (error.message.includes("534-5.7.9")) {
      recommendation = "Gmail 需要使用 '应用专用密码' (App Password)。请在 Google 账户设置中生成并使用它。";
    }
    return { success: false, error: error.message, recommendation };
  }
}

// Log available models on startup to debug the "undefined" error
async function checkDb() {
  try {
    await prisma.$connect();
    console.log("📡 Connecting to Neon PostgreSQL database...");
    const models = Object.keys(prisma).filter(
      (key) => !key.startsWith("$") && !key.startsWith("_"),
    );
    console.log("📦 Available models in Prisma:", models);
    if (!models.includes("adInsight")) {
      console.error(
        "⚠️ CRITICAL: 'adInsight' model not found on prisma object!",
      );
    }

    // Ensure we have at least one admin user
    const defaultEmail = process.env.VITE_ADMIN_ID || "admin";
    const defaultPass = process.env.VITE_ADMIN_SECRET || "123456";
    const hashedPass = await bcrypt.hash(defaultPass, 10);

    await prisma.user.upsert({
      where: { email: defaultEmail },
      update: { role: "admin", password: hashedPass }, 
      create: {
        email: defaultEmail,
        password: hashedPass,
        role: "admin"
      }
    });
    console.log(`👤 Verified/Restored admin user: ${defaultEmail}`);

    const users = await prisma.user.findMany();
    
    // Migration: hash any plain-text passwords
    for (const user of users) {
      if (user.password && !user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
        console.log(`🔐 Hashing plain-text password for user: ${user.email}`);
        const hashed = await bcrypt.hash(user.password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashed }
        });
      }
    }

  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
}

// Global error handlers to prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
});

const app = express();
export default app;
const PORT = 3000;

app.use(express.json());

// API route to check if server is running
app.get("/api/health", (req, res) => {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  res.json({
    status: "ok",
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    dbUrlPrefix: dbUrl ? dbUrl.substring(0, 20) + "..." : null,
  });
});

// Helper to get Meta Access Token from DB or Env
async function getMetaToken() {
  const setting = await prisma.setting.findUnique({
    where: { key: "META_ACCESS_TOKEN" },
  });
  return setting?.value || process.env.META_ACCESS_TOKEN;
}

// Helper to extract Meta Error Message
function extractMetaError(error: any): string {
  if (error.response?.data?.error) {
    const metaError = error.response.data.error;
    let msg = `Meta API Error (${metaError.type}): ${metaError.message}`;
    if (metaError.error_subcode) {
      msg += ` (Subcode: ${metaError.error_subcode})`;
    }
    return msg;
  }
  return error.message || "Unknown error";
}

// 1. 获取所有广告账户
app.get("/api/accounts", async (req, res) => {
  try {
    const token = await getMetaToken();
    if (!token) {
      return res
        .status(400)
        .json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "name,account_id,account_status",
          limit: 1000,
          access_token: token,
        },
      },
    );
    // 只拉取活跃账户
    res.json(
      (response.data.data || []).filter((a: any) => a.account_status === 1),
    );
  } catch (error: any) {
    const msg = extractMetaError(error);
    console.error(
      "Fetch accounts error:",
      error.response?.data || error.message,
    );
    res
      .status(500)
      .json({ error: msg, details: error.message, stack: error.stack });
  }
});

// 2. 同步数据
app.post("/api/sync", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "startDate and endDate are required" });
  }

  try {
    const token = await getMetaToken();
    if (!token) {
      return res
        .status(400)
        .json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }

    const accountsResponse = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "name,account_id,account_status",
          limit: 1000,
          access_token: token,
        },
      },
    );

    const accounts = (accountsResponse.data.data || []).filter(
      (a: any) => a.account_status === 1,
    );
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    // 使用分批同步逻辑 (每5个一组) 避免 Meta API 限流
    const chunkSize = 5;
    for (let i = 0; i < accounts.length; i += chunkSize) {
      if (stopSync) break;
      const chunk = accounts.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (account: any) => {
          const accountId = account.account_id || account.id;
          try {
            const insightsResponse = await axios.get(
              `https://graph.facebook.com/v19.0/act_${accountId}/insights`,
              {
                params: {
                  time_range: JSON.stringify({
                    since: startDate,
                    until: endDate,
                  }),
                  time_increment: 1,
                  fields:
                    "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
                  access_token: token,
                },
              },
            );

            const insights = insightsResponse.data.data || [];

            for (const day of insights) {
              const actions = day.actions || [];
              const getActionValue = (type: string) => {
                const action = actions.find((a: any) => a.action_type === type);
                return action ? parseFloat(action.value) : 0;
              };

              const actionValues = day.action_values || [];
              const getActionVal = (type: string) => {
                const action = actionValues.find(
                  (a: any) => a.action_type === type,
                );
                return action ? parseFloat(action.value) : 0;
              };

              const carts = getActionValue("add_to_cart");
              const checkouts = getActionValue("initiate_checkout");
              const purchases = getActionValue("purchase");
              const purchaseValue =
                getActionVal("purchase") || getActionVal("omni_purchase");

              const spend = parseFloat(day.spend || "0");
              const clicks = parseInt(day.clicks || "0");
              const impressions = parseInt(day.impressions || "0");
              const reach = parseInt(day.reach || "0");

              const cpc = clicks > 0 ? spend / clicks : 0;
              const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
              const atcRate = clicks > 0 ? (carts / clicks) * 100 : 0;
              const checkoutRate = clicks > 0 ? (checkouts / clicks) * 100 : 0;
              const cpp = purchases > 0 ? spend / purchases : 0;
              const roas = spend > 0 ? purchaseValue / spend : 0;

              await prisma.adInsight.upsert({
                where: {
                  accountId_date: {
                    accountId: accountId,
                    date: day.date_start,
                  },
                },
                update: {
                  accountName: day.account_name,
                  reach,
                  impressions,
                  clicks,
                  spend,
                  addToCart: carts,
                  initiateCheckout: checkouts,
                  purchases,
                  purchaseValue,
                  cpc,
                  ctr,
                  atcRate,
                  checkoutRate,
                  cpp,
                  roas,
                },
                create: {
                  accountId: accountId,
                  date: day.date_start,
                  accountName: day.account_name,
                  reach,
                  impressions,
                  clicks,
                  spend,
                  addToCart: carts,
                  initiateCheckout: checkouts,
                  purchases,
                  purchaseValue,
                  cpc,
                  ctr,
                  atcRate,
                  checkoutRate,
                  cpp,
                  roas,
                },
              });
              totalSynced++;
            }
          } catch (err: any) {
            lastError = extractMetaError(err);
            const status = err.response?.status;
            if (status === 403) {
              console.warn(
                `[Manual API Sync] ⚠️ Account ${accountId} access restricted (403): ${lastError}`,
              );
            } else {
              console.error(
                `[Manual API Sync] ❌ Error syncing account ${accountId}:`,
                err.response?.data || err.message,
              );
            }
          }
        }),
      );

      // 每批处理后延迟 1.5 秒
      if (i + chunkSize < accounts.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (stopSync && totalSynced === 0) {
      return res.status(401).json({ error: lastError });
    }

    res.json({
      success: true,
      count: totalSynced,
      error: stopSync ? lastError : undefined,
    });
  } catch (error: any) {
    const msg = extractMetaError(error);
    console.error("Sync error:", error.response?.data || error.message);
    res.status(500).json({ error: msg });
  }
});

// --- CACHING LOGIC ---
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000; // Increased to 10 minutes

function getCachedData(key: string) {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// [NEW API] 单个账户层级详情 (Campaigns, AdSets, Ads)
app.get("/api/accounts/:accountId/details", async (req, res) => {
  const { accountId } = req.params;
  const { startDate, endDate, level } = req.query; // level: 'campaigns', 'adsets', 'ads'

  if (!accountId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const validLevels = ["campaigns", "adsets", "ads"];
  const targetLevel = validLevels.includes(level as string)
    ? level
    : "campaigns";

  const cacheKey = `details_${accountId}_${targetLevel}_${startDate}_${endDate}`;
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  try {
    const token = await getMetaToken();
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    // 组合时间范围
    const timeRange = JSON.stringify({ since: startDate, until: endDate });
    const insightsFields =
      "spend,impressions,reach,frequency,actions,cost_per_action_type,action_values,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,clicks,ctr,cpc";

    let extraFields = "";
    if (targetLevel === "adsets") extraFields = ",campaign_id";
    if (targetLevel === "ads") extraFields = ",campaign_id,adset_id";

    // 我们在此请求该层级下的所有项目，包含 insights。
    const fields = `name,status,effective_status,daily_budget,lifetime_budget${extraFields},insights.time_range(${timeRange}){${insightsFields}}`;

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/act_${accountId}/${targetLevel}`,
      {
        params: {
          fields,
          limit: 100, // 可以支持翻页，这里先返回最多 100 条
          access_token: token,
        },
      },
    );

    const result = {
      data: response.data.data,
      paging: response.data.paging,
    };
    setCachedData(cacheKey, result);
    res.json(result);
  } catch (error: any) {
    console.error(
      `Meta API Error for ${targetLevel}:`,
      error.response?.data || error.message,
    );
    res.status(500).json({ error: extractMetaError(error) });
  }
});

// [NEW API] 获取账户层级结构 (用于级联过滤)
app.get("/api/accounts/:accountId/hierarchy", async (req, res) => {
  const { accountId } = req.params;
  const cacheKey = `hierarchy_${accountId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  try {
    const token = await getMetaToken();
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    // 一次性获取三种资源，去掉 insights 以提升速度
    const [campaignsRes, adsetsRes, adsRes] = await Promise.all([
      axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
        params: { fields: "id,name", limit: 500, access_token: token },
      }),
      axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/adsets`, {
        params: {
          fields: "id,name,campaign_id",
          limit: 500,
          access_token: token,
        },
      }),
      axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/ads`, {
        params: {
          fields: "id,name,adset_id,campaign_id",
          limit: 500,
          access_token: token,
        },
      }),
    ]);

    const result = {
      success: true,
      campaigns: campaignsRes.data.data,
      adSets: adsetsRes.data.data,
      ads: adsRes.data.data,
    };
    setCachedData(cacheKey, result);
    res.json(result);
  } catch (error: any) {
    console.error(
      `Meta API Error for hierarchy:`,
      error.response?.data || error.message,
    );
    res.status(500).json({ error: extractMetaError(error) });
  }
});

// 3. 获取本地数据
app.get("/api/insights", async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await prisma.adInsight.findMany({
      where: {
        date: {
          gte: startDate as string,
          lte: endDate as string,
        },
      },
    });
    res.json(data);
  } catch (error: any) {
    console.error("Fetch insights error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch data", details: error?.message });
  }
});

// 4. 系统设置
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    settings.forEach((s) => {
      config[s.key] = s.value;
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

app.post("/api/settings", async (req, res) => {
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

// --- NEW ACCOUNT MAPPING ENDPOINTS ---

// 获取数据库中已保存的账户映射
app.get("/api/mappings", async (req, res) => {
  try {
    const mappings = await prisma.accountMapping.findMany();
    res.json(mappings);
  } catch (err: any) {
    console.error("Fetch mappings error:", err);
    res.status(500).json({
      error: "Failed to fetch mappings from DB",
      details: err.message,
      code: err.code,
    });
  }
});

// 批量保存/更新账户映射
app.post("/api/mappings/batch", async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: "Mappings array is required" });
  }

  try {
    // Filter out invalid mappings before updating DB
    const validMappings = mappings.filter((m: any) => m && m.accountId != null);

    const results = await Promise.all(
      validMappings.map((mapping: any) =>
        prisma.accountMapping.upsert({
          where: { accountId: String(mapping.accountId) },
          update: {
            accountName: mapping.accountName
              ? String(mapping.accountName)
              : "Unknown",
            project: mapping.project ? String(mapping.project) : null,
            store: mapping.store ? String(mapping.store) : null,
            owner: mapping.owner ? String(mapping.owner) : null,
            updatedAt: new Date(),
          },
          create: {
            accountId: String(mapping.accountId),
            accountName: mapping.accountName
              ? String(mapping.accountName)
              : "Unknown",
            project: mapping.project ? String(mapping.project) : null,
            store: mapping.store ? String(mapping.store) : null,
            owner: mapping.owner ? String(mapping.owner) : null,
          },
        }),
      ),
    );
    res.json({ success: true, count: results.length });
  } catch (err: any) {
    console.error("Batch save mappings error:", err);
    res
      .status(500)
      .json({ error: "Failed to save mappings to DB", details: err.message });
  }
});

// 获取本地已有的去重账户列表 (用于设置页面分配)
app.get("/api/accounts/list", async (req, res) => {
  try {
    const accounts = await prisma.adInsight.groupBy({
      by: ["accountId", "accountName"],
    });
    res.json(accounts);
  } catch (err: any) {
    console.error("Fetch unique accounts error:", err);
    res.status(500).json({
      error: "Failed to fetch unique accounts from DB",
      details: err.message,
      code: err.code,
    });
  }
});

// --- END NEW ENDPOINTS ---

// --- NEW STORE & AD ACCOUNT ENDPOINTS ---
// GET /api/stores - List all stores
app.get("/api/stores", async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      include: { accounts: true },
    });
    res.json(stores);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch stores", details: error.message });
  }
});

// GET /api/stores/:id - Get a specific store
app.get("/api/stores/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
    let store;
    if (isNumeric) {
      store = await prisma.store.findUnique({
        where: { id: parseInt(id, 10) },
        include: { accounts: true },
      });
    } else {
      store = await prisma.store.findFirst({
        where: { name: { equals: id, mode: "insensitive" } },
        include: { accounts: true },
      });
    }
    if (!store) return res.status(404).json({ error: "Store not found" });
    res.json(store);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch store", details: error.message });
  }
});

// Cache for SHOPLINE stats
const shoplineCache = new Map<string, { data: any; expiry: number }>();
const SHOPLINE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper to fetch SHOPLINE data with v20240301 specification
async function fetchShoplineData(domain: string, token: string, endpoint: string, params: any = {}) {
  // Deep clean the domain - users often paste "https://xxx.myshopline.com/admin/"
  let cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\/admin\/.*$/, "")
    .replace(/\/admin$/, "");
  
  if (!cleanDomain.includes("myshopline.com")) {
    console.log(`[Shopline API Advisor] Domain ${cleanDomain} looks like a custom domain. Using primary domain format for API.`);
  }

  const apiVersion = "v20240301";
  // NOTE: Switched to OpenAPI standard path instead of standard Admin API due to Cloudflare restrictions on standard API
  const url = `https://${cleanDomain}/admin/openapi/${apiVersion}/${endpoint}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      params,
      timeout: 15000
    });
    
    console.log(`[Shopline API Success] URL: ${url}, RequestID: ${response.headers["x-shopline-request-id"] || "N/A"}`);
    return { data: response.data, status: response.status, headers: response.headers, requestId: response.headers["x-shopline-request-id"] };
  } catch (error: any) {
    if (error.response?.status === 204) {
      throw {
        status: 204,
        message: "API 请求被服务端拦截 (204 No Content)。",
        details: "服务器返回了 204。这通常意味着 URL 不正确或请求被静默拦截。",
        requestId: "N/A"
      };
    }

    const status = error.response?.status;
    const errorData = error.response?.data;
    const isCloudflare = typeof errorData === "string" && (errorData.includes("Just a moment...") || errorData.includes("<title>Just a moment...</title>"));
    
    let userMessage = error.message;
    if (status === 401) userMessage = "Token 无效 (请检查 STORE_Token 是否正确且未过期)";
    if (status === 403 || isCloudflare) {
      userMessage = isCloudflare 
        ? "域名冲突：检测到 Cloudflare 防火墙。请将店铺域名设置为 SHOPLINE 内部域名（如 xxxx.myshopline.com）。"
        : "权限不足：请在 SHOPLINE 后台检查 API 权限，如果是新勾选，请重新安装应用确保授权生效。";
    }
    
    throw {
      status,
      message: userMessage,
      details: isCloudflare ? "Cloudflare Anti-Bot Challenge" : errorData,
      requestId: error.response?.headers?.["x-shopline-request-id"] || "N/A"
    };
  }
}

// [NEW] Unified helper for Shopline Analytics extraction

async function getShoplineAnalytics(domain: string, token: string, startDate: string, endDate: string, defaultVisitors: number = 0) {
  try {
    // 0. Detect Store Timezone Offset by grabbing 1 recent order
    let tzOffset = "Z"; // default UTC
    try {
      const tzCheck = await fetchShoplineData(domain, token, "orders.json", { limit: 1 });
      if (tzCheck.data?.orders?.length > 0) {
        const createdAt = tzCheck.data.orders[0].created_at;
        // e.g. "2023-09-11T09:58:19-07:00" -> extract "-07:00" or "+08:00"
        const match = createdAt.match(/([+-]\d{2}:\d{2})$/);
        if (match) tzOffset = match[1];
      }
    } catch (e) {
      console.warn("[Shopline] Failed to detect timezone, falling back to UTC");
    }

    // 1. Fetch Orders with Pagination (Max 100 per page, lightweight fields)
    let orders: any[] = [];
    let hasNextPage = true;
    let currentParams: any = {
      created_at_min: `${startDate}T00:00:00${tzOffset}`,
      created_at_max: `${endDate}T23:59:59${tzOffset}`,
      limit: 100,
      fields: "id,name,order_number,current_total_price,total_price,financial_status,cancel_reason,created_at"
    };

    let firstRequestId = "N/A";

    while (hasNextPage) {
      const pageResult = await fetchShoplineData(domain, token, "orders.json", currentParams);
      if (firstRequestId === "N/A") {
        firstRequestId = pageResult.requestId || "N/A";
      }
      
      const fetchedOrders = pageResult.data.orders || [];
      orders = orders.concat(fetchedOrders);
      
      const linkHeader = pageResult.headers?.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        if (match && match[1]) {
           currentParams = { limit: 100, page_info: match[1] };
        } else {
           hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
      
      // Safety limit to prevent infinite loops (e.g. 40 pages = 10000 orders max per day)
      if (orders.length >= 10000) {
         console.warn(`[Shopline] Reached safety limit of 10000 orders for ${domain}`);
         break;
      }
    }
    
    // Debug: Log top 3 fetched orders for user verification
    console.log(`\n--- [Shopline Order Debug] Store: ${domain} | Timezone: ${tzOffset} ---`);
    if (orders.length === 0) {
      console.log("No orders found for the specified period.");
    } else {
      orders.slice(0, 3).forEach((o: any, i: number) => {
        console.log(`[${i+1}] Order #${o.name || o.order_number} | Created: ${o.created_at} | FinStatus: ${o.financial_status} | Cancelled: ${!!o.cancel_reason} | Total: ${o.current_total_price || o.total_price}`);
      });
    }
    console.log("---------------------------------------------------------------");

    let activeOrdersCount = 0;
    
    // 2. Aggregate Sales & Orders
    const totalSales = orders.reduce((sum: number, order: any) => {
      // Exclude cancelled and refunded orders
      if (order.cancel_reason !== null || order.financial_status === "refunded" || order.financial_status === "voided") {
        return sum;
      }
      
      // Count valid orders
      activeOrdersCount++;

      // Sum sales only for paid (or partially paid) orders
      if (["paid", "partially_paid"].includes(order.financial_status)) {
        return sum + parseFloat(order.current_total_price || order.total_price || "0");
      }
      return sum;
    }, 0);

    const ordersCount = activeOrdersCount;

    // 3. Traffic Data (Analytics)
    // NOTE: Standard Shopline Admin API "orders.json" doesn't provide visitor counts.
    // If you need real stats, you might need to call Shopline's Analytics API (if available for your plan/app)
    // or use a tracking integration. For now, we use the value provided in the Dash settings (store.visitors).
    const visitors = defaultVisitors;
    const conversionRate = visitors > 0 ? (ordersCount / visitors) * 100 : 0;

    return {
      totalSales,
      ordersCount,
      visitors,
      conversionRate,
      isConfigured: true,
      requestId: firstRequestId
    };
  } catch (err: any) {
    throw err; // Let caller handle formatting
  }
}

// [NEW] GET /api/stores/:id/shopline-test - Test SHOPLINE connection
app.get("/api/stores/:id/shopline-test", async (req, res) => {
  const { id } = req.params;
  try {
    const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
    let store;
    if (isNumeric) {
      store = await prisma.store.findUnique({ where: { id: parseInt(id, 10) } });
    } else {
      store = await prisma.store.findFirst({
        where: { name: { equals: id, mode: "insensitive" } },
      });
    }

    if (!store || !store.shopline_token || !store.domain) {
      return res.status(400).json({ error: "Store not found or Shopline config missing" });
    }

    const result = await fetchShoplineData(store.domain, store.shopline_token, "orders.json", { limit: 1 });

    res.json({
      success: true,
      status: result.status,
      requestId: result.requestId,
      shop: { message: "Connected successfully via OpenAPI" }
    });
  } catch (error: any) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      details: error.details,
      requestId: error.requestId
    });
  }
});

// GET /api/stores/:id/dashboard-summary - Aggregate Meta and SHOPLINE data
app.get("/api/stores/:id/dashboard-summary", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  try {
    const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
    let store;
    if (isNumeric) {
      store = await prisma.store.findUnique({
        where: { id: parseInt(id, 10) },
        include: { accounts: true },
      });
    } else {
      store = await prisma.store.findFirst({
        where: { name: { equals: id, mode: "insensitive" } },
        include: { accounts: true },
      });
    }

    if (!store) return res.status(404).json({ error: "Store not found" });

    const globalToken = await getMetaToken();

    // 1. Fetch Ad Insights (Meta)
    const adInsightsPromise = (async () => {
      let totalSpend = 0;
      let totalPurchaseValue = 0;
      let adResults = [];

      if (store.accounts && store.accounts.length > 0) {
        for (const account of store.accounts) {
          const tokenToUse = account.fb_access_token || globalToken;
          if (!tokenToUse) continue;
          try {
            const insightsRes = await axios.get(
              `https://graph.facebook.com/v19.0/act_${account.fb_account_id}/insights`,
              {
                params: {
                  time_range: JSON.stringify({ since: startDate, until: endDate }),
                  fields: "spend,purchase_roas,action_values,account_id,account_name",
                  level: "account",
                  access_token: tokenToUse,
                },
              },
            );

            if (insightsRes.data && insightsRes.data.data) {
              insightsRes.data.data.forEach((d: any) => {
                const spend = parseFloat(d.spend || "0");
                totalSpend += spend;
                
                const actionValues = d.action_values || [];
                const value = actionValues.find((v: any) => v.action_type === "purchase" || v.action_type === "omni_purchase")?.value || 0;
                totalPurchaseValue += parseFloat(value);
                
                adResults.push({
                  accountId: account.fb_account_id,
                  accountName: account.fb_account_name || d.account_name,
                  spend,
                  purchaseValue: parseFloat(value),
                  roas: spend > 0 ? parseFloat(value) / spend : 0
                });
              });
            }
          } catch (err: any) {
            console.error(`Meta insight fetch failed for ${account.fb_account_id}:`, err.message);
          }
        }
      }
      return { totalSpend, totalPurchaseValue, adResults };
    })();

    // 2. Fetch Shopline Stats
    const shoplinePromise = (async () => {
      if (!store.shopline_token || !store.domain) {
        return {
          totalSales: 0,
          ordersCount: 0,
          visitors: store.visitors || 0,
          conversionRate: store.visitors > 0 ? 0 : 0,
          isConfigured: false
        };
      }

      try {
        const stats = await getShoplineAnalytics(
          store.domain, 
          store.shopline_token, 
          startDate as string, 
          endDate as string, 
          store.visitors || 0
        );
        return stats;
      } catch (err: any) {
        return { 
          totalSales: 0, 
          ordersCount: 0, 
          visitors: store.visitors || 0, 
          conversionRate: 0, 
          isConfigured: true, 
          error: true,
          errorMessage: err.message,
          requestId: err.requestId
        };
      }
    })();

    const [adData, shoplineData] = await Promise.all([adInsightsPromise, shoplinePromise]);

    res.json({
      meta: adData,
      shopline: shoplineData,
      summary: {
        totalSpend: adData.totalSpend,
        totalROAS: adData.totalSpend > 0 ? shoplineData.totalSales / adData.totalSpend : 0,
        totalSales: shoplineData.totalSales,
        totalOrders: shoplineData.ordersCount,
        totalVisitors: shoplineData.visitors,
        avgConversionRate: shoplineData.conversionRate
      }
    });

  } catch (error: any) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

// GET /api/stores/:id/shopline-stats - Fetch stats from SHOPLINE
app.get("/api/stores/:id/shopline-stats", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  const cacheKey = `${id}-${startDate}-${endDate}`;
  if (shoplineCache.has(cacheKey)) {
    const cached = shoplineCache.get(cacheKey)!;
    if (Date.now() < cached.expiry) {
      return res.json(cached.data);
    }
  }

  const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
  let store;
  if (isNumeric) {
    store = await prisma.store.findUnique({ where: { id: parseInt(id, 10) } });
  } else {
    store = await prisma.store.findFirst({
      where: { name: { equals: id, mode: "insensitive" } },
    });
  }

  if (!store) return res.status(404).json({ error: "Store not found" });

  if (!store.shopline_token || !store.domain) {
    return res.json({
      totalSales: 0,
      ordersCount: 0,
      visitors: store.visitors || 0,
      conversionRate: store.visitors > 0 ? (0 / store.visitors) * 100 : 0,
      isConfigured: false
    });
  }

  // Call SHOPLINE Admin API
  // Note: SHOPLINE domain should be like "yourstore.myshopline.com"
  const cleanDomain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const apiVersion = "202409";
  const url = `https://${cleanDomain}/admin/api/${apiVersion}/orders.json`;
  console.log(`[Shopline Stats] Requesting URL: ${url}`);
  
  try {
    const stats = await getShoplineAnalytics(
      store.domain, 
      store.shopline_token, 
      startDate as string, 
      endDate as string, 
      store.visitors || 0
    );
    
    shoplineCache.set(cacheKey, { data: stats, expiry: Date.now() + SHOPLINE_CACHE_TTL });
    res.json(stats);
  } catch (error: any) {
    // Return zeros but indicate error for better UI handling
    res.json({
      totalSales: 0,
      ordersCount: 0,
      visitors: store.visitors || 0,
      conversionRate: 0,
      error: "API_ERROR",
      message: error.message,
      details: error.details,
      requestId: error.requestId,
      isConfigured: true
    });
  }
});

// POST /api/stores - Create or update a store
app.post("/api/stores", async (req, res) => {
  const { id, name, shopline_token, shopify_token, domain, visitors } = req.body;
  try {
    if (id) {
      const updatedStore = await prisma.store.update({
        where: { id: parseInt(id, 10) },
        data: { 
          name, 
          shopline_token, 
          shopify_token, 
          domain,
          visitors: visitors !== undefined ? parseInt(visitors, 10) : undefined
        },
      });
      res.json(updatedStore);
    } else {
      const newStore = await prisma.store.create({
        data: { 
          name, 
          shopline_token, 
          shopify_token, 
          domain,
          visitors: visitors !== undefined ? parseInt(visitors, 10) : 0
        },
      });
      res.json(newStore);
    }
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to save store", details: error.message });
  }
});

// POST /api/stores/:id/accounts - Add or update an ad account for a store
app.post("/api/stores/:id/accounts", async (req, res) => {
  const { id } = req.params;
  const { fb_account_id, fb_account_name, fb_access_token } = req.body;
  try {
    const account = await prisma.adAccount.upsert({
      where: { fb_account_id },
      update: { fb_account_name, fb_access_token, storeId: parseInt(id, 10) },
      create: {
        fb_account_id,
        fb_account_name,
        fb_access_token,
        storeId: parseInt(id, 10),
      },
    });
    res.json(account);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to save ad account", details: error.message });
  }
});

// DELETE /api/stores/:id/accounts/:accountId - Remove an ad account from a store
app.delete("/api/stores/:id/accounts/:accountId", async (req, res) => {
  const { accountId } = req.params;
  try {
    await prisma.adAccount.delete({
      where: { fb_account_id: accountId },
    });
    res.json({ success: true });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to delete ad account", details: error.message });
  }
});

// GET /api/stores/:id/insights - Fetch insights for all accounts within a store
app.get("/api/stores/:id/insights", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const store = await prisma.store.findUnique({
      where: { id: parseInt(id, 10) },
      include: { accounts: true },
    });

    if (!store) return res.status(404).json({ error: "Store not found" });
    if (!store.accounts || store.accounts.length === 0) return res.json([]);

    const globalToken = await getMetaToken();

    // We intentionally ignore global rate limits for demo since we just want it structured correctly. Fast responses in parallel might fail, so we process synchronously or in small chunks.
    const results = [];
    for (const account of store.accounts) {
      const tokenToUse = account.fb_access_token || globalToken;
      if (!tokenToUse) {
        console.warn(`No token available for account ${account.fb_account_id}`);
        continue;
      }

      try {
        const insightsRes = await axios.get(
          `https://graph.facebook.com/v19.0/act_${account.fb_account_id}/insights`,
          {
            params: {
              time_range: JSON.stringify({ since: startDate, until: endDate }),
              fields:
                "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,ctr,cpc",
              level: "account",
              access_token: tokenToUse,
            },
          },
        );

        if (insightsRes.data && insightsRes.data.data) {
          results.push(
            ...insightsRes.data.data.map((d: any) => ({
              ...d,
              account_name: account.fb_account_name || d.account_name,
            })),
          );
        }
      } catch (err: any) {
        console.error(
          `Error fetching insights for ${account.fb_account_id}:`,
          err.response?.data || err.message,
        );
      }
    }

    res.json(results);
  } catch (error: any) {
    res
      .status(500)
      .json({
        error: "Failed to fetch store insights",
        details: error.message,
      });
  }
});

// --- END STORE ENDPOINTS ---

// 定时任务：自动同步近一个月数据 (用于 Vercel Cron)
// 配置 5 分钟超时限制 (Vercel Serverless 环境)
export const maxDuration = 300;

app.get("/api/cron/sync-monthly", async (req, res) => {
  console.log("⏰ Starting background sync: Last 30 days...");
  try {
    const token = await getMetaToken();
    if (!token)
      throw new Error("Meta Access Token is not configured in settings.");

    const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    // 1. 获取所有子账户
    const accountsResponse = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "name,account_id,account_status",
          limit: 1000,
          access_token: token,
        },
      },
    );

    const accounts = (accountsResponse.data.data || []).filter(
      (a: any) => a.account_status === 1,
    );
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    // 2. 遍历同步每个账户
    for (const account of accounts) {
      if (stopSync) break;
      const accountId = account.account_id || account.id;
      try {
        const insightsRes = await axios.get(
          `https://graph.facebook.com/v19.0/act_${accountId}/insights`,
          {
            params: {
              time_range: JSON.stringify({ since: startDate, until: endDate }),
              time_increment: 1,
              fields:
                "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
              access_token: token,
            },
          },
        );

        const insights = insightsRes.data.data || [];
        for (const day of insights) {
          const actions = day.actions || [];
          const actionValues = day.action_values || [];

          const getVal = (arr: any[], type: string) => {
            const found = arr.find((a: any) => a.action_type === type);
            return found ? parseFloat(found.value) : 0;
          };

          const spend = parseFloat(day.spend || "0");
          const purchaseValue =
            getVal(actionValues, "purchase") ||
            getVal(actionValues, "omni_purchase");
          const purchases = getVal(actions, "purchase");
          const carts = getVal(actions, "add_to_cart");
          const checkouts = getVal(actions, "initiate_checkout");
          const clicks = parseInt(day.clicks || "0");
          const impressions = parseInt(day.impressions || "0");

          const atcRate = clicks > 0 ? (carts / clicks) * 100 : 0;
          const checkoutRate = clicks > 0 ? (checkouts / clicks) * 100 : 0;
          const cpp = purchases > 0 ? spend / purchases : 0;

          await prisma.adInsight.upsert({
            where: { accountId_date: { accountId, date: day.date_start } },
            update: {
              accountName: day.account_name,
              reach: parseInt(day.reach || "0"),
              impressions,
              clicks,
              spend,
              addToCart: carts,
              initiateCheckout: checkouts,
              purchases,
              purchaseValue,
              roas: spend > 0 ? purchaseValue / spend : 0,
              cpc: clicks > 0 ? spend / clicks : 0,
              ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
              atcRate,
              checkoutRate,
              cpp,
            },
            create: {
              accountId,
              date: day.date_start,
              accountName: day.account_name,
              reach: parseInt(day.reach || "0"),
              impressions,
              clicks,
              spend,
              addToCart: carts,
              initiateCheckout: checkouts,
              purchases,
              purchaseValue,
              roas: spend > 0 ? purchaseValue / spend : 0,
              cpc: clicks > 0 ? spend / clicks : 0,
              ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
              atcRate,
              checkoutRate,
              cpp,
            },
          });
          totalSynced++;
        }
      } catch (accErr: any) {
        lastError = extractMetaError(accErr);
        const status = accErr.response?.status;
        if (status === 403) {
          console.warn(
            `[Cron Sync] ⚠️ Account ${accountId} access restricted (403): ${lastError}`,
          );
        } else {
          console.error(
            `[Cron Sync] ❌ Failed for account ${accountId}:`,
            accErr.response?.data || accErr.message,
          );
        }
      }
    }

    if (stopSync && totalSynced === 0) {
      throw new Error(lastError);
    }

    console.log(`✅ Background sync finished. Total rows: ${totalSynced}`);
    res.json({
      success: true,
      count: totalSynced,
      range: { startDate, endDate },
      error: stopSync ? lastError : undefined,
    });
  } catch (error: any) {
    const msg = extractMetaError(error);
    const status = error.response?.status;
    console.error(`[Cron Sync] Global failure (${status || "Unknown"}):`, msg);
    res.status(500).json({ error: msg });
  }
});

// --- User Authentication and Management ---

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user && await bcrypt.compare(password, user.password)) {
      res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
    } else {
      res.status(401).json({ success: false, error: "账户或密码错误" });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: "登录系统异常" });
  }
});

app.post("/api/auth/verify-token", async (req, res) => {
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

app.post("/api/auth/register", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Missing data" });
  
  try {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: "邀请失效或已过期" });
    }

    const hashedPass = await bcrypt.hash(password, 10);
    
    await prisma.$transaction([
      prisma.user.upsert({
        where: { email: invitation.email },
        update: { password: hashedPass, role: invitation.role },
        create: { email: invitation.email, password: hashedPass, role: invitation.role }
      }),
      prisma.invitation.delete({ where: { token } })
    ]);

    res.json({ success: true });
  } catch (e) {
    console.error("Registration failed", e);
    res.status(500).json({ error: "注册失败" });
  }
});

  app.post("/api/users", async (req, res) => {
    try {
      const { email, role } = req.body;
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const invitation = await prisma.invitation.upsert({
        where: { email },
        update: { token, role, expiresAt },
        create: { email, token, role, expiresAt }
      });

      const emailResult = await sendInvitationEmail(email, token, role);
      
      res.json({ 
        success: true, 
        emailed: emailResult.success,
        emailError: emailResult.error,
        recommendation: emailResult.recommendation,
        data: { 
          id: invitation.id, 
          email: invitation.email, 
          role: invitation.role, 
          token: invitation.token 
        }
      });
    } catch(err: any) {
      console.error("Invite error:", err);
      res.status(500).json({ success: false, error: "邀请失败，请稍后重试" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const { role } = req.body;
      const user = await prisma.user.update({
        where: { id: Number(req.params.id) },
        data: { role },
        select: { id: true, email: true, role: true }
      });
      res.json({ success: true, data: user });
    } catch(err: any) {
      res.status(500).json({ success: false, error: "Failed to update user" });
    }
  });

  // 5. 用户管理与权限
  app.get("/api/users", async (req, res) => {
    try {
      const users = await prisma.user.findMany({ 
        select: { id: true, email: true, role: true, createdAt: true }
      });
      const invitations = await prisma.invitation.findMany({
        select: { id: true, email: true, role: true, createdAt: true, token: true }
      });
      
      // Combine but mark pending invitations
      const combined = [
        ...users.map(u => ({ ...u, status: "active" })),
        ...invitations.map(i => ({ ...i, id: `inv_${i.id}`, status: "pending" }))
      ];
      
      console.log(`👥 Fetched ${users.length} active users and ${invitations.length} pending invitations`);
      res.json({ success: true, data: combined });
    } catch (error: any) {
      console.error("Fetch users error:", error);
      res.status(500).json({ success: false, error: "加载成员列表失败: " + error.message });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    console.log(`[Server] 🗑️ DELETE /api/users/${req.params.id} request received`);
    try {
      const { id } = req.params;
      
      if (id && String(id).startsWith("inv_")) {
        const invIdStr = String(id).replace("inv_", "");
        const invId = parseInt(invIdStr, 10);
        console.log(`[Server] 📨 Attempting to revoke invitation ID: ${invId}`);
        
        if (isNaN(invId)) {
          console.warn(`[Server] ⚠️ Invalid invitation ID: ${invIdStr}`);
          return res.status(400).json({ success: false, error: "无效的邀请ID格式" });
        }
        
        const deleted = await prisma.invitation.delete({ where: { id: invId } });
        console.log(`[Server] ✅ Successfully revoked invitation: ${deleted.email}`);
        return res.json({ success: true, message: "已撤回邀请" });
      }

      const userId = parseInt(id, 10);
      console.log(`[Server] 👤 Attempting to delete user ID: ${userId}`);
      
      if (isNaN(userId)) {
        console.warn(`[Server] ⚠️ Invalid user ID format: ${id}`);
        return res.status(400).json({ success: false, error: "无效的用户ID格式" });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      
      if (!user) {
        console.warn(`[Server] ⚠️ User not found: ID ${userId}`);
        return res.status(404).json({ success: false, error: "用户不存在" });
      }

      if (user.role === "admin") {
        const adminCount = await prisma.user.count({ where: { role: "admin" } });
        if (adminCount <= 1) {
          console.warn(`[Server] ⚠️ Blocked deletion of last admin: ${user.email}`);
          return res.status(400).json({ success: false, error: "系统至少需要保留一名管理员" });
        }
      }

      await prisma.user.delete({ where: { id: userId } });
      console.log(`[Server] ✅ Successfully deleted user: ${user.email}`);
      res.json({ success: true, message: "用户已移除" });
    } catch (err: any) {
      console.error("[Server] ❌ Delete operation failed:", err);
      res.status(500).json({ success: false, error: "内部服务器错误: " + err.message });
    }
  });

// ---后台静默同步逻辑 (Background Auto-Sync) ---
async function runBackgroundSync() {
  const syncId = format(new Date(), "HH:mm:ss");
  console.log(`[后台同步 | ${syncId}] 🔄 开始后台静默同步: 过去 30 天数据...`);

  try {
    const token = await getMetaToken();
    if (!token) {
      console.log(`[后台同步 | ${syncId}] ⚠️ 同步中止: Meta Token 未配置`);
      return;
    }

    const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    // 1. 获取账户列表
    let accountsRes;
    try {
      accountsRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/adaccounts`,
        {
          params: {
            fields: "name,account_id,account_status",
            limit: 1000,
            access_token: token,
          },
        },
      );
    } catch (apiErr: any) {
      const status = apiErr.response?.status;
      if (status >= 500) {
        console.warn(
          `[后台同步 | ${syncId}] ⚠️ Meta API 服务端暂时不可用 (${status})，将在下次同步重试。`,
        );
        return;
      }
      throw apiErr;
    }

    // 只保留处于活跃状态 (account_status === 1) 的广告账户，极大地减少不必要的请求
    const accounts = (accountsRes.data.data || []).filter(
      (a: any) => a.account_status === 1,
    );
    const totalAccounts = accounts.length;
    console.log(
      `[后台同步 | ${syncId}] 📂 发现 ${totalAccounts} 个广告账户，开始分批抓取...`,
    );

    // 2. 分批处理 (5个一组)
    const chunkSize = 5;
    let syncedCount = 0;

    for (let i = 0; i < accounts.length; i += chunkSize) {
      const chunk = accounts.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (account: any) => {
          const accountId = account.account_id || account.id;
          try {
            const insightsRes = await axios.get(
              `https://graph.facebook.com/v19.0/act_${accountId}/insights`,
              {
                params: {
                  time_range: JSON.stringify({
                    since: startDate,
                    until: endDate,
                  }),
                  time_increment: 1,
                  fields:
                    "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
                  access_token: token,
                },
              },
            );

            const insights = insightsRes.data.data || [];
            for (const day of insights) {
              const actions = day.actions || [];
              const actionValues = day.action_values || [];
              const getVal = (arr: any[], type: string) => {
                const found = arr.find((a: any) => a.action_type === type);
                return found ? parseFloat(found.value) : 0;
              };

              const spend = parseFloat(day.spend || "0");
              const purchaseValue =
                getVal(actionValues, "purchase") ||
                getVal(actionValues, "omni_purchase");
              const purchases = getVal(actions, "purchase");
              const clicks = parseInt(day.clicks || "0");
              const impressions = parseInt(day.impressions || "0");

              await prisma.adInsight.upsert({
                where: { accountId_date: { accountId, date: day.date_start } },
                update: {
                  accountName: day.account_name,
                  reach: parseInt(day.reach || "0"),
                  impressions,
                  clicks,
                  spend,
                  addToCart: getVal(actions, "add_to_cart"),
                  initiateCheckout: getVal(actions, "initiate_checkout"),
                  purchases,
                  purchaseValue,
                  roas: spend > 0 ? purchaseValue / spend : 0,
                  cpc: clicks > 0 ? spend / clicks : 0,
                  ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                  atcRate:
                    clicks > 0
                      ? (getVal(actions, "add_to_cart") / clicks) * 100
                      : 0,
                  checkoutRate:
                    clicks > 0
                      ? (getVal(actions, "initiate_checkout") / clicks) * 100
                      : 0,
                  cpp: purchases > 0 ? spend / purchases : 0,
                },
                create: {
                  accountId,
                  date: day.date_start,
                  accountName: day.account_name,
                  reach: parseInt(day.reach || "0"),
                  impressions,
                  clicks,
                  spend,
                  addToCart: getVal(actions, "add_to_cart"),
                  initiateCheckout: getVal(actions, "initiate_checkout"),
                  purchases,
                  purchaseValue,
                  roas: spend > 0 ? purchaseValue / spend : 0,
                  cpc: clicks > 0 ? spend / clicks : 0,
                  ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                  atcRate:
                    clicks > 0
                      ? (getVal(actions, "add_to_cart") / clicks) * 100
                      : 0,
                  checkoutRate:
                    clicks > 0
                      ? (getVal(actions, "initiate_checkout") / clicks) * 100
                      : 0,
                  cpp: purchases > 0 ? spend / purchases : 0,
                },
              });
            }
            syncedCount++;
            if (syncedCount % 10 === 0 || syncedCount === totalAccounts) {
              console.log(
                `[后台同步 | ${syncId}] 📈 进度: ${syncedCount}/${totalAccounts} 账户`,
              );
            }
          } catch (err: any) {
            const status = err.response?.status;
            const metaError = err.response?.data?.error?.message || err.message;
            if (status === 403) {
              console.warn(
                `[后台同步 | ${syncId}] ⚠️ 账户 ${accountId} 无权限或被限制访问 (403): ${metaError}`,
              );
            } else if (status >= 500) {
              console.warn(
                `[后台同步 | ${syncId}] ⚠️ Meta 账户 ${accountId} 服务端不可用 (${status}): ${metaError}`,
              );
            } else {
              console.error(
                `[后台同步 | ${syncId}] ❌ 账户 ${accountId} 同步失败:`,
                metaError,
              );
            }
          }
        }),
      );

      // 强制延迟 2 秒防止限流
      if (i + chunkSize < accounts.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(
      `[后台同步 | ${syncId}] ✅ 同步完成! 共处理 ${totalAccounts} 个账户`,
    );
  } catch (error: any) {
    const status = error.response?.status;
    const metaError = error.response?.data?.error?.message || error.message;
    console.error(
      `[后台同步 | ${syncId}] 🚨 全局同步异常 (${status || "Unknown"}):`,
      metaError,
    );
  }
}

app.use("/api", (req, res) => {
  res
    .status(404)
    .json({ error: `API Route not found: ${req.method} ${req.url}` });
});

async function startServer() {
  try {
    console.log("🚀 Starting server startup sequence...");
    await checkDb();
    if (process.env.NODE_ENV !== "production") {
      console.log("🛠️ Initializing Vite development middleware...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          host: "0.0.0.0",
          allowedHosts: true,
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      // Production mode - only serve static files if NOT on Vercel
      if (!process.env.VERCEL) {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }
    }

    // Only listen if not running as a Vercel Serverless Function
    if (!process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`✅ Server is ready on port ${PORT}`);
        console.log(`📍 Binding: http://0.0.0.0:${PORT}`);

        // --- 启动后台静默同步 ---
        // runBackgroundSync(); // Disable immediate run to prevent startup crashes
        setInterval(runBackgroundSync, 2 * 60 * 60 * 1000); // 之后每 2 小时执行一次
        console.log("[后台任务] 已开启自动同步，频率: 每 2 小时");
      });
    }
  } catch (error) {
    console.error("❌ Critical error during server startup:", error);
    if (!process.env.VERCEL) process.exit(1);
  }
}

if (!process.env.VERCEL) {
  startServer();
} else {
  // Always trigger DB connection check on startup in serverless mode too
  checkDb();
}
