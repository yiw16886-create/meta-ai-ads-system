import axios from "axios";
import prisma from "../../db/index.js";
import { getMetaToken, cleanFbAccountId, extractMetaError } from "../utils.js";

export interface DraftPayload {
  accountId: string;
  name: string;
  dailyBudget: number;
  targetCountry?: string;
}

/**
 * 校验指定 accountId 是否属于用户（或用户所在的 Organization / 权限范围）
 */
export async function verifyAccountOwnership(userId: number, accountId: string): Promise<boolean> {
  const cleanId = cleanFbAccountId(accountId);
  if (!cleanId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, org_id: true }
  });

  // 管理员或超级管理员拥有全量测试/管理权限
  if (user?.role === "admin" || user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") {
    return true;
  }

  // 1. 检查 AccountMapping 绑定关系
  const mapping = await prisma.accountMapping.findFirst({
    where: {
      fbAccountId: { in: [cleanId, `act_${cleanId}`] },
      OR: [
        { userId: userId },
        { userId: null }
      ]
    }
  });

  if (mapping) return true;

  // 2. 检查 AdAccount 表绑定关系
  const adAccount = await prisma.adAccount.findFirst({
    where: {
      fb_account_id: { in: [cleanId, `act_${cleanId}`] },
      OR: [
        { userId: userId },
        { userId: null }
      ]
    }
  });

  return !!adAccount;
}

/**
 * 获取指定广告账户的 Campaign 列表（含归属校验）
 */
export async function getCampaignsForUser(userId: number, accountId: string) {
  const isOwner = await verifyAccountOwnership(userId, accountId);
  if (!isOwner) {
    throw new Error(`无权访问广告账户 act_${cleanFbAccountId(accountId)}，请确认账户绑定权限`);
  }

  const cleanId = cleanFbAccountId(accountId);
  const token = await getMetaToken(userId);

  if (token) {
    try {
      const response = await axios.get(`https://graph.facebook.com/v21.0/act_${cleanId}/campaigns`, {
        params: {
          fields: "id,name,status,daily_budget,lifetime_budget,objective,created_time",
          limit: 100,
          access_token: token,
        },
        timeout: 15000,
      });

      if (response.data?.data) {
        return response.data.data.map((c: any) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : undefined,
          objective: c.objective,
          createdTime: c.created_time,
        }));
      }
    } catch (e) {
      console.warn(`[MetaAdsService] Meta API Error fetching campaigns for act_${cleanId}:`, e?.message);
    }
  }

  // Fallback: Query local database
  const dbCampaigns = await prisma.campaign.findMany({
    where: { accountId: { in: [cleanId, `act_${cleanId}`] } },
    select: { id: true, name: true, status: true, storeId: true },
    take: 100,
  });

  return dbCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status || "UNKNOWN",
    dailyBudget: undefined,
    objective: "OUTCOME_SALES",
    createdTime: new Date().toISOString(),
  }));
}

/**
 * 安全创建 PAUSED 销售广告系列草稿 (PAUSED Sales Campaign Draft)
 */
export async function createPausedSalesDraft(userId: number, payload: DraftPayload) {
  const { accountId, name, dailyBudget, targetCountry } = payload;
  const cleanId = cleanFbAccountId(accountId);

  if (!cleanId) {
    throw new Error("广告账户 ID 不能为空");
  }
  if (!name || name.trim().length === 0) {
    throw new Error("草稿系列名称不能为空");
  }
  if (!dailyBudget || Number(dailyBudget) < 1) {
    throw new Error("每日预算须至少为 1 美元");
  }

  const isOwner = await verifyAccountOwnership(userId, accountId);
  if (!isOwner) {
    throw new Error(`归属校验失败：您无权在账户 act_${cleanId} 下创建广告草稿`);
  }

  const token = await getMetaToken(userId);
  if (!token) {
    throw new Error("未查找到有效的 Meta Access Token，请先在设置中绑定授权");
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { org_id: true }
  });

  const budgetInCents = Math.round(Number(dailyBudget) * 100);

  // 严格实施：状态必须是 PAUSED
  const metaParams: any = {
    name: name.trim(),
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    daily_budget: budgetInCents,
    special_ad_categories: [],
    access_token: token,
  };

  try {
    const url = `https://graph.facebook.com/v21.0/act_${cleanId}/campaigns`;
    const response = await axios.post(url, metaParams, { timeout: 20000 });

    const campaignId = response.data?.id;
    if (!campaignId) {
      throw new Error("Meta 接口响应中未能返回创新的 Campaign ID");
    }

    // 写入本地数据库
    await prisma.campaign.create({
      data: {
        id: campaignId,
        accountId: cleanId,
        name: name.trim(),
        status: "PAUSED",
      },
    }).catch(() => null);

    // 记录成功操作日志
    await prisma.metaActionLog.create({
      data: {
        userId,
        orgId: actor?.org_id,
        action: "CREATE_PAUSED_SALES_DRAFT",
        accountId: cleanId,
        status: "SUCCESS",
        requestJson: { accountId: cleanId, name, dailyBudget, targetCountry, objective: "OUTCOME_SALES", status: "PAUSED" },
        resultJson: response.data,
      },
    }).catch(() => null);

    return {
      success: true,
      campaignId,
      status: "PAUSED",
      message: `成功创建 PAUSED 销售系列草稿 (ID: ${campaignId})`,
    };
  } catch (error: any) {
    const errMsg = extractMetaError(error);

    // 记录失败日志
    await prisma.metaActionLog.create({
      data: {
        userId,
        orgId: actor?.org_id,
        action: "CREATE_PAUSED_SALES_DRAFT",
        accountId: cleanId,
        status: "FAILED",
        requestJson: { accountId: cleanId, name, dailyBudget, targetCountry },
        errorMessage: errMsg,
      },
    }).catch(() => null);

    throw new Error(`Meta 接口创建草稿失败: ${errMsg}`);
  }
}
