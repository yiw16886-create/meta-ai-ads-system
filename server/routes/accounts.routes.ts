import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { getMetaToken, extractMetaError, evaluateActivityStatus, getCachedData, setCachedData, collapseRequest, isUserFacebookConnected } from "../utils.js";

const router = Router();

router.get("", async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.json([]);
  }

  // Check if the user has an active Facebook token
  const hasFbToken = await isUserFacebookConnected(userId);
  if (!hasFbToken) {
    return res.json([]);
  }

  let token: string | null = null;
  try {
    token = await getMetaToken(userId);
  } catch (e) {}

  const forceRefresh = req.query.force_refresh === 'true';
  const cacheKey = `accounts_list_${userId || "global"}`;

  if (!forceRefresh) {
    const cached = getCachedData(cacheKey);
    if (cached) return res.json(cached);
  }

  if (token) {
    try {
      const filteredResult = await collapseRequest(cacheKey, async () => {
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
        return (response.data.data || []).filter((a: any) => a.account_status === 1);
      });

      setCachedData(cacheKey, filteredResult, 300000); // 5 min cache
      return res.json(filteredResult);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      const errorCode = error.response?.data?.error?.code ? `(Code ${error.response.data.error.code})` : "";
      const errorSubcode = error.response?.data?.error?.error_subcode ? `(Subcode ${error.response.data.error.error_subcode})` : "";
      console.warn(
        `Fetch accounts live graph API request failed, moving to database/mock fallback: ${errorMsg} ${errorCode} ${errorSubcode}`
      );
    }
  }

  // Fallback if no token is configured or live API failed
  try {
    const dbAccs = await prisma.adAccount.findMany({
      where: { userId: Number(userId) },
      include: { store: true }
    });
    if (dbAccs.length > 0) {
      const formatted = dbAccs.map(acc => ({
        id: acc.fb_account_id.startsWith("act_") ? acc.fb_account_id : `act_${acc.fb_account_id}`,
        account_id: acc.fb_account_id.replace("act_", ""),
        name: acc.fb_account_name || `Account ${acc.fb_account_id}`,
        account_status: 1
      }));
      return res.json(formatted);
    }
  } catch (prismaErr: any) {
    console.warn("Prisma query failed during accounts list fallback:", prismaErr.message);
  }

  // Return 502 error when both live API and database fail
  return res.status(502).json({ success: false, message: "Meta Graph API 請求受限，請重新授權" });
});

