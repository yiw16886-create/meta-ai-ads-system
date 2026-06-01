import express, { Request, Response, NextFunction } from "express";
import cron from "node-cron";
import path from "path";
import axios from "axios";
import prisma from "./db.js";
import { subDays, format } from "date-fns";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { getProductIntelligence } from "./services/product-intelligence.service.js";
import { getCreativeIntelligence } from "./services/creative-intelligence.service.js";
import { syncStoreData } from "./services/store-sync.service.js";
import { syncMetaHierarchy, ensureAdAccounts } from "./services/meta-hierarchy-sync.service.js";
import { aggregateData } from "./services/aggregation.service.js";
import { attributePurchases } from "./services/attribution.service.js";

async function evaluateActivityStatus(accountId: string, fbAccountStatus: number, token: string): Promise<number> {
  const cleanAccountId = accountId.replace("act_", "");
  
  const endDateObj = new Date();
  const startDate60Obj = subDays(endDateObj, 60);
  const startDate30Str = format(subDays(endDateObj, 30), "yyyy-MM-dd");
  
  const timeRange = {
      since: format(startDate60Obj, "yyyy-MM-dd"),
      until: format(endDateObj, "yyyy-MM-dd")
  };
  
  let spend30 = false;
  let data30 = false;
  let spend60 = false;
  let data60 = false;

  try {
      const res = await axios.get(`https://graph.facebook.com/v19.0/act_${cleanAccountId}/insights`, {
          params: {
             level: 'account',
             time_range: JSON.stringify(timeRange),
             time_increment: 1,
             fields: 'spend,impressions',
             limit: 1000,
             access_token: token
          }
      });
      
      const insights = res.data?.data || [];
      for (const row of insights) {
          const hasS = parseFloat(row.spend||"0") > 0;
          const hasD = parseInt(row.impressions||"0") > 0;
          if (row.date_start >= startDate30Str) {
              if (hasS) spend30 = true;
              if (hasD) data30 = true;
          }
          if (hasS) spend60 = true;
          if (hasD) data60 = true;
      }
  } catch (e) {
      console.warn(`[Activity Check] Failed to fetch insights for ${cleanAccountId}`);
      const dbAccount = await prisma.adAccount.findUnique({ where: { fb_account_id: cleanAccountId } });
      return dbAccount?.activityStatus || 2;
  }
  
  let status = 0;
  if (fbAccountStatus === 1) { // ACTIVE
       if (spend30 || data30) status = 1;
       else status = 2;
  } else { // DISABLED or OTHER
       if (spend30 || data30) status = 3;
       else if (spend60 || data60) status = 5;
       else status = 6;
       
       // Fallback for rule 4 if no 60-day check was possible (but we did check it so it won't be 4 ideally, 
       // but we allow 4 if strictly no data in 30d, but wait we want 5 or 6).
       // To respect "30天内无数据...已停用=4" specifically if data30=F but we can't be sure about 60d? If we are sure, we put 5/6.
  }
  
  await prisma.adAccount.updateMany({
      where: { fb_account_id: cleanAccountId },
      data: { activityStatus: status }
  });
  
  return status;
}

