import axios from "axios";
import prisma from "../../db/index.js";
import { evaluateActivityStatus, syncSingleAccountAdData } from "../utils.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cache the last successful hierarchy sync to avoid Graph API rate limit exhaustion
const lastHierarchySyncByAccount = new Map<string, number>();

function getCreativeType(objectType: string) {
  if (!objectType) return "IMAGE";
  const type = objectType.toUpperCase();
  if (type.includes("VIDEO")) return "VIDEO";
  if (type.includes("CAROUSEL") || type.includes("NATIVE")) return "CAROUSEL";
  return "IMAGE";
}

export async function ensureAdAccounts(token: string) {
  try {
    const url = `https://graph.facebook.com/v19.0/me/adaccounts`;
    console.log(`[Ensure AdAccounts] Fetching ad accounts from URL: ${url}`);
    const res = await axios.get(url, {
      params: { fields: "name,account_id,account_status", limit: 1000, access_token: token }
    });
    
    const metaData = res.data?.data || [];
    const activeAccounts = metaData.filter((a: any) => a.account_status === 1);
    console.log(`[Ensure AdAccounts] Received ${metaData.length} accounts, ${activeAccounts.length} active.`);
    
    // Get a default store to map these accounts to
    const defaultStore = await prisma.store.findFirst();
    if (!defaultStore) {
      console.error(`[Ensure AdAccounts] No active stores found to map ad accounts to! Skipping.`);
      return;
    }

    let successCount = 0;
    for (const acc of activeAccounts) {
      try {
        const existingAdAccount = await prisma.adAccount.findUnique({
          where: { fb_account_id: acc.account_id }
        });

        // Query AccountMapping first to see if there is an existing, user-defined mapping for this FB account ID
        const mapping = await prisma.accountMapping.findFirst({
          where: { fbAccountId: acc.account_id }
        });

        let targetStoreId: number;

        // 如果未在 AccountMapping 表显式绑定店铺（即映射不存在、或者 storeId 为 null/空），
        // 自动绑定到系统默认的 "未分配" 店铺中显示，而不能直接跳过，以免导致有消耗却不显示
        if (!mapping) {
          targetStoreId = null;
          await prisma.accountMapping.create({
            data: {
              fbAccountId: acc.account_id,
              storeId: null,
            }
          });
        } else {
          targetStoreId = mapping.storeId;
        }

        if (existingAdAccount) {
          // Keep name, token, and storeId up to date by adhering to the mapping table source of truth
          await prisma.adAccount.update({
            where: { fb_account_id: acc.account_id },
            data: {
              fb_account_name: acc.name,
              fb_access_token: token,
              storeId: targetStoreId, // Keep storeId aligned
            }
          });
        } else {
          await prisma.adAccount.create({
            data: {
              fb_account_id: acc.account_id,
              fb_account_name: acc.name,
              fb_access_token: token,
              storeId: targetStoreId,
            }
          });
        }
        successCount++;
      } catch (err) {
        console.error(`[Ensure AdAccounts] Prisma error writing ad account ${acc.account_id}:`, err);
      }
    }
    console.log(`[Ensure AdAccounts] Successfully upserted ${successCount} mapped ad accounts.`);
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
    console.error(`[Ensure AdAccounts] Failed API call: ${errorMsg}`);
  }
}