async function fetchMetaDetailsWithRetry(
  cleanAccId: string,
  targetLevel: string,
  fields: string,
  token: string,
  timeRange: string,
  extraFields: string,
  insightsFields: string
) {
  const filteringParam = JSON.stringify([
    {
      field: "effective_status",
      operator: "IN",
      value: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]
    }
  ]);

  // Try 1: Limit 250 with filtering and full nested insights
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/act_${cleanAccId}/${targetLevel}`,
      {
        params: {
          fields,
          limit: 250,
          access_token: token,
          filtering: filteringParam
        },
        timeout: 15000,
      }
    );
    return {
      data: res.data?.data || [],
      paging: res.data?.paging
    };
  } catch (err1: any) {
    const errCode = err1.response?.data?.error?.code;
    const errSubCode = err1.response?.data?.error?.error_subcode;
    const errMsg = err1.response?.data?.error?.message || err1.message;
    console.warn(`[Meta API Retry] Attempt 1 for ${targetLevel} failed (Code ${errCode}/Sub ${errSubCode}: ${errMsg}). Retrying without filtering...`);
    await new Promise((r) => setTimeout(r, 300));

    // Try 2: Limit 100 with full nested insights but no filtering param
    try {
      const res = await axios.get(
        `https://graph.facebook.com/v19.0/act_${cleanAccId}/${targetLevel}`,
        {
          params: {
            fields,
            limit: 100,
            access_token: token,
          },
          timeout: 15000,
        }
      );
      return {
        data: res.data?.data || [],
        paging: res.data?.paging
      };
    } catch (err2: any) {
      console.warn(`[Meta API Retry] Attempt 2 for ${targetLevel} failed. Retrying with lightweight query...`);
      await new Promise((r) => setTimeout(r, 400));

      // Try 3: Fetch base items without nested insights (Meta Graph API lightweight query)
      const lightFields = `name,status,effective_status,daily_budget,lifetime_budget${extraFields}`;
      const baseRes = await axios.get(
        `https://graph.facebook.com/v19.0/act_${cleanAccId}/${targetLevel}`,
        {
          params: {
            fields: lightFields,
            limit: 200,
            access_token: token,
          },
          timeout: 15000,
        }
      );

      const items = baseRes.data?.data || [];
      if (items.length === 0) {
        return { data: [], paging: baseRes.data?.paging };
      }

      // Query level insights separately if possible
      try {
        const timeRangeObj = JSON.parse(timeRange);
        const insightsRes = await axios.get(
          `https://graph.facebook.com/v19.0/act_${cleanAccId}/insights`,
          {
            params: {
              level: targetLevel === "campaigns" ? "campaign" : targetLevel === "adsets" ? "adset" : "ad",
              time_range: JSON.stringify(timeRangeObj),
              fields: `campaign_id,adset_id,ad_id,${insightsFields}`,
              limit: 200,
              access_token: token
            },
            timeout: 15000
          }
        );

        const insightsMap = new Map<string, any>();
        for (const ins of insightsRes.data?.data || []) {
          const key = ins.ad_id || ins.adset_id || ins.campaign_id;
          if (key) insightsMap.set(key, ins);
        }

        const merged = items.map((item: any) => {
          const foundIns = insightsMap.get(item.id);
          return {
            ...item,
            insights: foundIns ? { data: [foundIns] } : undefined
          };
        });

        return { data: merged, paging: baseRes.data?.paging };
      } catch (insErr: any) {
        console.warn(`[Meta API Retry] Fetching separate insights failed (${insErr.message}), returning base items.`);
        return { data: items, paging: baseRes.data?.paging };
      }
    }
  }
}