async function syncSingleAccountAdData(accountId: string, startDate: string, endDate: string, token: string) {
  const cleanAccountId = accountId.replace("act_", "");
  const url = `https://graph.facebook.com/v19.0/act_${cleanAccountId}/insights`;
  console.log(`[Unified Ad Sync] Fetching ACCOUNT-level insights for account ${cleanAccountId} from URL ${url}`);
  
  const insightsResponse = await axios.get(
    url,
    {
      params: {
        level: "account",
        time_range: JSON.stringify({
          since: startDate,
          until: endDate,
        }),
        time_increment: 1,
        fields:
          "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
        limit: 1000,
        access_token: token,
      },
    },
  );

  const insights = insightsResponse.data.data || [];
  console.log(`[Unified Ad Sync] Received ${insights.length} account-level insight items for account ${cleanAccountId}`);

  const accountInsightsByDate: Record<string, {
    date: string;
    accountName: string;
    reach: number;
    impressions: number;
    clicks: number;
    spend: number;
    addToCart: number;
    initiateCheckout: number;
    purchases: number;
    purchaseValue: number;
  }> = {};

  let syncedRecords = 0;

  for (const day of insights) {
    const currentDate = day.date_start;
    
    const rawAccountId = (day.account_id || cleanAccountId).replace("act_", "");
    const accountNameRaw = day.account_name || "Default Meta Account";

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

    // 1. Ensure/Sync AdAccount
    let dbAdAccount = await prisma.adAccount.findUnique({
      where: { fb_account_id: rawAccountId }
    });

    // Look up AccountMapping first to see if this account is mapped to a specific store
    const mapping = await prisma.accountMapping.findUnique({
      where: { accountId: rawAccountId }
    });
    let targetStoreId: number | null = null;
    if (mapping?.store) {
      const mappedStore = await prisma.store.findFirst({
        where: {
          name: {
            equals: mapping.store.trim(),
            mode: 'insensitive'
          }
        }
      });
      if (mappedStore) {
        targetStoreId = mappedStore.id;
      }
    }

    if (!dbAdAccount) {
      // Fallback to defaultStore if no mapping or mapped store does not exist
      if (!targetStoreId) {
        const defaultStore = await prisma.store.findFirst();
        if (defaultStore) {
          targetStoreId = defaultStore.id;
        }
      }

      if (targetStoreId) {
        dbAdAccount = await prisma.adAccount.create({
          data: {
            fb_account_id: rawAccountId,
            fb_account_name: accountNameRaw,
            fb_access_token: token,
            storeId: targetStoreId
          }
        });
      }
    } else {
      // If dbAdAccount exists, update name/token and also realign storeId if mapping dictates a valid store
      const updateData: any = {
        fb_account_name: accountNameRaw,
        fb_access_token: token
      };
      if (targetStoreId) {
        updateData.storeId = targetStoreId;
      }
      dbAdAccount = await prisma.adAccount.update({
        where: { fb_account_id: rawAccountId },
        data: updateData
      });
    }

    const store = dbAdAccount ? await prisma.store.findUnique({ where: { id: dbAdAccount.storeId } }) : null;
    const storeName = store ? store.name : null;

    // 2. Ensure/Sync AccountMapping
    await prisma.accountMapping.upsert({
      where: { accountId: rawAccountId },
      update: {
        accountName: accountNameRaw
      },
      create: {
        accountId: rawAccountId,
        accountName: accountNameRaw,
        store: "未分配"
      }
    });

    // 3. (REMOVED) Ensure/Sync Campaign, AdSet, Ad
    // This is now purely handled by syncMetaHierarchy directly avoiding dummy empty string IDs

    // 4. Group metrics for account-level AdInsight upsert
    if (!accountInsightsByDate[currentDate]) {
      accountInsightsByDate[currentDate] = {
        date: currentDate,
        accountName: accountNameRaw,
        reach: 0,
        impressions: 0,
        clicks: 0,
        spend: 0,
        addToCart: 0,
        initiateCheckout: 0,
        purchases: 0,
        purchaseValue: 0
      };
    }

    const entry = accountInsightsByDate[currentDate];
    entry.reach += reach;
    entry.impressions += impressions;
    entry.clicks += clicks;
    entry.spend += spend;
    entry.addToCart += carts;
    entry.initiateCheckout += checkouts;
    entry.purchases += purchases;
    entry.purchaseValue += purchaseValue;
  }

  // 5. Save the aggregated AdInsight items corresponding exactly to the same date/data
  for (const dateKey of Object.keys(accountInsightsByDate)) {
    const item = accountInsightsByDate[dateKey];
    const cpc = item.clicks > 0 ? item.spend / item.clicks : 0;
    const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
    const atcRate = item.clicks > 0 ? (item.addToCart / item.clicks) * 100 : 0;
    const checkoutRate = item.clicks > 0 ? (item.initiateCheckout / item.clicks) * 100 : 0;
    const cpp = item.purchases > 0 ? item.spend / item.purchases : 0;
    const roas = item.spend > 0 ? item.purchaseValue / item.spend : 0;

    // Optimization to avoid duplicate database writes if exact data already exists
    const existing = await prisma.adInsight.findUnique({
      where: {
        accountId_date: {
          accountId: cleanAccountId,
          date: dateKey,
        },
      },
    });

    if (existing) {
      const isIdentical =
        existing.accountName === item.accountName &&
        existing.reach === item.reach &&
        existing.impressions === item.impressions &&
        existing.clicks === item.clicks &&
        Math.abs(existing.spend - item.spend) < 0.001 &&
        existing.addToCart === item.addToCart &&
        existing.initiateCheckout === item.initiateCheckout &&
        existing.purchases === item.purchases &&
        Math.abs(existing.purchaseValue - item.purchaseValue) < 0.001;

      if (isIdentical) {
        // Data is identical, skip updating to optimize database and sync performance
        syncedRecords++;
        continue;
      }
    }

    await prisma.adInsight.upsert({
      where: {
        accountId_date: {
          accountId: cleanAccountId,
          date: dateKey,
        },
      },
      update: {
        accountName: item.accountName,
        reach: item.reach,
        impressions: item.impressions,
        clicks: item.clicks,
        spend: item.spend,
        addToCart: item.addToCart,
        initiateCheckout: item.initiateCheckout,
        purchases: item.purchases,
        purchaseValue: item.purchaseValue,
        cpc,
        ctr,
        atcRate,
        checkoutRate,
        cpp,
        roas,
      },
      create: {
        accountId: cleanAccountId,
        date: dateKey,
        accountName: item.accountName,
        reach: item.reach,
        impressions: item.impressions,
        clicks: item.clicks,
        spend: item.spend,
        addToCart: item.addToCart,
        initiateCheckout: item.initiateCheckout,
        purchases: item.purchases,
        purchaseValue: item.purchaseValue,
        cpc,
        ctr,
        atcRate,
        checkoutRate,
        cpp,
        roas,
      },
    });
    syncedRecords++;
  }

  return syncedRecords;
}

// -- SCHEDULE JOBS --
// Run daily aggregation at 2:00 AM
cron.schedule("0 2 * * *", async () => {
  console.log("Triggering daily aggregation job via cron...");
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];
    await attributePurchases();
    await aggregateData(dateStr, dateStr);
  } catch (error) {
    console.error("Daily aggregation job failed:", error);
  }
});

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

