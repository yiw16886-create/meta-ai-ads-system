import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { getMetaToken, extractMetaError, evaluateActivityStatus, getCachedData, setCachedData } from "../utils.js";

const router = Router();

router.get("", async (req, res) => {
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

router.get("/:accountId/details", async (req, res) => {
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

router.get("/:accountId/audience-insights", async (req, res) => {
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

router.get("/:accountId/hierarchy", async (req, res) => {
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

router.get("/list", async (req, res) => {
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

export default router;