export async function syncMetaHierarchy(token: string, options: { syncCreative?: boolean; forceRefreshCampaigns?: boolean } = { syncCreative: false, forceRefreshCampaigns: false }) {
  const activeAccountIds = new Set<string>();
  try {
    const url = `https://graph.facebook.com/v19.0/me/adaccounts`;
    console.log(`[Meta Hierarchy Sync] Fetching active account list from URL to filter out disabled accounts: ${url}`);
    const res = await axios.get(url, {
      params: { fields: "account_id,account_status", limit: 1000, access_token: token }
    });
    const metaData = res.data?.data || [];
    const dormantIds = ["26380439", "341040412"];
    metaData.forEach((a: any) => {
      const rawId = (a.account_id || a.id || "").replace("act_", "");
      if (a.account_status === 1 && !dormantIds.includes(rawId)) {
        activeAccountIds.add(a.account_id);
      }
    });
    console.log(`[Meta Hierarchy Sync] Found ${activeAccountIds.size} active accounts from Meta API.`);
  } catch (error: any) {
    console.log(`[Meta Hierarchy Sync] Failed to fetch active ad accounts from Meta API: ${error.message}`);
    // As a backup, consult cached statuses in MetaAccountMonitoring as a robust lookup
    try {
      const monitoredAccounts = await prisma.metaAccountMonitoring.findMany({
        select: { accountId: true, status: true }
      });
      const dormantIds = ["26380439", "341040412"];
      monitoredAccounts.forEach(a => {
        const rawId = a.accountId.replace("act_", "");
        if (a.status === 1 && !dormantIds.includes(rawId)) {
          activeAccountIds.add(a.accountId);
        }
      });
      console.log(`[Meta Hierarchy Sync] Loaded ${activeAccountIds.size} active accounts from local monitoring cache.`);
    } catch (dbErr: any) {
      console.log(`[Meta Hierarchy Sync] Failed to read cached accounts status: ${dbErr.message}`);
    }
  }

  // Find all active Meta ad accounts currently mapped to a store
  const dbAccounts = await prisma.adAccount.findMany({
    include: { store: true }
  });

  // Filter accounts to ONLY crawl active ones (either confirmed live active or in active set fallback)
  const accounts = dbAccounts.filter(acc => {
    const rawId = acc.fb_account_id.replace('act_', '');
    // If we fetched/retrieved active ids, restrict matches. If both API and cache checks returned nothing,
    // we do not filter (activeAccountIds.size === 0) so we don't break existing setups in dry run / offline.
    if (activeAccountIds.size > 0 && !activeAccountIds.has(rawId)) {
      console.log(`[Meta Hierarchy Sync] Skipping deactivated/disabled account: ${acc.fb_account_id}`);
      return false;
    }
    return true;
  });

  if (!accounts || accounts.length === 0) {
    console.log(`[Meta Hierarchy Sync] No active/enabled Meta AdAccounts mapped to any stores found. Skipping.`);
    return;
  }

  for (const acc of accounts) {
    const actId = acc.fb_account_id.startsWith('act_') ? acc.fb_account_id : `act_${acc.fb_account_id}`;
    const rawAccountId = actId.replace('act_', '');

    // Skip warning / dormant accounts in hierarchy sync based on 4-level tiered sync rules
    const activityStatus = acc.activityStatus || 1; // Default to active if not set
    if (activityStatus === 4) {
      console.log(`[Meta Hierarchy Sync] Skipping dormant status 4 account: ${actId}`);
      continue;
    }
    if (activityStatus === 3 && !options.forceRefreshCampaigns) {
      console.log(`[Meta Hierarchy Sync] Skipping warning status 3 account because forceRefreshCampaigns is false: ${actId}`);
      continue;
    }

    // Rate-limiting check based on cache
    const lastSyncTime = lastHierarchySyncByAccount.get(rawAccountId) || 0;
    const now = Date.now();
    if (now - lastSyncTime < 15 * 60 * 1000) { // Keep cache for 15 minutes
      // Verify we actually have campaigns stored in our local DB so we don't skip empty accounts
      const hasCampaigns = await prisma.campaign.findFirst({ where: { accountId: rawAccountId } });
      if (hasCampaigns) {
        console.log(`[Meta Hierarchy Sync] Skipping live sync for account ${actId} (recently successfully synced ${Math.round((now - lastSyncTime) / 1000)}s ago)`);
        continue;
      }
    }

    console.log(`[Meta Hierarchy Sync] Starting sync for account ${actId} (store ${acc.storeId})`);

    try {
      // 1. Fetch Campaigns
      const campaignsUrl = `https://graph.facebook.com/v19.0/${actId}/campaigns`;
      console.log(`[Meta Hierarchy Sync] Fetching campaigns from URL: ${campaignsUrl}`);
      const campaignsRes = await axios.get(campaignsUrl, {
        params: { fields: "id,name,status", limit: 100, access_token: token }
      });
      const campaigns = campaignsRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${campaigns.length} campaigns`);
      
      let campSuccess = 0;
      for (const campaign of campaigns) {
        try {
          const existingCampaign = await prisma.campaign.findUnique({
            where: { id: campaign.id }
          });
          
          if (existingCampaign) {
            if (existingCampaign.name !== campaign.name || existingCampaign.status !== campaign.status) {
              await prisma.campaign.update({
                where: { id: campaign.id },
                data: { name: campaign.name, status: campaign.status }
              });
            }
          } else {
            await prisma.campaign.create({
              data: {
                id: campaign.id,
                accountId: rawAccountId,
                name: campaign.name,
                status: campaign.status
              }
            });
          }
          campSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing campaign ${campaign.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully processed ${campSuccess} campaigns`);

      await delay(300);

      // 2. Fetch AdSets
      const adsetsUrl = `https://graph.facebook.com/v19.0/${actId}/adsets`;
      console.log(`[Meta Hierarchy Sync] Fetching adsets from URL: ${adsetsUrl}`);
      const adsetsRes = await axios.get(adsetsUrl, {
        params: { fields: "id,name,campaign_id,status", limit: 100, access_token: token }
      });
      const adsets = adsetsRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${adsets.length} adsets`);

      const cleanPrefix = (str: string | null | undefined): string => {
        if (!str) return "";
        return str.replace(/^(as-|ad-|camp-)/gi, "");
      };

      let adsetSuccess = 0;
      for (const adset of adsets) {
        try {
          const cleanedSetId = cleanPrefix(adset.id);
          const cleanedCampId = cleanPrefix(adset.campaign_id);
          const existingAdSet = await prisma.adSet.findUnique({
            where: { id: cleanedSetId }
          });

          if (existingAdSet) {
            if (existingAdSet.name !== adset.name || existingAdSet.campaignId !== cleanedCampId) {
              await prisma.adSet.update({
                where: { id: cleanedSetId },
                data: { name: adset.name, campaignId: cleanedCampId }
              });
            }
          } else {
            await prisma.adSet.create({
              data: {
                id: cleanedSetId,
                campaignId: cleanedCampId,
                accountId: rawAccountId,
                name: adset.name
              }
            });
          }
          adsetSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing adset ${adset.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully processed ${adsetSuccess} adsets`);

      await delay(300);

      // 3. Fetch Ads & their Creative ID
      const adsUrl = `https://graph.facebook.com/v19.0/${actId}/ads`;
      console.log(`[Meta Hierarchy Sync] Fetching ads from URL: ${adsUrl}`);
      const adsRes = await axios.get(adsUrl, {
        params: { fields: "id,name,adset_id,campaign_id,status,creative{id,image_hash,video_id}", limit: 100, access_token: token }
      });
      const ads = adsRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${ads.length} ads`);

      let adSuccess = 0;
      for (const ad of ads) {
        const creativeId = ad.creative?.id || null;
        try {
          const cleanedAdId = cleanPrefix(ad.id);
          const cleanedSetId = cleanPrefix(ad.adset_id);
          const cleanedCampId = cleanPrefix(ad.campaign_id);
          const existingAd = await prisma.ad.findUnique({
            where: { id: cleanedAdId }
          });

          if (existingAd) {
            if (existingAd.name !== ad.name || existingAd.adsetId !== cleanedSetId || existingAd.campaignId !== cleanedCampId || existingAd.creativeId !== creativeId) {
              await prisma.ad.update({
                where: { id: cleanedAdId },
                data: {
                  name: ad.name,
                  adsetId: cleanedSetId,
                  campaignId: cleanedCampId,
                  creativeId: creativeId
                }
              });
            }
          } else {
            await prisma.ad.create({
              data: {
                id: cleanedAdId,
                adsetId: cleanedSetId,
                campaignId: cleanedCampId,
                accountId: rawAccountId,
                name: ad.name,
                creativeId: creativeId
              }
            });
          }
          adSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing ad ${ad.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully processed ${adSuccess} ads`);

      await delay(300);

      if (options?.syncCreative) {
        // 4. Fetch Creatives
        const creativesUrl = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
        console.log(`[Meta Hierarchy Sync] Fetching creatives from URL: ${creativesUrl}`);
        const creativesRes = await axios.get(creativesUrl, {
          params: { fields: "id,name,object_type,status", limit: 100, access_token: token }
        });
        const creatives = creativesRes.data?.data || [];
        console.log(`[Meta Hierarchy Sync] Received ${creatives.length} creatives`);

        let creativeSuccess = 0;
        for (const creative of creatives) {
          // Attempt to guess type based on object_type
          const type = getCreativeType(creative.object_type);
          
          try {
            await prisma.adCreative.upsert({
              where: { creativeId: creative.id },
              update: {
                name: creative.name,
                type: type,
                storeId: acc.storeId
              },
              create: {
                creativeId: creative.id,
                fbAccountId: acc.fb_account_id,
                mediaType: type || "IMAGE",
                storeId: acc.storeId,
                name: creative.name || `Creative ${creative.id}`,
                type: type,
                hookRate: 0 // Fetch real metrics instead of mock
              }
            });
            creativeSuccess++;
          } catch (err) {
            console.error(`[Meta Hierarchy Sync] Prisma error writing creative ${creative.id}:`, err);
          }
        }
        console.log(`[Meta Hierarchy Sync] Successfully processed ${creativeSuccess} creatives`);
      } else {
        console.log(`[Meta Hierarchy Sync] Skipping active fetch of Meta creatives for account ${actId}`);
      }
      lastHierarchySyncByAccount.set(rawAccountId, Date.now());

    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      console.log(`[Meta Hierarchy Sync] Live sync for account ${actId} failed: ${errorMsg}`);
    }
    // Throttle between account syncs to avoid running out of request limits
    await delay(1000);
  }
}