async function sendInvitationEmail(email: string, token: string, role: string, baseUrlInput?: string) {
  const config = await getSmtpConfig();
  if (!config) {
    console.warn("SMTP settings not configured, skipping email send. Token:", token);
    return { success: false, error: "SMTP settings not configured" };
  }
  
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });
  
  const baseUrl = baseUrlInput || process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!baseUrl) {
    console.error("❌ No baseUrl found for invitation emails!");
  }
  const registerUrl = `${baseUrl.replace(/\/$/, '')}/?token=${token}`;
  
  const html = `
    <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background-color: #2563eb; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 800;">Meta Insights Pro</h1>
        <p style="color: rgba(255,255,255,0.8); margin-top: 8px; font-size: 14px;">您的 Meta 广告分析专家</p>
      </div>
      <div style="padding: 40px; background-color: white;">
        <h2 style="font-size: 20px; color: #1e293b; margin-top: 0; margin-bottom: 16px;">加入团队邀请</h2>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">您好！</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">管理员邀请您加入 <strong>Meta Insights Pro</strong> 仪表板，您的角色为：<span style="color: #2563eb; font-weight: bold;">${role === 'admin' ? '管理员' : '成员'}</span>。</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">请点击下方按钮进入激活页面，设置您的登录密码：</p>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${registerUrl}" style="background-color: #2563eb; color: white; padding: 14px 48px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">激活账户</a>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin-top: 32px;">
          <p style="font-size: 13px; color: #64748b; margin: 0;"><strong>安全提示：</strong></p>
          <ul style="font-size: 13px; color: #64748b; margin: 8px 0 0 0; padding-left: 20px;">
            <li>此链接将在 24 小时后失效</li>
            <li>如果按钮无法跳转，请手动复制以下地址到浏览器：</li>
          </ul>
          <p style="font-size: 12px; color: #2563eb; word-break: break-all; margin-top: 12px; margin-bottom: 0;">${registerUrl}</p>
        </div>
      </div>
      <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">&copy; 2026 Meta Insights Pro. 专业高效的广告数据整合平台</p>
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
  const { startDate, endDate, syncProduct, syncCreative, accounts: requestedAccounts } = req.body;
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

    // 获取系统的停用账户 ID 且常态过滤 dormant/限制账户
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);
    const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];

    // 仅同步已映射或已绑定的账户 (AccountMapping 或 AdAccount 中的账户)，避免全局请求几千个账户导致封禁
    const dbMappings = await prisma.accountMapping.findMany();
    const dbAdAccounts = await prisma.adAccount.findMany();
    const allowedAccountIds = new Set<string>();
    dbMappings.forEach(m => { if (m.accountId) allowedAccountIds.add(m.accountId.replace("act_", "")); });
    dbAdAccounts.forEach(a => { if (a.fb_account_id) allowedAccountIds.add(a.fb_account_id.replace("act_", "")); });

    // 如果客户端显式传了 requestedAccounts 列表，我们就只同步那个列表
    if (Array.isArray(requestedAccounts) && requestedAccounts.length > 0) {
        requestedAccounts.forEach(id => allowedAccountIds.add(id.replace("act_", "")));
    }

    const accounts = (accountsResponse.data.data || []).filter(
      (a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        if (!allowedAccountIds.has(rawId)) return false; // 必须是已配置的账户
        
        // 如果端上有特定选择，严格过滤非选中的
        if (Array.isArray(requestedAccounts) && requestedAccounts.length > 0) {
            if (!requestedAccounts.map(id => id.replace("act_", "")).includes(rawId)) {
                return false;
            }
        }
        
        const isDormant = DORMANT_ACCOUNT_IDS.includes(rawId);
        return !isDormant;
      }
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
            const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token);
            if (activityStatus <= 4) {
                const count = await syncSingleAccountAdData(accountId, startDate, endDate, token);
                totalSynced += count;
            } else {
                console.log(`[Manual API Sync] ⏭️ Skipped Ad-level sync for account ${accountId} (Activity Status: ${activityStatus})`);
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

    try {
      console.log("Triggering Ensure AdAccounts...");
      await ensureAdAccounts(token);
      console.log("Triggering Meta Hierarchy Sync (excluding creatives)...");
      await syncMetaHierarchy(token, { syncCreative: false });
      console.log("Triggering Attribution and Aggregation (excluding products & creatives)...");
      await attributePurchases();
      await aggregateData(startDate, endDate, {
        syncProduct: false,
        syncCreative: false
      });
      console.log("Sync pipeline completed successfully.");
    } catch (aggErr) {
      console.error("Aggregation error during sync:", aggErr);
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

// 2a. 同步店铺和订单数据 (和 Meta 广告同步分开)
app.post("/api/sync-store", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  try {
    console.log(`[Manual Store Sync] Starting store sync: ${startDate} to ${endDate}`);
    await syncStoreData(startDate, endDate);
    await aggregateData(startDate, endDate, { syncProduct: true, syncCreative: false });
    return res.json({ success: true, message: "店铺和订单数据同步成功" });
  } catch (error: any) {
    console.error("Store sync error:", error);
    return res.status(500).json({ error: error.message || "店铺和订单数据同步失败" });
  }
});

// 2b. 同步创意和素材数据 (和 Meta 广告及店铺同步分开)
app.post("/api/sync-creatives", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  try {
    const token = await getMetaToken();
    if (!token) {
      return res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }
    console.log(`[Manual Creative Sync] Starting creative adcreatives sync: ${startDate} to ${endDate}`);
    await syncMetaHierarchy(token, { syncCreative: true });
    await aggregateData(startDate, endDate, { syncProduct: false, syncCreative: true });
    return res.json({ success: true, message: "创意素材数据同步成功" });
  } catch (error: any) {
    console.error("Creative sync error:", error);
    return res.status(500).json({ error: extractMetaError(error) });
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

// GET /api/accounts/:accountId/audience-insights
app.get("/api/accounts/:accountId/audience-insights", async (req, res) => {
  const { accountId } = req.params;
  const { startDate, endDate, breakdown } = req.query;

  try {
    const token = await getMetaToken();
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    let breakdownsParam = "";
    if (breakdown === "gender_age") breakdownsParam = "age,gender";
    else if (breakdown === "country") breakdownsParam = "country";
    else if (breakdown === "placement") breakdownsParam = "publisher_platform,platform_position,device_platform";
    else return res.status(400).json({ error: "Invalid breakdown type" });

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/act_${accountId}/insights`,
      {
        params: {
          time_range: JSON.stringify({ since: startDate, until: endDate }),
          breakdowns: breakdownsParam,
          fields: "reach,impressions,spend,actions,purchase_roas,action_values,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,ctr,cpc,clicks",
          limit: 1000,
          access_token: token,
        },
      }
    );

    res.json(response.data.data || []);
  } catch (error: any) {
    console.error("Audience insights fetch error:", error?.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch audience insights" });
  }
});

