import express, { Request, Response, NextFunction } from "express";
import path from "path";
import axios from "axios";
import prisma from "./db.js";
import { subDays, format } from "date-fns";

// Log available models on startup to debug the "undefined" error
async function checkDb() {
  try {
    await prisma.$connect();
    console.log("📡 Connecting to Neon PostgreSQL database...");
    const models = Object.keys(prisma).filter(key => !key.startsWith('$') && !key.startsWith('_'));
    console.log("📦 Available models in Prisma:", models);
    if (!models.includes('adInsight')) {
      console.error("⚠️ CRITICAL: 'adInsight' model not found on prisma object!");
    }
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
}

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
    hasDbUrl: !!dbUrl,
    dbUrlPrefix: dbUrl ? dbUrl.substring(0, 20) + "..." : null
  });
});

// Helper to get Meta Access Token from DB or Env
async function getMetaToken() {
  const setting = await prisma.setting.findUnique({
    where: { key: "META_ACCESS_TOKEN" }
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
      return res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }
    const response = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
      params: {
        fields: "name,account_id,account_status",
        limit: 1000,
        access_token: token,
      },
    });
    // 只拉取活跃账户
    res.json((response.data.data || []).filter((a: any) => a.account_status === 1));
  } catch (error: any) {
    const msg = extractMetaError(error);
    console.error("Fetch accounts error:", error.response?.data || error.message);
    res.status(500).json({ error: msg });
  }
});