router.get("/:accountId/details", async (req: any, res) => {
  const { accountId } = req.params;
  const { startDate, endDate, level } = req.query; // level: 'campaigns', 'adsets', 'ads'

  if (!accountId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const userId = req.user?.id;
  const cleanAccId = accountId.replace("act_", "").trim();

  // Validate account ownership
  const ownsAccount = await prisma.adAccount.findFirst({
    where: {
      fb_account_id: cleanAccId,
      userId: Number(userId)
    }
  });
  if (!ownsAccount) {
    const mapping = await prisma.accountMapping.findFirst({
      where: {
        fbAccountId: { contains: cleanAccId },
        userId: Number(userId)
      }
    });
    if (!mapping && req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Forbidden: You do not have access to this account." });
    }
  }

  const validLevels = ["campaigns", "adsets", "ads"];
  const targetLevel = validLevels.includes(level as string)
    ? level
    : "campaigns";

  const forceRefresh = req.query.force_refresh === 'true';
  const cacheKey = `details_${accountId}_${targetLevel}_${startDate}_${endDate}`;
  const cached = getCachedData(cacheKey, forceRefresh);
  if (cached) return res.json(cached);

  const startStr = startDate as string;
  const endStr = endDate as string;

  try {
    const token = await getMetaToken(req.user?.id);
    if (!token) throw new Error("Meta Token 未配置，自动触发本地级联备份逻辑");

    const result = await collapseRequest(cacheKey, async () => {
      // 组合时间范围
      const timeRange = JSON.stringify({ since: startStr, until: endStr });
      const insightsFields =
        "spend,impressions,reach,frequency,actions,cost_per_action_type,action_values,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,clicks,ctr,cpc";

      let extraFields = "";
      if (targetLevel === "adsets") extraFields = ",campaign_id";
      if (targetLevel === "ads") extraFields = ",campaign_id,adset_id,creative";

      // 我们在此请求该层级下的所有项目，包含 insights。
      const fields = `name,status,effective_status,daily_budget,lifetime_budget${extraFields},insights.time_range(${timeRange}){${insightsFields}}`;

      return await fetchMetaDetailsWithRetry(
        cleanAccId,
        targetLevel,
        fields,
        token,
        timeRange,
        extraFields,
        insightsFields
      );
    });

    setCachedData(cacheKey, result, 300000); // 5 min cache
    return res.json(result);
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.error?.code ? `(Code ${error.response.data.error.code})` : "";
    const errorSubcode = error.response?.data?.error?.error_subcode ? `(Subcode ${error.response.data.error.error_subcode})` : "";
    console.warn(
      `[Resilient Details Fallback] Meta API Error for details of ${accountId}/${targetLevel}: ${errorMsg} ${errorCode} ${errorSubcode}`
    );

    try {
      // Load cached structures from database or fallback defaults if DB is completely empty
      let baseItems: any[] = [];
      const targetAccountIds = [cleanAccId, `act_${cleanAccId}`];
      if (targetLevel === "campaigns") {
        const dbCamps = await prisma.campaign.findMany({
          where: { accountId: { in: targetAccountIds } }
        });
        baseItems = dbCamps.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status || "ACTIVE",
          effective_status: c.status || "ACTIVE",
          daily_budget: 0
        }));
      } else if (targetLevel === "adsets") {
        const dbAdsets = await prisma.adSet.findMany({
          where: { accountId: { in: targetAccountIds } }
        });
        baseItems = dbAdsets.map(s => ({
          id: s.id,
          name: s.name,
          campaign_id: s.campaignId,
          status: "ACTIVE",
          effective_status: "ACTIVE",
          daily_budget: 0
        }));
      } else if (targetLevel === "ads") {
        const dbAds = await prisma.ad.findMany({
          where: { accountId: { in: targetAccountIds } },
          include: { creative: true }
        });
        baseItems = dbAds.map(a => ({
          id: a.id,
          name: a.name,
          campaign_id: a.campaignId,
          adset_id: a.adsetId,
          creative_id: a.creativeId,
          creative: a.creativeId ? { id: a.creativeId } : null,
          status: "ACTIVE",
          effective_status: "ACTIVE"
        }));
      }

      // Query database for historical aggregate metrics for this account to scale insights realistically
      const dbInsights = await prisma.adInsight.findMany({
        where: {
          accountId: { in: targetAccountIds },
          date: { gte: startStr, lte: endStr }
        }
      });

      const totSpend = dbInsights.reduce((sum, i) => sum + i.spend, 0);
      const totImg = dbInsights.reduce((sum, i) => sum + i.impressions, 0);
      const totReach = dbInsights.reduce((sum, i) => sum + i.reach, 0);
      const totClicks = dbInsights.reduce((sum, i) => sum + i.clicks, 0);
      const totAtc = dbInsights.reduce((sum, i) => sum + i.addToCart, 0);
      const totPurchases = dbInsights.reduce((sum, i) => sum + i.purchases, 0);
      const totValue = dbInsights.reduce((sum, i) => sum + i.purchaseValue, 0);

      const count = baseItems.length || 1;
      const data = baseItems.map((item, idx) => {
        let spend = totSpend > 0 ? (totSpend / count) : 0;
        let impressions = totImg > 0 ? (totImg / count) : 0;
        let reach = totReach > 0 ? (totReach / count) : 0;
        let clicks = totClicks > 0 ? (totClicks / count) : 0;
        let addToCart = totAtc > 0 ? (totAtc / count) : 0;
        let purchases = totPurchases > 0 ? (totPurchases / count) : 0;
        let purchaseValue = totValue > 0 ? (totValue / count) : 0;

        spend = Math.round(spend * 100) / 100;
        purchaseValue = Math.round(purchaseValue * 100) / 100;

        const cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0;
        const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
        const frequency = reach > 0 ? Math.round((impressions / reach) * 100) / 100 : 1.25;
        const cpm = impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0;

        return {
          ...item,
          insights: {
            data: [
              {
                spend: spend.toString(),
                impressions: impressions.toString(),
                reach: reach.toString(),
                frequency: frequency.toString(),
                clicks: clicks.toString(),
                ctr: ctr.toString(),
                cpc: cpc.toString(),
                cpm: cpm.toString(),
                inline_link_clicks: clicks.toString(),
                inline_link_click_ctr: ctr.toString(),
                cost_per_inline_link_click: cpc.toString(),
                actions: [
                  { action_type: "purchase", value: purchases.toString() },
                  { action_type: "omni_purchase", value: purchases.toString() },
                  { action_type: "add_to_cart", value: addToCart.toString() },
                  { action_type: "omni_add_to_cart", value: addToCart.toString() }
                ],
                action_values: [
                  { action_type: "purchase", value: purchaseValue.toString() },
                  { action_type: "omni_purchase", value: purchaseValue.toString() }
                ]
              }
            ]
          }
        };
      });

      const result = {
        data,
        paging: { cursors: { before: "MA", after: "ND" } },
        isFallbackCached: true
      };
      setCachedData(cacheKey, result);
      return res.json(result);
    } catch (fallbackErr: any) {
      console.error("FATAL Details fallback failed entirely:", fallbackErr.message);
      return res.json({ data: [], paging: {}, isFallbackCached: true });
    }
  }
});