// [NEW API] 获取账户层级结构 (用于级联过滤)
app.get("/api/accounts/:accountId/hierarchy", async (req, res) => {
  const { accountId } = req.params;
  const cacheKey = `hierarchy_${accountId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  const cleanAccId = accountId.replace("act_", "").trim();

  try {
    const token = await getMetaToken();
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    // 一次性获取三种资源，去掉 insights 以提升速度
    const [campaignsRes, adsetsRes, adsRes] = await Promise.all([
      axios.get(`https://graph.facebook.com/v19.0/act_${cleanAccId}/campaigns`, {
        params: { fields: "id,name", limit: 500, access_token: token },
      }),
      axios.get(`https://graph.facebook.com/v19.0/act_${cleanAccId}/adsets`, {
        params: {
          fields: "id,name,campaign_id",
          limit: 500,
          access_token: token,
        },
      }),
      axios.get(`https://graph.facebook.com/v19.0/act_${cleanAccId}/ads`, {
        params: {
          fields: "id,name,adset_id,campaign_id",
          limit: 500,
          access_token: token,
        },
      }),
    ]);

    const result = {
      success: true,
      campaigns: campaignsRes.data.data || [],
      adSets: adsetsRes.data.data || [],
      ads: adsRes.data.data || [],
    };
    setCachedData(cacheKey, result);

    // BACKGROUND SYNC to persistent DB storage for resilient future fallbacks
    try {
      const camps = campaignsRes.data.data || [];
      const sets = adsetsRes.data.data || [];
      const adsList = adsRes.data.data || [];

      // Upsert campaigns
      for (const c of camps) {
        if (!c.id) continue;
        await prisma.campaign.upsert({
          where: { id: c.id },
          update: { name: c.name, accountId: cleanAccId },
          create: { id: c.id, name: c.name, accountId: cleanAccId }
        });
      }

      // Upsert adSets
      for (const s of sets) {
        if (!s.id) continue;
        await prisma.adSet.upsert({
          where: { id: s.id },
          update: { name: s.name, campaignId: s.campaign_id || "", accountId: cleanAccId },
          create: { id: s.id, name: s.name, campaignId: s.campaign_id || "", accountId: cleanAccId }
        });
      }

      // Upsert ads
      for (const a of adsList) {
        if (!a.id) continue;
        await prisma.ad.upsert({
          where: { id: a.id },
          update: { name: a.name, adsetId: a.adset_id || "", campaignId: a.campaign_id || "", accountId: cleanAccId },
          create: { id: a.id, name: a.name, adsetId: a.adset_id || "", campaignId: a.campaign_id || "", accountId: cleanAccId }
        });
      }
    } catch (saveErr: any) {
      console.warn("Background persistence of hierarchy failed:", saveErr.message);
    }

    return res.json(result);
  } catch (error: any) {
    console.warn(
      `[Resilient Fallback Triggered] Meta API Error for hierarchy of ${accountId} (Rate Limit or Access error):`,
      error.response?.data || error.message,
    );

    // Fall back to database metrics so that UI won't fail with a blocking 500 error
    try {
      const [dbCampaigns, dbAdSets, dbAds] = await Promise.all([
        prisma.campaign.findMany({
          where: {
            accountId: { in: [cleanAccId, `act_${cleanAccId}`] }
          }
        }),
        prisma.adSet.findMany({
          where: {
            accountId: { in: [cleanAccId, `act_${cleanAccId}`] }
          }
        }),
        prisma.ad.findMany({
          where: {
            accountId: { in: [cleanAccId, `act_${cleanAccId}`] }
          }
        })
      ]);

      const result = {
        success: true,
        campaigns: dbCampaigns.map(c => ({ id: c.id, name: c.name })),
        adSets: dbAdSets.map(s => ({ id: s.id, name: s.name, campaign_id: s.campaignId })),
        ads: dbAds.map(a => ({ id: a.id, name: a.name, adset_id: a.adsetId, campaign_id: a.campaignId })),
        isFallbackCached: true
      };

      // Set the temporary cache to prevent spamming DB/API during transient rate-limit windows
      setCachedData(cacheKey, result);
      return res.json(result);
    } catch (fallbackDbErr: any) {
      console.error("Database fallback query also failed:", fallbackDbErr.message);
      // Even if database has absolutely no records, return empty structures instead of 500 status to allow UI to render gracefully
      const safeEmptyResult = {
        success: true,
        campaigns: [],
        adSets: [],
        ads: [],
        isFallbackCached: true
      };
      return res.json(safeEmptyResult);
    }
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
        }
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
      validMappings.map(async (mapping: any) => {
        const cleanAccId = String(mapping.accountId).replace("act_", "").trim();
        const mappingName = mapping.accountName
          ? String(mapping.accountName)
          : "Unknown";

        const upMap = await prisma.accountMapping.upsert({
          where: { accountId: cleanAccId },
          update: {
            accountName: mappingName,
            project: mapping.project ? String(mapping.project) : null,
            store: mapping.store ? String(mapping.store) : null,
            owner: mapping.owner ? String(mapping.owner) : null,
            updatedAt: new Date(),
          },
          create: {
            accountId: cleanAccId,
            accountName: mappingName,
            project: mapping.project ? String(mapping.project) : null,
            store: mapping.store ? String(mapping.store) : null,
            owner: mapping.owner ? String(mapping.owner) : null,
          },
        });

        // Sync with AdAccount: find corresponding Store and upsert/update store relation
        const storeName = mapping.store ? String(mapping.store).trim() : null;
        if (storeName) {
          const store = await prisma.store.findFirst({
            where: {
              name: {
                equals: storeName,
                mode: "insensitive",
              },
            },
          });
          if (store) {
            await prisma.adAccount.upsert({
              where: { fb_account_id: cleanAccId },
              update: {
                storeId: store.id,
                fb_account_name: mappingName,
              },
              create: {
                fb_account_id: cleanAccId,
                fb_account_name: mappingName,
                storeId: store.id,
              },
            });
          }
        } else {
          // If the mapping specifies no store, remove/disconnect it from AdAccount table
          await prisma.adAccount.deleteMany({
            where: { fb_account_id: cleanAccId },
          });
        }
        return upMap;
      }),
    );
    res.json({ success: true, count: results.length });
  } catch (err: any) {
    console.error("Batch save mappings error:", err);
    res
      .status(500)
      .json({ error: "Failed to save mappings to DB", details: err.message });
  }
});

// 获取本地已有的去重账户列表 (用于设置页面分配 - 只看近期 30 天内有消耗且未禁用的账户)
app.get("/api/accounts/list", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    // 获取停用的账户 ID 列表
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);

    const rawAccounts = await prisma.adInsight.groupBy({
      by: ["accountId", "accountName"],
      where: {
        date: { gte: thirtyDaysAgoStr },
        spend: { gt: 0 }
      }
    });
    
    // Deduplicate by accountId if multiple names exist for the same ID, and filter out disabled
    const uniqueMap = new Map();
    rawAccounts.forEach(acc => {
      if (!disabledAccountIds.includes(acc.accountId) && !uniqueMap.has(acc.accountId)) {
        uniqueMap.set(acc.accountId, acc);
      }
    });
    
    res.json(Array.from(uniqueMap.values()));
  } catch (err: any) {
    console.error("Fetch unique accounts error:", err);
    res.status(500).json({
      error: "Failed to fetch unique accounts from DB",
      details: err.message,
      code: err.code,
    });
  }
});

// --- NEW ACCOUNT MONITORING ENDPOINTS ---