// 2. 同步数据
app.post("/api/sync", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  try {
    const token = await getMetaToken();
    if (!token) {
      return res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
    }

    const accountsResponse = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
      params: {
        fields: "name,account_id,account_status",
        limit: 1000,
        access_token: token,
      },
    });

    const accounts = (accountsResponse.data.data || []).filter((a: any) => a.account_status === 1);
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    for (const account of accounts) {
      if (stopSync) break;
      const accountId = account.account_id || account.id;
      try {
        const insightsResponse = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/insights`, {
          params: {
            time_range: JSON.stringify({ since: startDate, until: endDate }),
            time_increment: 1,
            fields: "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
            access_token: token,
          },
        });

        const insights = insightsResponse.data.data;

        for (const day of insights) {
          const actions = day.actions || [];
          const getActionValue = (type: string) => {
            const action = actions.find((a: any) => a.action_type === type);
            return action ? parseFloat(action.value) : 0;
          };

          const actionValues = day.action_values || [];
          const getActionVal = (type: string) => {
            const action = actionValues.find((a: any) => a.action_type === type);
            return action ? parseFloat(action.value) : 0;
          };

          const carts = getActionValue("add_to_cart");
          const checkouts = getActionValue("initiate_checkout");
          const purchases = getActionValue("purchase");
          const purchaseValue = getActionVal("purchase") || getActionVal("omni_purchase");

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

          console.log(`Upserting data for account ${accountId} on date ${day.date_start}`);
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
        // Do not abort all accounts if one fails, just log it
        const status = err.response?.status;
        if (status === 403) {
          console.warn(`[API Sync] ⚠️ Account ${accountId} access restricted (403): ${lastError}`);
        } else {
          console.error(`[API Sync] ❌ Error syncing account ${accountId}:`, err.response?.data || err.message);
        }
      }
    }

    if (stopSync && totalSynced === 0) {
      return res.status(401).json({ error: lastError });
    }

    res.json({ success: true, count: totalSynced, error: stopSync ? lastError : undefined });
  } catch (error: any) {
    const msg = extractMetaError(error);
    console.error("Sync error:", error.response?.data || error.message);
    res.status(500).json({ error: msg });
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
    res.status(500).json({ error: "Failed to fetch data", details: error?.message });
  }
});

// 4. 系统设置
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    settings.forEach(s => {
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
    if (err.name === 'PrismaClientInitializationError' || err.message?.includes('Authentication failed')) {
      res.status(500).json({ error: "数据库连接失败，请检查环境变量 DATABASE_URL 是否正确或密码是否已过期。" });
    } else {
      res.status(500).json({ error: "Failed to save setting", details: err instanceof Error ? err.message : String(err) });
    }
  }
});

// --- NEW ACCOUNT MAPPING ENDPOINTS ---

// 获取数据库中已保存的账户映射
app.get("/api/mappings", async (req, res) => {
  try {
    const mappings = await prisma.accountMapping.findMany();
    res.json(mappings);
  } catch (err) {
    console.error("Fetch mappings error:", err);
    res.status(500).json({ error: "Failed to fetch mappings from DB" });
  }
});

// 批量保存/更新账户映射
app.post("/api/mappings/batch", async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: "Mappings array is required" });
  }

  try {
    const results = await Promise.all(
      mappings.map((mapping: any) =>
        prisma.accountMapping.upsert({
          where: { accountId: mapping.accountId },
          update: {
            accountName: mapping.accountName,
            project: mapping.project,
            store: mapping.store,
            owner: mapping.owner,
            updatedAt: new Date(),
          },
          create: {
            accountId: mapping.accountId,
            accountName: mapping.accountName,
            project: mapping.project,
            store: mapping.store,
            owner: mapping.owner,
          },
        })
      )
    );
    res.json({ success: true, count: results.length });
  } catch (err: any) {
    console.error("Batch save mappings error:", err);
    res.status(500).json({ error: "Failed to save mappings to DB", details: err.message });
  }
});

// 获取本地已有的去重账户列表 (用于设置页面分配)
app.get("/api/accounts/list", async (req, res) => {
  try {
    const accounts = await prisma.adInsight.groupBy({
      by: ['accountId', 'accountName'],
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unique accounts from DB" });
  }
});

// --- END NEW ENDPOINTS ---

app.use("/api", (req, res) => {
  res.status(404).json({ error: `API Route not found: ${req.method} ${req.url}` });
});

// 定时任务：自动同步近一个月数据 (用于 Vercel Cron)
// 配置 5 分钟超时限制 (Vercel Serverless 环境)
export const maxDuration = 300; 

app.get("/api/cron/sync-monthly", async (req, res) => {
  console.log("⏰ Starting background sync: Last 30 days...");
  try {
    const token = await getMetaToken();
    if (!token) throw new Error("Meta Access Token is not configured in settings.");

    const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    // 1. 获取所有子账户
    const accountsResponse = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
      params: {
        fields: "name,account_id,account_status",
        limit: 1000,
        access_token: token,
      },
    });

    const accounts = (accountsResponse.data.data || []).filter((a: any) => a.account_status === 1);
    let totalSynced = 0;
    let stopSync = false;
    let lastError = "";

    // 2. 遍历同步每个账户
    for (const account of accounts) {
      if (stopSync) break;
      const accountId = account.account_id || account.id;
      try {
        const insightsRes = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/insights`, {
          params: {
            time_range: JSON.stringify({ since: startDate, until: endDate }),
            time_increment: 1,
            fields: "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
            access_token: token,
          },
        });

        const insights = insightsRes.data.data || [];
        for (const day of insights) {
          const actions = day.actions || [];
          const actionValues = day.action_values || [];

          const getVal = (arr: any[], type: string) => {
            const found = arr.find((a: any) => a.action_type === type);
            return found ? parseFloat(found.value) : 0;
          };

          const spend = parseFloat(day.spend || "0");
          const purchaseValue = getVal(actionValues, "purchase") || getVal(actionValues, "omni_purchase");
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
          console.warn(`[Cron Sync] ⚠️ Account ${accountId} access restricted (403): ${lastError}`);
        } else {
          console.error(`[Cron Sync] ❌ Failed for account ${accountId}:`, accErr.response?.data || accErr.message);
        }
      }
    }

    if (stopSync && totalSynced === 0) {
      throw new Error(lastError);
    }

    console.log(`✅ Background sync finished. Total rows: ${totalSynced}`);
    res.json({ success: true, count: totalSynced, range: { startDate, endDate }, error: stopSync ? lastError : undefined });
  } catch (error: any) {
    const msg = extractMetaError(error);
    const status = error.response?.status;
    console.error(`[Cron Sync] Global failure (${status || 'Unknown'}):`, msg);
    res.status(500).json({ error: msg });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `API Route not found: ${req.method} ${req.url}` });
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
      accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
        params: { fields: "name,account_id,account_status", limit: 1000, access_token: token },
      });
    } catch (apiErr: any) {
      const status = apiErr.response?.status;
      if (status >= 500) {
        console.warn(`[后台同步 | ${syncId}] ⚠️ Meta API 服务端暂时不可用 (${status})，将在下次同步重试。`);
        return;
      }
      throw apiErr;
    }
    
    // 只保留处于活跃状态 (account_status === 1) 的广告账户，极大地减少不必要的请求
    const accounts = (accountsRes.data.data || []).filter((a: any) => a.account_status === 1);
    const totalAccounts = accounts.length;
    console.log(`[后台同步 | ${syncId}] 📂 发现 ${totalAccounts} 个广告账户，开始分批抓取...`);

    // 2. 分批处理 (5个一组)
    const chunkSize = 5;
    let syncedCount = 0;

    for (let i = 0; i < accounts.length; i += chunkSize) {
      const chunk = accounts.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (account: any) => {
        const accountId = account.account_id || account.id;
        try {
          const insightsRes = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/insights`, {
            params: {
              time_range: JSON.stringify({ since: startDate, until: endDate }),
              time_increment: 1,
              fields: "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
              access_token: token,
            },
          });

          const insights = insightsRes.data.data || [];
          for (const day of insights) {
            const actions = day.actions || [];
            const actionValues = day.action_values || [];
            const getVal = (arr: any[], type: string) => {
              const found = arr.find((a: any) => a.action_type === type);
              return found ? parseFloat(found.value) : 0;
            };

            const spend = parseFloat(day.spend || "0");
            const purchaseValue = getVal(actionValues, "purchase") || getVal(actionValues, "omni_purchase");
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
                atcRate: clicks > 0 ? (getVal(actions, "add_to_cart") / clicks) * 100 : 0,
                checkoutRate: clicks > 0 ? (getVal(actions, "initiate_checkout") / clicks) * 100 : 0,
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
                atcRate: clicks > 0 ? (getVal(actions, "add_to_cart") / clicks) * 100 : 0,
                checkoutRate: clicks > 0 ? (getVal(actions, "initiate_checkout") / clicks) * 100 : 0,
                cpp: purchases > 0 ? spend / purchases : 0,
              },
            });
          }
          syncedCount++;
          if (syncedCount % 10 === 0 || syncedCount === totalAccounts) {
            console.log(`[后台同步 | ${syncId}] 📈 进度: ${syncedCount}/${totalAccounts} 账户`);
          }
        } catch (err: any) {
          const status = err.response?.status;
          const metaError = err.response?.data?.error?.message || err.message;
          if (status === 403) {
             console.warn(`[后台同步 | ${syncId}] ⚠️ 账户 ${accountId} 无权限或被限制访问 (403): ${metaError}`);
          } else if (status >= 500) {
             console.warn(`[后台同步 | ${syncId}] ⚠️ Meta 账户 ${accountId} 服务端不可用 (${status}): ${metaError}`);
          } else {
             console.error(`[后台同步 | ${syncId}] ❌ 账户 ${accountId} 同步失败:`, metaError);
          }
        }
      }));

      // 强制延迟 2 秒防止限流
      if (i + chunkSize < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[后台同步 | ${syncId}] ✅ 同步完成! 共处理 ${totalAccounts} 个账户`);
  } catch (error: any) {
    const status = error.response?.status;
    const metaError = error.response?.data?.error?.message || error.message;
    console.error(`[后台同步 | ${syncId}] 🚨 全局同步异常 (${status || 'Unknown'}):`, metaError);
  }
}

async function startServer() {
  try {
    console.log("🚀 Starting server startup sequence...");
    if (process.env.NODE_ENV !== "production") {
      console.log("🛠️ Initializing Vite development middleware...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true, 
          host: "0.0.0.0",
          allowedHosts: true
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
        runBackgroundSync(); // 立即触发一次
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
}
