import express, { Request, Response, NextFunction } from "express";
import cron from "node-cron";
import path from "path";
import axios from "axios";
import prisma from "../db/index.js";
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
import { getMetaToken, evaluateActivityStatus, syncSingleAccountAdData } from "./utils.js";
import { syncBmStatusAndHealth } from "./routes/bms.routes.js";





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

// 定时任务：夜间低峰期轻量、错峰同步大盘 BM 基础数据与风控健康状态，彻底杜绝高频并发与 API 额度浪费

// =================================================================
// 任务 A：凌晨 02:00 触发 —— 轻量同步所有 BM 基础数据
// =================================================================
cron.schedule("0 2 * * *", async () => {
  console.log("⏱️ [夜间任务 A] 凌晨 02:00，开始轻量同步所有 BM 基础数据...");
  
  try {
    const allBMs = await prisma.facebookBusinessManager.findMany(); 
    console.log(`⏱️ [夜间任务 A] 发现 ${allBMs.length} 个 Business Managers. 开始轻量拉取...`);
    
    for (const bm of allBMs) {
      try {
        console.log(`-> 正在拉取 BM 基础: ${bm.bmId}`);
        const res = await axios.get(`https://graph.facebook.com/v20.0/${bm.bmId}`, {
          params: { 
            fields: 'id,name,verification_status',
            access_token: bm.systemToken
          },
          timeout: 10000
        });
        
        let verification = "UNVERIFIED";
        const rawVerification = res.data.verification_status;
        if (rawVerification === "verified" || rawVerification === "VERIFIED") {
          verification = "VERIFIED";
        } else if (rawVerification === "not_verified" || rawVerification === "UNVERIFIED") {
          verification = "UNVERIFIED";
        } else if (rawVerification) {
          verification = String(rawVerification).toUpperCase();
        }

        await prisma.facebookBusinessManager.update({
          where: { id: bm.id },
          data: { 
            name: res.data.name || bm.name, 
            verification: verification 
          }
        });
        console.log(`✅ BM ${bm.bmId} 基础更新成功: ${res.data.name} | ${verification}`);
      } catch (err: any) {
        console.error(`❌ BM ${bm.bmId} 基础拉取失败:`, err.message);
      }
      
      // 🌟 严格控速：每个 BM 之间雷打不动强制睡眠 3 秒，优雅消耗额度
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    console.log("🏁 [夜间任务 A] 所有 BM 基础数据同步完毕！");
  } catch (globalErr: any) {
    console.error("🚨 任务 A 全局崩溃:", globalErr.message);
  }
});

// =================================================================
// 任务 B：凌晨 04:00 触发 —— 专攻风控健康状态排查（Active/Restricted/Disabled）
// =================================================================
cron.schedule("0 4 * * *", async () => {
  console.log("⏱️ [夜间任务 B] 凌晨 04:00，开始进行 BM 风控状态深度排查...");
  
  try {
    const allBMs = await prisma.facebookBusinessManager.findMany();
    console.log(`⏱️ [夜间任务 B] 发现 ${allBMs.length} 个 Business Managers. 开始健康度深度排查...`);
    
    for (const bm of allBMs) {
      try {
        console.log(`-> 正在排查 BM 健康度: ${bm.bmId}`);
        
        // 尝试拉取一个稍微深入、但极度风控敏感的字段，或者通过错误捕获反推
        const res = await axios.get(`https://graph.facebook.com/v20.0/${bm.bmId}`, {
          params: { 
            fields: 'id,sharing_eligibility_status',
            access_token: bm.systemToken
          },
          timeout: 10000
        });
        
        let healthStatus = 'ACTIVE';
        const status = res.data.sharing_eligibility_status;
        
        if (status === 'INTEGRITY_RESTRICTED') {
          healthStatus = 'RESTRICTED'; // 资产受限
        } else if (status === 'DISABLED') {
          healthStatus = 'DISABLED'; // 已封禁
        }
        
        await prisma.facebookBusinessManager.update({
          where: { id: bm.id },
          data: { status: healthStatus }
        });
        console.log(`🟢 BM ${bm.bmId} 状态检测完毕: ${healthStatus}`);
      } catch (err: any) {
        // 🌟 核心：捕获被彻底封禁时 Meta 弹出的 400 权限或停用报错
        const errMsg = err.response?.data?.error?.message || err.message;
        console.log(`⚠️ BM ${bm.bmId} 请求抛错，正在反向判定状态. 错误信息: ${errMsg}`);
        
        if (errMsg.includes('disabled') || errMsg.includes('Permissions error') || err.response?.status === 400 || errMsg.includes('permission')) {
          // 如果被封、或者无权限（通常是因为封号导致解绑），直接标记为封禁/受限
          await prisma.facebookBusinessManager.update({
            where: { id: bm.id },
            data: { status: 'DISABLED' }
          });
          console.log(`🔴 已成功反向将 BM ${bm.bmId} 标记为 DISABLED (已封禁)`);
        }
      }
      
      // 🌟 同样保持 3 秒的安全睡眠间隔
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    console.log("🏁 [夜间任务 B] 所有 BM 健康风控排查完毕！");
  } catch (globalErr: any) {
    console.error("🚨 任务 B 全局崩溃:", globalErr.message);
  }
});

// Log available models on startup to debug the "undefined" error

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
    // Rename old "admin" user to "administrator@GG.com" if it exists
    const oldAdmin = await prisma.user.findUnique({ where: { email: "admin" } });
    if (oldAdmin) {
      console.log("👤 Renaming existing 'admin' user to 'administrator@GG.com'");
      try {
        await prisma.user.update({
          where: { email: "admin" },
          data: { email: "administrator@GG.com" }
        });
      } catch (renameErr) {
        console.error("Failed to rename 'admin' to 'administrator@GG.com':", renameErr);
      }
    }

    const defaultEmail = "administrator@GG.com";
    const defaultPass = process.env.VITE_ADMIN_SECRET || "123456";
    const hashedPass = await bcrypt.hash(defaultPass, 10);

    await prisma.user.upsert({
      where: { email: defaultEmail },
      update: { role: "SUPER_ADMIN" }, 
      create: {
        email: defaultEmail,
        password: hashedPass,
        role: "SUPER_ADMIN"
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global user context middleware for multi-user isolation
app.use((req: any, res, next) => {
  const userIdStr = req.headers["x-user-id"] || req.query.userId;
  if (userIdStr) {
    const parsed = parseInt(String(userIdStr), 10);
    if (!isNaN(parsed)) {
      req.user = { id: parsed };
    }
  }
  next();
});

import routes from "./routes/index.js";
app.use("/api", routes);
export default app;
const PORT = 3000;

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


// Helper to extract Meta Error Message


// 1. 获取所有广告账户


// 2. 同步数据


// 2a. 同步店铺和订单数据 (和 Meta 广告同步分开)


// 2b. 同步创意和素材数据 (和 Meta 广告及店铺同步分开)


// --- CACHING LOGIC ---
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000; // Increased to 10 minutes





// [NEW API] 单个账户层级详情 (Campaigns, AdSets, Ads)


// GET /api/accounts/:accountId/audience-insights


// [NEW API] 获取账户层级结构 (用于级联过滤)


// 3. 获取本地数据


// 4. 系统设置




// --- NEW ACCOUNT MAPPING ENDPOINTS ---

// 获取数据库中已保存的账户映射


// 批量保存/更新账户映射


// 获取本地已有的去重账户列表 (用于设置页面分配 - 只看近期 30 天内有消耗且未禁用的账户)


// --- NEW ACCOUNT MONITORING ENDPOINTS ---

// GET /api/monitoring/accounts - Detailed monitoring for all accounts


// POST /api/monitoring/accounts/:accountId/reset - Reset spend cap


// --- END MONITORING ENDPOINTS ---




// --- User Authentication and Management ---

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
            fields: "name,account_id,account_status,amount_spent",
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
      where: {
        OR: [
          { status: 3 },
          { status: 2 },
          { activityStatus: 3 }
        ]
      },
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
          let retries = 3;
          let success = false;
          while (retries > 0 && !success) {
            try {
              const realTimeSpend = account.amount_spent ? parseInt(account.amount_spent, 10) / 100 : 0;
              const activityStatus = await evaluateActivityStatus(accountId, account.account_status, token, realTimeSpend);
              if (activityStatus < 4) {
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
              success = true;
            } catch (err: any) {
              const status = err.response?.status;
              const metaError = err.response?.data?.error?.message || err.message;
              if (status >= 500) {
                retries--;
                if (retries > 0) {
                  console.warn(
                    `[后台同步 | ${syncId}] ⚠️ Meta 账户 ${accountId} 服务端不可用 (${status}): ${metaError}. Retrying in 3 seconds... (${retries} retries left)`,
                  );
                  await new Promise((resolve) => setTimeout(resolve, 3000));
                } else {
                  console.warn(
                    `[后台同步 | ${syncId}] ⚠️ Meta 账户 ${accountId} 服务端不可用 (${status}): ${metaError}. Max retries reached.`,
                  );
                }
              } else {
                if (status === 403) {
                  console.warn(
                    `[后台同步 | ${syncId}] ⚠️ 账户 ${accountId} 无权限或被限制访问 (403): ${metaError}`,
                  );
                } else {
                  console.error(
                    `[后台同步 | ${syncId}] ❌ 账户 ${accountId} 同步失败:`,
                    metaError,
                  );
                }
                success = true; // Stop retrying on non-500 errors
              }
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

async function cleanupMockData() {
  try {
    console.log("🧹 Running startup database cleanup for mock BM data...");
    
    // 1. Delete all FacebookBusinessManager records whose name starts with "BM New" or specific ID
    const deleteBms = await prisma.facebookBusinessManager.deleteMany({
      where: {
        OR: [
          { name: { startsWith: "BM New" } },
          { bmId: "100462942944183" } // The specific BM ID requested: 100462942944183
        ]
      }
    });
    console.log(`🧹 Deleted ${deleteBms.count} Business Managers matching "BM New" or target ID`);

    // 2. For any remaining Business Managers, reset/clean up healthDetails containing mock markers
    const allBms = await prisma.facebookBusinessManager.findMany();
    for (const bm of allBms) {
      if (
        bm.healthDetails &&
        (bm.healthDetails.includes("广告账户 01") ||
         bm.healthDetails.includes("官方主页") ||
         bm.healthDetails.includes("101_") ||
         bm.healthDetails.includes("102_"))
      ) {
        console.log(`🧹 Cleaning up mock healthDetails for BM ${bm.bmId} (${bm.name})`);
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
      }
    }
    console.log("🧹 Database cleanup completed successfully!");
  } catch (error) {
    console.error("🧹 Error during database cleanup:", error);
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
    checkDb()
      .then(async () => {
        await cleanupMockData();
      })
      .catch((err) => {
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