// GET /api/monitoring/accounts - Detailed monitoring for all accounts
app.get("/api/monitoring/accounts", async (req, res) => {
  try {
    const { refresh } = req.query;
    const token = await getMetaToken();
    if (!token) {
      return res.status(400).json({ error: "Meta Token 未配置" });
    }

    // 1. Fetch persistent cache or refresh if requested
    let cachedAccounts = await prisma.metaAccountMonitoring.findMany();
    
    if (refresh === "true" || cachedAccounts.length === 0) {
      console.log("🔄 Refreshing Meta Account Monitoring data from API...");
      const accountsRes = await axios.get(`https://graph.facebook.com/v22.0/me/adaccounts`, {
        params: {
          fields: "name,account_id,account_status,spend_cap,amount_spent,balance,currency,timezone_name",
          limit: 500,
          access_token: token,
        },
      });

      const rawAccounts = accountsRes.data.data || [];
      
      // Update DB Cache in transaction
      await prisma.$transaction(
        rawAccounts.map((acc: any) => 
          prisma.metaAccountMonitoring.upsert({
            where: { accountId: acc.account_id },
            update: {
              accountName: acc.name,
              status: acc.account_status,
              spendCap: acc.spend_cap ? parseInt(acc.spend_cap, 10) / 100 : 0,
              amountSpent: acc.amount_spent ? parseInt(acc.amount_spent, 10) / 100 : 0,
              balance: acc.balance ? parseInt(acc.balance, 10) / 100 : 0,
              currency: acc.currency,
              timezone: acc.timezone_name,
            },
            create: {
              accountId: acc.account_id,
              accountName: acc.name,
              status: acc.account_status,
              spendCap: acc.spend_cap ? parseInt(acc.spend_cap, 10) / 100 : 0,
              amountSpent: acc.amount_spent ? parseInt(acc.amount_spent, 10) / 100 : 0,
              balance: acc.balance ? parseInt(acc.balance, 10) / 100 : 0,
              currency: acc.currency,
              timezone: acc.timezone_name,
            }
          })
        )
      );
      
      cachedAccounts = await prisma.metaAccountMonitoring.findMany();
    }

    // 2. Filter logic based on AdInsight (Last 30 days and 7 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const activeAccounts = await prisma.adInsight.groupBy({
      by: ["accountId"],
      where: {
        date: { gte: thirtyDaysAgoStr },
        spend: { gt: 0 }
      },
    });
    const activeAccountIds = activeAccounts.map(acc => acc.accountId);

    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const weeklySpend = await prisma.adInsight.groupBy({
      by: ["accountId"],
      where: {
        date: { 
          gte: sevenDaysAgoStr,
          lt: todayStr // 排除今天，取过去 7 个完整自然日的数据
        }
      },
      _sum: {
        spend: true
      }
    });

    const weeklySpendMap = new Map();
    weeklySpend.forEach(ws => {
      weeklySpendMap.set(ws.accountId, (ws._sum.spend || 0) / 7);
    });

    // 3. Combine Cache + DB Insights
    const monitoringData = cachedAccounts.map((acc) => {
      const avgDailySpend = weeklySpendMap.get(acc.accountId) || 0;
      const hasSpendLast30Days = activeAccountIds.includes(acc.accountId);
      
      let realTimeBalance = 0;
      if (!acc.spendCap || acc.spendCap === 0) {
        realTimeBalance = Infinity;
      } else {
        // 可用余额 = 总限额 - 已花费
        realTimeBalance = acc.spendCap - (acc.amountSpent || 0);
        
        // 容错安全锁
        if (realTimeBalance < 0) realTimeBalance = 0;
      }
      
      let estimatedDays = null;
      if (avgDailySpend > 0) {
        if (realTimeBalance === Infinity) {
          estimatedDays = Infinity;
        } else {
          // 可用天数 = 实际可用余额 (actualBalance) / 七日均消 (avgDailySpend)
          estimatedDays = Math.round(realTimeBalance / avgDailySpend);
        }
      }

      let statusText = "异常";
      switch (acc.status) {
        case 1: statusText = "正常 (ACTIVE)"; break;
        case 2: statusText = "停用 (DISABLED)"; break;
        case 3: statusText = "待清退 (UNSETTLED)"; break;
        default: statusText = `异常 (${acc.status})`;
      }

      return {
        id: `act_${acc.accountId}`,
        accountId: acc.accountId,
        name: acc.accountName || `未命名 (${acc.accountId})`,
        accountStatus: acc.status,
        statusText,
        currency: acc.currency || "USD",
        spendCap: acc.spendCap || 0,
        amountSpent: acc.amountSpent || 0,
        balance: realTimeBalance,
        avgDailySpend,
        estimatedDays,
        usagePercent: (acc.spendCap || 0) > 0 ? ((acc.amountSpent || 0) / acc.spendCap!) * 100 : 0,
        timezone: acc.timezone,
        hasSpendLast30Days,
        lastUpdatedInCache: acc.updatedAt,
        activityStatus: 0
      };
    });

    const adAccounts = await prisma.adAccount.findMany({ select: { fb_account_id: true, activityStatus: true } });
    const activityMap = new Map();
    adAccounts.forEach(a => activityMap.set(a.fb_account_id, a.activityStatus));
    
    monitoringData.forEach(item => {
       item.activityStatus = activityMap.get(item.accountId) || 2;
    });

    const filteredMonitoringData = monitoringData;

    // Provide some metadata about full sync status
    res.json({
      accounts: filteredMonitoringData,
      stats: {
        total: filteredMonitoringData.length,
        active: filteredMonitoringData.filter(a => a.accountStatus === 1).length,
        hasSpend: filteredMonitoringData.length
      }
    });
  } catch (error: any) {
    console.error("[Monitoring API] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/monitoring/accounts/:accountId/reset - Reset spend cap
app.post("/api/monitoring/accounts/:accountId/reset", async (req, res) => {
  const { accountId } = req.params;
  try {
    const token = await getMetaToken();
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    // Meta API: POST act_{id}?spend_cap_action=reset
    await axios.post(`https://graph.facebook.com/v22.0/act_${accountId}`, null, {
      params: {
        spend_cap_action: "reset",
        access_token: token
      }
    });

    res.json({ success: true, message: "限额已成功重置" });
  } catch (error: any) {
    console.error(`[Reset Cap] Failed for ${accountId}:`, error.response?.data || error.message);
    res.status(500).json({ error: extractMetaError(error) });
  }
});

// --- END MONITORING ENDPOINTS ---

// --- INTELLIGENCE ENDPOINTS ---
app.get("/api/intelligence/products", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await getProductIntelligence(startDate as string, endDate as string);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch product intelligence", details: error.message });
  }
});

