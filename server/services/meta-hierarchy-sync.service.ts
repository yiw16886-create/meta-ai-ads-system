import axios from "axios";
import prisma from "../../db/index.js";

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
        if (!mapping || !mapping.storeId) {
          let unassignedStore = await prisma.store.findUnique({
            where: { name: "未分配" }
          });
          if (!unassignedStore) {
            unassignedStore = await prisma.store.create({
              data: {
                name: "未分配",
                platform: "shopline",
                timezone: "America/Los_Angeles"
              }
            });
          }
          targetStoreId = unassignedStore.id;

          if (!mapping) {
            await prisma.accountMapping.create({
              data: {
                fbAccountId: acc.account_id,
                storeId: targetStoreId,
                project: "未分配",
                owner: "未分配"
              }
            });
          } else {
            await prisma.accountMapping.update({
              where: { id: mapping.id },
              data: {
                storeId: targetStoreId,
                project: mapping.project || "未分配",
                owner: mapping.owner || "未分配"
              }
            });
          }
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
    console.error(`[Ensure AdAccounts] Failed API call:`, error.response?.data || error.message);
  }
}

export async function syncMetaHierarchy(token: string, options: { syncCreative?: boolean } = { syncCreative: false }) {
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
