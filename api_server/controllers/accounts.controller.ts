import { Request, Response, NextFunction } from "express";
import axios from "axios";
import prisma from "../db";
import { getMetaToken, extractMetaError, getCachedData, setCachedData } from "../utils";

export class AccountsController {
  static async listMetaAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = await getMetaToken();
      if (!token) {
        res.status(400).json({ error: "Meta Token 未配置，请前往设置页面填写" });
        return;
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
      // 只拉取活跃账户 (1: ACTIVE)
      const data = (response.data.data || []).filter((a: any) => a.account_status === 1);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  static async getAccountDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accountId } = req.params;
      const { startDate, endDate, level } = req.query;

      if (!accountId || !startDate || !endDate) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const validLevels = ["campaigns", "adsets", "ads"];
      const targetLevel = validLevels.includes(level as string)
        ? (level as string)
        : "campaigns";

      const cacheKey = `details_${accountId}_${targetLevel}_${startDate}_${endDate}`;
      const cached = getCachedData(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const token = await getMetaToken();
      if (!token) {
        res.status(400).json({ error: "Meta Token 未配置" });
        return;
      }

      const timeRange = JSON.stringify({ since: startDate, until: endDate });
      const insightsFields =
        "spend,impressions,reach,frequency,actions,cost_per_action_type,action_values,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,clicks,ctr,cpc";

      let extraFields = "";
      if (targetLevel === "adsets") extraFields = ",campaign_id";
      if (targetLevel === "ads") extraFields = ",campaign_id,adset_id";

      const fields = `name,status,effective_status,daily_budget,lifetime_budget${extraFields},insights.time_range(${timeRange}){${insightsFields}}`;

      const response = await axios.get(
        `https://graph.facebook.com/v19.0/act_${accountId}/${targetLevel}`,
        {
          params: {
            fields,
            limit: 100,
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
    } catch (error) {
      next(error);
    }
  }

  static async getAudienceInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accountId } = req.params;
      const { startDate, endDate, breakdown } = req.query;

      const token = await getMetaToken();
      if (!token) {
        res.status(400).json({ error: "Meta Token 未配置" });
        return;
      }

      let breakdownsParam = "";
      if (breakdown === "gender_age") breakdownsParam = "age,gender";
      else if (breakdown === "country") breakdownsParam = "country";
      else if (breakdown === "placement") breakdownsParam = "publisher_platform,platform_position,device_platform";
      else {
        res.status(400).json({ error: "Invalid breakdown type" });
        return;
      }

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
    } catch (error) {
      next(error);
    }
  }

  static async getAccountHierarchy(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { accountId } = req.params;
    const cacheKey = `hierarchy_${accountId}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const cleanAccId = accountId.replace("act_", "").trim();

    try {
      const token = await getMetaToken();
      if (!token) {
        res.status(400).json({ error: "Meta Token 未配置" });
        return;
      }

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

      try {
        const camps = campaignsRes.data.data || [];
        const sets = adsetsRes.data.data || [];
        const adsList = adsRes.data.data || [];

        for (const c of camps) {
          if (!c.id) continue;
          await prisma.campaign.upsert({
            where: { id: c.id },
            update: { name: c.name, accountId: cleanAccId },
            create: { id: c.id, name: c.name, accountId: cleanAccId }
          });
        }

        for (const s of sets) {
          if (!s.id) continue;
          await prisma.adSet.upsert({
            where: { id: s.id },
            update: { name: s.name, campaignId: s.campaign_id || "", accountId: cleanAccId },
            create: { id: s.id, name: s.name, campaignId: s.campaign_id || "", accountId: cleanAccId }
          });
        }

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

      res.json(result);
    } catch (error: any) {
      console.warn(
        `[Resilient Fallback Triggered] Meta API Error for hierarchy of ${accountId} (Rate Limit or Access error):`,
        error.response?.data || error.message,
      );

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

        setCachedData(cacheKey, result);
        res.json(result);
      } catch (fallbackDbErr: any) {
        console.error("Database fallback query also failed:", fallbackDbErr.message);
        res.json({
          success: true,
          campaigns: [],
          adSets: [],
          ads: [],
          isFallbackCached: true
        });
      }
    }
  }

  static async listUniqueActiveAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

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
      
      const uniqueMap = new Map();
      rawAccounts.forEach(acc => {
        if (!disabledAccountIds.includes(acc.accountId) && !uniqueMap.has(acc.accountId)) {
          uniqueMap.set(acc.accountId, acc);
        }
      });
      
      res.json(Array.from(uniqueMap.values()));
    } catch (error) {
      next(error);
    }
  }
}