app.get("/api/intelligence/creatives", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await getCreativeIntelligence(startDate as string, endDate as string);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch creative intelligence", details: error.message });
  }
});

app.get("/api/intelligence/creatives/daily", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await prisma.creativePerformanceDaily.findMany({
      where: {
        date: {
          gte: startDate as string,
          lte: endDate as string
        }
      },
      orderBy: {
        date: "asc"
      }
    });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch daily creative performance", details: error.message });
  }
});

app.post("/api/intelligence/aggregate", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    await attributePurchases();
    const result = await aggregateData(startDate, endDate);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to aggregate intelligence", details: error.message });
  }
});

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


// GET /api/stores/all-dashboard-summary - Aggregate Shopline data for all stores
app.get("/api/stores/all-dashboard-summary", async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  try {
    const stores = await prisma.store.findMany();
    const results = await Promise.all(stores.map(async (store) => {
      if (store.shopline_token && store.domain) {
        try {
          const stats = await getShoplineAnalytics(store.domain, store.shopline_token, startDate as string, endDate as string, store.visitors || 0);
          return {
            storeName: store.name,
            totalSales: stats.totalSales,
            ordersCount: stats.ordersCount,
            visitors: stats.visitors,
            conversionRate: stats.conversionRate,
            isConfigured: true
          };
        } catch (err: any) {
          return {
            storeName: store.name,
            totalSales: 0,
            ordersCount: 0,
            visitors: store.visitors || 0,
            conversionRate: 0,
            isConfigured: true,
            error: true
          };
        }
      } else {
        return {
          storeName: store.name,
          totalSales: 0,
          ordersCount: 0,
          visitors: store.visitors || 0,
          conversionRate: 0,
          isConfigured: false
        };
      }
    }));
    
    // Convert to dictionary mapped by storeName
    const summaryMap: Record<string, any> = {};
    results.forEach(r => summaryMap[r.storeName] = r);
    
    res.json(summaryMap);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch stores summary", details: error.message });
  }
});

// POST /api/ai/chat - AI General Chat
app.post("/api/ai/chat", async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['GEMINI_API_KEY', 'GEMINI_MODEL'] } }
    });
    
    let apiKey = settings.find(s => s.key === 'GEMINI_API_KEY')?.value?.trim();
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY?.trim();
    }
    
    let aiModel = settings.find(s => s.key === 'GEMINI_MODEL')?.value?.trim() || "gemini-3.5-flash";
    if (aiModel.includes("gemini-1.5") || aiModel.includes("gemini-2.")) {
      aiModel = "gemini-3.5-flash";
    }

    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ error: "应用未配置 GEMINI_API_KEY，请在设置中配置 API Key" })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Dynamic Database Context construction
    let dbContextText = "";
    try {
      const [allStores, allMappings, allMonitorings, recentInsights] = await Promise.all([
        prisma.store.findMany({ include: { accounts: true } }),
        prisma.accountMapping.findMany(),
        prisma.metaAccountMonitoring.findMany(),
        prisma.adInsight.findMany({ orderBy: { date: "desc" }, take: 150 })
      ]);

      dbContextText = `
【已配置的店铺列表 (Stores)】:
${allStores.length === 0 ? "（暂无店铺数据）" : allStores.map(s => `- 店铺名称: ${s.name} | 域名: ${s.domain || "未配置"} | 绑定的广告账户数: ${s.accounts?.length || 0}`).join('\n')}

【广告账户映射列表 (Account Mappings)】:
${allMappings.length === 0 ? "（暂无映射数据）" : allMappings.map(m => `- 账户ID: act_${m.accountId} (别名: ${m.accountName}) | 对应店铺: ${m.store || "未配置"} | 项目: ${m.project || "未配置"} | 负责人: ${m.owner || "未配置"}`).join('\n')}

【广告账户实时健康、财务和余额监控状态】:
${allMonitorings.length === 0 ? "（暂无监控状态数据）" : allMonitorings.map(mono => {
  const statusStr = mono.status === 1 ? "正常 (ACTIVE)" : mono.status === 2 ? "禁用 (DISABLED)" : mono.status === 3 ? "待重新授权 (UNSETTLED)" : `未知(${mono.status})`;
  return `- 账户ID: act_${mono.accountId} | 账户名称: ${mono.accountName || "未知"} | 状态: ${statusStr} | 币种: ${mono.currency || "USD"} | 账户限额 (Spend Cap): ${mono.spendCap || 0} | 已消耗: ${mono.amountSpent || 0} | 账户余额 (日均量/可用额): ${mono.balance || 0}`;
}).join('\n')}

【最近同步的 150 条广告跑量数据明细 (Ad Insights - 日期倒序)】:
${recentInsights.length === 0 ? "（暂无最近的广告跑量/转化率同步数据）" : recentInsights.map(ins => `- 日期: ${ins.date} | 账户ID: act_${ins.accountId} (名称: ${ins.accountName}) | 消耗: ${ins.spend} | 展示数: ${ins.impressions} | 点击数: ${ins.clicks} | CTR: ${(ins.ctr * 100).toFixed(2)}% | CPC: ${ins.cpc} | 加购数: ${ins.addToCart} | 发起结账: ${ins.initiateCheckout} | 购买数: ${ins.purchases} | 购买总价值: ${ins.purchaseValue} | ROAS: ${ins.roas}`).join('\n')}
`;
    } catch (dbErr: any) {
      console.error("Failed to fetch database context for AI chat:", dbErr);
      dbContextText = "\n注：读取数据库实时数据出错，无法展示数据库最新数据副本，错误原因: " + dbErr.message;
    }

    const systemInstruction = `
      你是一位精通 Facebook 广告投放与独立站运营的顶尖 AI 策略师。
      你已彻底连通系统数据库，可以直接查看底部的【数据库实时数据上下文】进行诊断、分析与解答。
      
      业务规范与设定：
      1. 用户对你说话时无需手动向你粘贴当前页面或数据库里的数值！你应该【主动】基于【数据库实时数据上下文】中的实时高密度数据，提供精准计算、指标分析、表现对比或余额预警故障排查。
      2. 当用户问及"我的广告跑量如何"、"最近点击率和 ROAS"、"哪些账户断流/余额不足了"、"店铺目前的数据"等问题时，立刻提取对应的广告账户和店铺信息进行分析答疑。
      3. 若发现有些账户余额（balance）明显不足或状态为禁用（DISABLED），可在回答中给予适时的橙/红色预警或充值、排查的具体实操建议。
      4. 解答需硬核、专业、无废话、直击痛点，拒绝模棱两可。
      5. 统一使用 Markdown 格式，清晰分段或分点展示。
      
      【数据库实时数据上下文】:
      ${dbContextText}
    `;

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const formattedMessages = messages.map((m: any) => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.content || " " }]
    }));

    // Filter out initial empty parts if there are any
    // and make sure we don't pass an empty last message
    const validMessages = formattedMessages.filter((m: any) => m.parts[0].text.trim() !== "");

    const stream = await ai.models.generateContentStream({
      model: aiModel,
      contents: validMessages,
      config: {
        systemInstruction,
      }
    });

    for await (const chunk of stream) {
      const content = chunk.text;
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error: any) {
    let errorMsg = "AI 接口响应超时或失败，请重试";
    if (error?.message?.includes("API key not valid")) {
      console.error("AI 聊天失败: API Key 无效");
      errorMsg = "API Key 无效，请在平台设置中配置正确的 GEMINI_API_KEY。";
    } else {
      console.error("AI 聊天失败:", error);
    }
    res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
    res.end();
  }
});