export async function syncSingleAccountHierarchy(
  rawAccountId: string,
  token: string,
  options: { syncCreative?: boolean; ignoreDormant?: boolean } = { syncCreative: false, ignoreDormant: true }
) {
  const cleanAccountId = rawAccountId.replace("act_", "").trim();
  const actId = `act_${cleanAccountId}`;

  console.log(`[Single Hierarchy Sync] Starting hierarchy sync for account ${actId}`);

  try {
    // 1. Fetch Campaigns
    const campaignsUrl = `https://graph.facebook.com/v19.0/${actId}/campaigns`;
    const campaignsRes = await axios.get(campaignsUrl, {
      params: { fields: "id,name,status", limit: 250, access_token: token },
      timeout: 15000,
    });
    const campaigns = campaignsRes.data?.data || [];

    for (const campaign of campaigns) {
      try {
        await prisma.campaign.upsert({
          where: { id: campaign.id },
          update: { name: campaign.name, status: campaign.status, accountId: cleanAccountId },
          create: { id: campaign.id, accountId: cleanAccountId, name: campaign.name, status: campaign.status },
        });
      } catch (err: any) {
        console.error(`[Single Hierarchy Sync] Error upserting campaign ${campaign.id}:`, err.message);
      }
    }

    await delay(200);

    // 2. Fetch AdSets
    const adsetsUrl = `https://graph.facebook.com/v19.0/${actId}/adsets`;
    const adsetsRes = await axios.get(adsetsUrl, {
      params: { fields: "id,name,campaign_id,status", limit: 250, access_token: token },
      timeout: 15000,
    });
    const adsets = adsetsRes.data?.data || [];

    const cleanPrefix = (str: string | null | undefined): string => {
      if (!str) return "";
      return str.replace(/^(as-|ad-|camp-)/gi, "");
    };

    for (const adset of adsets) {
      try {
        const cleanedSetId = cleanPrefix(adset.id);
        const cleanedCampId = cleanPrefix(adset.campaign_id);
        await prisma.adSet.upsert({
          where: { id: cleanedSetId },
          update: { name: adset.name, campaignId: cleanedCampId, accountId: cleanAccountId },
          create: { id: cleanedSetId, campaignId: cleanedCampId, accountId: cleanAccountId, name: adset.name },
        });
      } catch (err: any) {
        console.error(`[Single Hierarchy Sync] Error upserting adset ${adset.id}:`, err.message);
      }
    }

    await delay(200);

    // 3. Fetch Ads & Creative
    const adsUrl = `https://graph.facebook.com/v19.0/${actId}/ads`;
    const adsRes = await axios.get(adsUrl, {
      params: { fields: "id,name,adset_id,campaign_id,status,creative{id}", limit: 250, access_token: token },
      timeout: 15000,
    });
    const ads = adsRes.data?.data || [];

    for (const ad of ads) {
      try {
        const cleanedAdId = cleanPrefix(ad.id);
        const cleanedSetId = cleanPrefix(ad.adset_id);
        const cleanedCampId = cleanPrefix(ad.campaign_id);
        const creativeId = ad.creative?.id || null;

        await prisma.ad.upsert({
          where: { id: cleanedAdId },
          update: { name: ad.name, adsetId: cleanedSetId, campaignId: cleanedCampId, creativeId, accountId: cleanAccountId },
          create: { id: cleanedAdId, adsetId: cleanedSetId, campaignId: cleanedCampId, accountId: cleanAccountId, name: ad.name, creativeId },
        });
      } catch (err: any) {
        console.error(`[Single Hierarchy Sync] Error upserting ad ${ad.id}:`, err.message);
      }
    }

    lastHierarchySyncByAccount.set(cleanAccountId, Date.now());
    console.log(`[Single Hierarchy Sync] Successfully synced ${campaigns.length} campaigns, ${adsets.length} adsets, ${ads.length} ads for account ${actId}`);
  } catch (err: any) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error(`[Single Hierarchy Sync] Failed hierarchy sync for account ${actId}: ${errorMsg}`);
  }
}