router.get("/:accountId/audience-insights", async (req: any, res) => {
  const { accountId } = req.params;
  const { startDate, endDate, breakdown } = req.query;

  const userId = req.user?.id;
  const cleanAccId = accountId.replace("act_", "").trim();

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validate account ownership
  const ownsAccountAudience = await prisma.adAccount.findFirst({
    where: {
      fb_account_id: cleanAccId,
      userId: Number(userId)
    }
  });
  if (!ownsAccountAudience) {
    const mapping = await prisma.accountMapping.findFirst({
      where: {
        fbAccountId: { contains: cleanAccId },
        userId: Number(userId)
      }
    });
    if (!mapping && req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Forbidden: You do not have access to this account." });
    }
  }

  try {
    const token = await getMetaToken(userId);

    let breakdownsParam = "";
    if (breakdown === "gender_age") breakdownsParam = "age,gender";
    else if (breakdown === "country") breakdownsParam = "country";
    else if (breakdown === "placement") breakdownsParam = "publisher_platform,platform_position,device_platform";
    else return res.status(400).json({ error: "Invalid breakdown type" });

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/act_${cleanAccId}/insights`,
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

    return res.json(response.data.data || []);
  } catch (error: any) {
    const status = error.response?.status || 500;
    const errorMsg = error.response?.data?.error?.message || error.message || "獲取受眾分析失敗";
    return res.status(status).json({
      success: false,
      error: `Meta API 請求受限或驗證失敗: ${errorMsg}`,
      code: status
    });
  }
});

router.get("/:accountId/hierarchy", async (req: any, res) => {
  const { accountId } = req.params;
  const userId = req.user?.id;
  const cleanAccId = accountId.replace("act_", "").trim();

  // Validate account ownership
  const ownsAccountHierarchy = await prisma.adAccount.findFirst({
    where: {
      fb_account_id: cleanAccId,
      userId: Number(userId)
    }
  });
  if (!ownsAccountHierarchy) {
    const mapping = await prisma.accountMapping.findFirst({
      where: {
        fbAccountId: { contains: cleanAccId },
        userId: Number(userId)
      }
    });
    if (!mapping && req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Forbidden: You do not have access to this account." });
    }
  }

  const forceRefresh = req.query.force_refresh === 'true';
  const cacheKey = `hierarchy_${accountId}`;
  const cached = getCachedData(cacheKey, forceRefresh);
  if (cached) return res.json(cached);

  try {
    const token = await getMetaToken(userId);
    if (!token) return res.status(400).json({ error: "Meta Token 未配置" });

    const result = await collapseRequest(cacheKey, async () => {
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
            fields: "id,name,adset_id,campaign_id,creative",
            limit: 500,
            access_token: token,
          },
        }),
      ]);

      return {
        success: true,
        campaigns: campaignsRes.data.data || [],
        adSets: adsetsRes.data.data || [],
        ads: (adsRes.data.data || []).map((ad: any) => ({
          id: ad.id,
          name: ad.name,
          adset_id: ad.adset_id,
          campaign_id: ad.campaign_id,
          creative_id: ad.creative?.id || null,
        })),
      };
    });

    setCachedData(cacheKey, result, 300000); // 5 min cache

    // BACKGROUND SYNC to persistent DB storage for resilient future fallbacks
    try {
      const camps = result.campaigns || [];
      const sets = result.adSets || [];
      const adsList = result.ads || [];

      // Upsert campaigns
      for (const c of camps) {
        if (!c.id) continue;
        await prisma.campaign.upsert({
          where: { id: c.id },
          update: { name: c.name, accountId: cleanAccId },
          create: { id: c.id, name: c.name, accountId: cleanAccId }
        });
      }

      // Helper to clean prefixes 'as-', 'ad-', 'camp-'
      const cleanPrefix = (str: string | null | undefined): string => {
        if (!str) return "";
        return str.replace(/^(as-|ad-|camp-)/gi, "");
      };

      // Upsert adSets
      for (const s of sets) {
        if (!s.id) continue;
        const cleanedSetId = cleanPrefix(s.id);
        const cleanedCampId = cleanPrefix(s.campaign_id);
        await prisma.adSet.upsert({
          where: { id: cleanedSetId },
          update: { name: s.name, campaignId: cleanedCampId, accountId: cleanAccId },
          create: { id: cleanedSetId, name: s.name, campaignId: cleanedCampId, accountId: cleanAccId }
        });
      }

      // Upsert ads
      for (const a of adsList) {
        if (!a.id) continue;
        const cId = a.creative_id || null;
        const cleanedAdId = cleanPrefix(a.id);
        const cleanedSetId = cleanPrefix(a.adset_id);
        const cleanedCampId = cleanPrefix(a.campaign_id);
        await prisma.ad.upsert({
          where: { id: cleanedAdId },
          update: { name: a.name, adsetId: cleanedSetId, campaignId: cleanedCampId, accountId: cleanAccId, creativeId: cId },
          create: { id: cleanedAdId, name: a.name, adsetId: cleanedSetId, campaignId: cleanedCampId, accountId: cleanAccId, creativeId: cId }
        });
      }
    } catch (saveErr: any) {
      console.warn("Background persistence of hierarchy failed:", saveErr.message);
    }

    return res.json(result);
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.error?.code ? `(Code ${error.response.data.error.code})` : "";
    const errorSubcode = error.response?.data?.error?.error_subcode ? `(Subcode ${error.response.data.error.error_subcode})` : "";
    console.warn(
      `[Resilient Fallback Triggered] Meta API Error for hierarchy of ${accountId} (Rate Limit or Access error): ${errorMsg} ${errorCode} ${errorSubcode}`
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

router.get("/list", async (req: any, res) => {
  try {
    const userId = req.user?.id ? Number(req.user.id) : null;

    const bmAccounts = new Map<string, { name: string; status?: string }>();
    
    if (userId) {
      const hasFbToken = await isUserFacebookConnected(userId);
      if (hasFbToken) {
        const bms = await prisma.facebookBusinessManager.findMany({
          where: { userId }
        });
        bms.forEach(bm => {
          if (bm.healthDetails) {
            try {
              const parsed = JSON.parse(bm.healthDetails);
              const details = parsed?.adAccounts?.details;
              if (Array.isArray(details)) {
                details.forEach((acc: any) => {
                  if (acc.id) {
                    const cleanId = String(acc.id).replace("act_", "").trim();
                    const accName = acc.name && acc.name !== "Unknown" ? acc.name : "";
                    const accStatus = acc.status || "";
                    
                    const existing = bmAccounts.get(cleanId);
                    bmAccounts.set(cleanId, {
                      name: accName || existing?.name || "",
                      status: accStatus || existing?.status || ""
                    });
                  }
                });
              }
            } catch (e) {
              // ignore
            }
          }
        });
      }
    }

    if (!userId) {
      return res.json([]);
    }

    const allAdAccounts = await prisma.adAccount.findMany({
      where: { userId: Number(userId) }
    });
    const userAccountIds = allAdAccounts.map(a => a.fb_account_id.replace("act_", "").trim());

    const allMonitoring = userAccountIds.length > 0 
      ? await prisma.metaAccountMonitoring.findMany({
          where: { accountId: { in: userAccountIds.flatMap(id => [id, `act_${id}`]) } }
        })
      : [];

    const allMappings = await prisma.accountMapping.findMany({
      where: { userId: Number(userId) }
    });

    const allInsights = userAccountIds.length > 0 
      ? await prisma.adInsight.findMany({
          where: { accountId: { in: userAccountIds.flatMap(id => [id, `act_${id}`]) } },
          select: { accountId: true, accountName: true },
          distinct: ['accountId']
        })
      : [];
    
    const uniqueMap = new Map();

    const processAccount = (rawId: string, currentName?: string | null, sourceStatus?: string | null) => {
      if (!rawId) return;
      const idStr = String(rawId).replace("act_", "").trim();
      
      // Determine best name
      let bestName = "";
      
      // Check BM parsed details first (highly accurate)
      if (bmAccounts.has(idStr)) {
        bestName = bmAccounts.get(idStr)!.name || "";
      }
      
      // Fallback 1: currentName if valid
      if (!bestName && currentName && currentName !== "Unknown" && currentName !== "Default Meta Account") {
        bestName = currentName;
      }
      
      // Fallback 2: use idStr itself
      if (!bestName || bestName === "Unknown") {
        bestName = idStr;
      }

      // Determine best status
      let status = bmAccounts.get(idStr)?.status || sourceStatus || "";
      
      uniqueMap.set(idStr, {
        accountId: idStr,
        accountName: bestName,
        status: status
      });
    };

    // 1. Process BM accounts first
    bmAccounts.forEach((val, key) => {
      processAccount(key, val.name, val.status);
    });

    // 2. Process all database tables
    allAdAccounts.forEach(acc => {
      const idStr = acc.fb_account_id.replace("act_", "");
      const existing = uniqueMap.get(idStr);
      processAccount(
        idStr, 
        existing?.accountName || acc.fb_account_name, 
        existing?.status || (acc.activityStatus === 3 ? "DISABLED" : "")
      );
    });

    allMonitoring.forEach(acc => {
      const idStr = acc.accountId.replace("act_", "");
      const existing = uniqueMap.get(idStr);
      let statusStr = "";
      if (acc.status === 2 || acc.status === 3 || acc.activityStatus === 3) {
        statusStr = "DISABLED";
      }
      processAccount(
        idStr, 
        existing?.accountName || acc.accountName, 
        existing?.status || statusStr
      );
    });

    allMappings.forEach(acc => {
      const idStr = acc.fbAccountId.replace("act_", "");
      const existing = uniqueMap.get(idStr);
      processAccount(
        idStr, 
        existing?.accountName || acc.name, 
        existing?.status
      );
    });

    allInsights.forEach(acc => {
      const idStr = String(acc.accountId).replace("act_", "");
      const existing = uniqueMap.get(idStr);
      processAccount(
        idStr,
        existing?.accountName || acc.accountName,
        existing?.status
      );
    });

    res.json(Array.from(uniqueMap.values()));
  } catch (err: any) {
    console.error("Fetch unique accounts error:", err);
    res.json([]);
  }
});

export default router;