// POST /api/ai/diagnose - AI Diagnostics Stream
app.post("/api/ai/diagnose", async (req, res) => {
  const accountData = req.body;

  const systemInstruction = `
    你是一位精通 Facebook 广告投放与独立站运营的顶尖 AI 策略师。
    你的任务是根据传入的广告账户实时财务和消耗数据，进行硬核、无废话、直击痛点的健康度诊断。

    你必须严格遵循以下业务逻辑：
    1. 【断流预警】：如果 days_remaining <= 2天，必须在报告开头以【🚨 高危断流警报】标红警告，计算出建议的充值金额（建议至少补足到7天安全消耗量）。
    2. 【消耗状态分析】：结合已花费和均消，判断该账户是否在健康跑量。
    3. 【今日动作指南】：给出的建议必须绝对具体（如：“立刻去FB后台重置限额”、“账户无断流风险，今天可保持跑量”），拒绝模棱两可。
    
    格式要求：使用 Markdown 语法，分为【风险排查】、【状态诊断】、【今日执行动作】。
  `;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['GEMINI_API_KEY', 'GEMINI_MODEL'] } }
    });
    
    let apiKey = settings.find(s => s.key === 'GEMINI_API_KEY')?.value?.trim();
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY?.trim();
    }
    
    let aiModel = settings.find(s => s.key === 'GEMINI_MODEL')?.value?.trim() || "gemini-3.5-flash";
    if (aiModel.includes("gemini-1.5") || aiModel.includes("gemini-2.")) {
      aiModel = "gemini-3.5-flash";
    }

    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ error: "应用未配置 GEMINI_API_KEY，请在设置中配置 API Key" })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const stream = await ai.models.generateContentStream({
      model: aiModel,
      contents: `请帮我诊断该广告账户的数据：${JSON.stringify(accountData)}`,
      config: {
        systemInstruction,
      }
    });

    for await (const chunk of stream) {
      const content = chunk.text;
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error: any) {
    let errorMsg = "AI 接口响应超时或失败，请重试";
    if (error?.message?.includes("API key not valid")) {
      console.error("AI 诊断失败: API Key 无效");
      errorMsg = "API Key 无效，请在平台设置中配置正确的 GEMINI_API_KEY。";
    } else {
      console.error("AI 诊断失败:", error);
    }
    res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
    res.end();
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
    // 0. Force Shopline timezone to GMT-8 (-08:00) as requested
    let tzOffset = "-08:00";

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

      // Get accounts strictly from AccountMapping associated with this store name
      const mappedAccounts = await prisma.accountMapping.findMany({
        where: { store: store.name }
      });
      
      const startDateStr = startDate as string;
      const endDateStr = endDate as string;

      if (mappedAccounts && mappedAccounts.length > 0) {
        for (const mapping of mappedAccounts) {
          const cleanAccId = mapping.accountId.replace("act_", "").trim();
          // Find if we have an access token for this account
          const adAccount = await prisma.adAccount.findFirst({
            where: {
              fb_account_id: {
                in: [cleanAccId, `act_${cleanAccId}`]
              }
            }
          });
          const tokenToUse = adAccount?.fb_access_token || globalToken;
          
          let fetchedSuccessfully = false;
          
          if (tokenToUse) {
            try {
              const insightsRes = await axios.get(
                `https://graph.facebook.com/v19.0/act_${cleanAccId}/insights`,
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
                fetchedSuccessfully = true;
                insightsRes.data.data.forEach((d: any) => {
                  const spend = parseFloat(d.spend || "0");
                  if (spend <= 0) return; // Hide accounts with no spend based on user request (不需要混乱的数据)

                  totalSpend += spend;
                  
                  const actionValues = d.action_values || [];
                  const value = actionValues.find((v: any) => v.action_type === "purchase" || v.action_type === "omni_purchase")?.value || 0;
                  totalPurchaseValue += parseFloat(value);
                  
                  adResults.push({
                    accountId: mapping.accountId,
                    accountName: mapping.accountName || d.account_name || `act_${cleanAccId}`,
                    spend,
                    purchaseValue: parseFloat(value),
                    roas: spend > 0 ? parseFloat(value) / spend : 0
                  });
                });
              }
            } catch (err: any) {
              console.warn(`[Diagnostic Warning] Meta insight live fetch bypassed/failed for ${mapping.accountId}:`, err.message);
            }
          }

          // Fallback to database `AdInsight` table if live API failed or was bypassed
          if (!fetchedSuccessfully) {
            try {
              const dbInsights = await prisma.adInsight.findMany({
                where: {
                  accountId: {
                    in: [cleanAccId, `act_${cleanAccId}`]
                  },
                  date: {
                    gte: startDateStr,
                    lte: endDateStr,
                  }
                }
              });

              if (dbInsights && dbInsights.length > 0) {
                // Aggregate db insights
                let accSpend = 0;
                let accPurchaseValue = 0;
                dbInsights.forEach(curr => {
                  accSpend += curr.spend || 0;
                  accPurchaseValue += curr.purchaseValue || 0;
                });

                if (accSpend > 0) {
                  totalSpend += accSpend;
                  totalPurchaseValue += accPurchaseValue;
                  adResults.push({
                    accountId: mapping.accountId,
                    accountName: mapping.accountName || `act_${cleanAccId}`,
                    spend: accSpend,
                    purchaseValue: accPurchaseValue,
                    roas: accSpend > 0 ? accPurchaseValue / accSpend : 0
                  });
                }
              }
            } catch (fallbackErr: any) {
              console.warn(`[Diagnostic Warning] Fallback db search failed for ${mapping.accountId}:`, fallbackErr.message);
            }
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
  const { id, name, shopline_token, shopify_token, domain, visitors, timezone } = req.body;
  try {
    if (id) {
      const updatedStore = await prisma.store.update({
        where: { id: parseInt(id, 10) },
        data: { 
          name, 
          shopline_token, 
          shopify_token, 
          domain,
          timezone: timezone || undefined,
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
          timezone: timezone || "GMT+8",
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
    const store = await prisma.store.findUnique({
      where: { id: parseInt(id, 10) },
    });

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

    // Removed automatic accountMapping upsert here to ensure mapping table is strictly manual per user instruction
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

// DELETE /api/stores/:id - Delete a store and dissociate/delete its associated metrics and resources
app.delete("/api/stores/:id", async (req, res) => {
  const storeId = parseInt(req.params.id, 10);
  if (isNaN(storeId)) {
    return res.status(400).json({ error: "Invalid store ID" });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    await prisma.$transaction([
      // 1. Delete associated product and creative daily performance stats
      prisma.productPerformanceDaily.deleteMany({ where: { storeId } }),
      prisma.creativePerformanceDaily.deleteMany({ where: { storeId } }),

      // 2. Delete associated orders and products
      prisma.order.deleteMany({ where: { storeId } }),
      prisma.product.deleteMany({ where: { storeId } }),

      // 3. Delete any ad creatives
      prisma.adCreative.deleteMany({ where: { storeId } }),

      // 4. Delete ad accounts associated with this store
      prisma.adAccount.deleteMany({ where: { storeId } }),

      // 5. Delete the store itself
      prisma.store.delete({ where: { id: storeId } }),
    ]);

    res.json({ success: true, message: `Store "${store.name}" deleted successfully` });
  } catch (error: any) {
    console.error("Failed to delete store:", error);
    res
      .status(500)
      .json({ error: "Failed to delete store", details: error.message });
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

    // 获取系统的停用账户 ID 且常态过滤 dormant/限制账户
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);
    const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];

    const accounts = (accountsResponse.data.data || []).filter(
      (a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        const isDormant = DORMANT_ACCOUNT_IDS.includes(rawId);
        return !isDormant;
      }
    );
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    // 2. 遍历同步每个账户
    for (const account of accounts) {
      if (stopSync) break;
      const accountId = account.account_id || account.id;
      try {
        const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token);
        if (activityStatus <= 4) {
             const count = await syncSingleAccountAdData(accountId, startDate, endDate, token);
             totalSynced += count;
        } else {
             console.log(`[Cron Sync] ⏭️ Skipped Ad-level sync for account ${accountId} (Activity Status: ${activityStatus})`);
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
    
    const user = await prisma.user.upsert({
      where: { email: invitation.email },
      update: { password: hashedPass, role: invitation.role },
      create: { email: invitation.email, password: hashedPass, role: invitation.role }
    });

    await prisma.invitation.delete({ where: { token } });

    res.json({ 
      success: true, 
      user: { id: user.id, email: user.email, role: user.role } 
    });
  } catch (e) {
    console.error("Registration failed", e);
    res.status(500).json({ error: "注册失败" });
  }
});

  app.post("/api/users", async (req, res) => {
    try {
      const { email, role } = req.body;
      // Construct baseUrl safely from request
      const origin = req.headers.origin;
      const host = req.get('host');
      const protocol = req.protocol;
      const baseUrl = origin || `${protocol}://${host}`;
      
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const invitation = await prisma.invitation.upsert({
        where: { email },
        update: { token, role, expiresAt },
        create: { email, token, role, expiresAt }
      });

      const emailResult = await sendInvitationEmail(email, token, role, baseUrl);
      
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

    // 获取系统的停用账户 ID 且常态过滤 dormant/限制账户
    const disabledAccounts = await prisma.metaAccountMonitoring.findMany({
      where: { status: 2 },
      select: { accountId: true }
    });
    const disabledAccountIds = disabledAccounts.map(a => a.accountId);
    const DORMANT_ACCOUNT_IDS = ["26380439", "341040412"];

    // 只排除 dormant 的广告账户
    const accounts = (accountsRes.data.data || []).filter(
      (a: any) => {
        const rawId = (a.account_id || a.id || "").replace("act_", "");
        const isDormant = DORMANT_ACCOUNT_IDS.includes(rawId);
        return !isDormant;
      }
    );
    const totalAccounts = accounts.length;
    console.log(
      `[后台同步 | ${syncId}] 📂 发现 ${totalAccounts} 个有效广告账户，开始分批抓取...`,
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
            const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token);
            if (activityStatus <= 4) {
               await syncSingleAccountAdData(accountId, startDate, endDate, token);
            } else {
               console.log(`[后台同步 | ${syncId}] ⏭️ 跳过账户 ${accountId} (活跃度: ${activityStatus})`);
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
    // Run database connection check asynchronously so the Express server binds and serves the app instantly
    checkDb().catch((err) => {
      console.error("❌ Asynchronous database check failed:", err);
    });
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