/**
 * 绑定成功后的首次全量初始化同步 (Initial Full Sync)
 * 1. 忽略以前落库的 Dormant 标记，对新 Token 拥有的所有广告账户强行开启全量深度同步 (DepthSync=true)
 * 2. 抓取完整的 Campaigns, AdSets, Ads 以及最近 30 天的 Insights 指标
 * 3. 首次全量同步落库完成后，运行 evaluateActivityStatus 重新计算并分类更新状态 (StatusLevel / ActivityStatus)
 */
export async function triggerInitialFullSync(userId: string | number, accessToken: string) {
  const numUserId = Number(userId);
  console.log(`[OAuth Init Sync] 开始对用户 ${userId} 执行绑定后首次全量数据拉取...`);

  // 1. 自动执行 ensureAdAccounts，建立/确保 AdAccount 表与店铺映射关系
  await ensureAdAccounts(accessToken).catch(err => {
    console.error(`[OAuth Init Sync] ensureAdAccounts 提示:`, err.message || err);
  });

  // 2. 用新 Token 拉取该用户名下的所有 Ad Accounts 列表
  let accountItems: { id: string; status: number }[] = [];
  try {
    const url = `https://graph.facebook.com/v19.0/me/adaccounts`;
    const res = await axios.get(url, {
      params: { fields: "account_id,id,name,account_status", limit: 1000, access_token: accessToken },
      timeout: 15000,
    });
    const metaData = res.data?.data || [];
    accountItems = metaData.map((a: any) => ({
      id: String(a.account_id || a.id).replace("act_", "").trim(),
      status: typeof a.account_status === "number" ? a.account_status : 1
    }));
  } catch (err: any) {
    console.warn(`[OAuth Init Sync] 无法直接从 Meta API 获取账号列表, 尝试从本地数据库中检索:`, err.message);
  }

  // 备用情况: 从数据库中查询 mapped 账号
  if (accountItems.length === 0) {
    const dbAccounts = await prisma.adAccount.findMany({
      where: numUserId ? {
        OR: [
          { userId: numUserId },
          { userId: null }
        ]
      } : {},
      select: { fb_account_id: true }
    });
    accountItems = dbAccounts.map(a => ({ id: a.fb_account_id.replace("act_", "").trim(), status: 1 }));
  }

  console.log(`[OAuth Init Sync] 找到 ${accountItems.length} 个账号，开始【强行开启 DepthSync=true】全量数据同步...`);

  // 计算最近 30 天的时间范围
  const today = new Date();
  const endDate = today.toISOString().split("T")[0];
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);
  const startDate = pastDate.toISOString().split("T")[0];

  // 步骤 B: 遍历所有账户，【强行开启 DepthSync=true】执行全量拉取（忽略历史 Dormant 标记）
  for (const acc of accountItems) {
    const cleanAccId = acc.id;
    if (!cleanAccId) continue;

    try {
      console.log(`[OAuth Init Sync] 账户 act_${cleanAccId} 忽略 Dormant 标记强行拉取 Campaigns, AdSets, Ads 与 Insights...`);

      // A) 强行同步层级结构 (Campaigns, AdSets, Ads)
      await syncSingleAccountHierarchy(cleanAccId, accessToken, { ignoreDormant: true }).catch(err => {
        console.warn(`[OAuth Init Sync] 账户 act_${cleanAccId} 层级同步警告:`, err.message);
      });

      // B) 强行同步近 30 天的 Ad Insights
      await syncSingleAccountAdData(cleanAccId, startDate, endDate, accessToken).catch(err => {
        console.warn(`[OAuth Init Sync] 账户 act_${cleanAccId} Insights 同步警告:`, err.message);
      });

    } catch (accErr: any) {
      console.error(`[OAuth Init Sync] 账户 act_${cleanAccId} 首次全量拉取过程出现异常:`, accErr.message);
    }
  }

  // 步骤 C: 全量拉取完成后，重新运行原有的 evaluateActivityStatus 逻辑，对账户重新分类更新数据库状态！
  console.log(`[OAuth Init Sync] 全量数据落库完成，开始重新评估所有账户活跃度与分类...`);
  for (const acc of accountItems) {
    const cleanAccId = acc.id;
    if (!cleanAccId) continue;
    try {
      await evaluateActivityStatus(cleanAccId, acc.status ?? 1, accessToken);
    } catch (evalErr: any) {
      console.warn(`[OAuth Init Sync] 重新评估账户 act_${cleanAccId} 活跃度失败:`, evalErr.message);
    }
  }

  console.log(`[OAuth Init Sync] 用户 ${userId} 首次全量同步与规则重新分类全部成功完成！`);
}
