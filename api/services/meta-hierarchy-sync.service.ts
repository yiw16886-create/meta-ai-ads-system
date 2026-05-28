import axios from "axios";
import prisma from "../db.js";

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
        await prisma.adAccount.upsert({
          where: { fb_account_id: acc.account_id },
          update: {
            fb_account_name: acc.name,
            fb_access_token: token,
          },
          create: {
            fb_account_id: acc.account_id,
            fb_account_name: acc.name,
            fb_access_token: token,
            storeId: defaultStore.id,
          }
        });
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

export async function syncMetaHierarchy(token: string) {
  // Find all active Meta ad accounts currently mapped to a store
  const accounts = await prisma.adAccount.findMany({
    include: { store: true }
  });

  if (!accounts || accounts.length === 0) {
    console.warn(`[Meta Hierarchy Sync] No Meta AdAccounts mapped to any stores found. Skipping.`);
    return;
  }

  for (const acc of accounts) {
    const actId = acc.fb_account_id.startsWith('act_') ? acc.fb_account_id : `act_${acc.fb_account_id}`;
    const rawAccountId = actId.replace('act_', '');
    console.log(`[Meta Hierarchy Sync] Starting sync for account ${actId} (store ${acc.storeId})`);

    try {
      // 1. Fetch Campaigns
      const campaignsUrl = `https://graph.facebook.com/v19.0/${actId}/campaigns`;
      console.log(`[Meta Hierarchy Sync] Fetching campaigns from URL: ${campaignsUrl}`);
      const campaignsRes = await axios.get(campaignsUrl, {
        params: { fields: "id,name,status", limit: 500, access_token: token }
      });
      const campaigns = campaignsRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${campaigns.length} campaigns`);
      
      let campSuccess = 0;
      for (const campaign of campaigns) {
        try {
          await prisma.campaign.upsert({
            where: { id: campaign.id },
            update: { name: campaign.name, status: campaign.status },
            create: {
              id: campaign.id,
              accountId: rawAccountId,
              name: campaign.name,
              status: campaign.status
            }
          });
          campSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing campaign ${campaign.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully wrote ${campSuccess} campaigns`);

      // 2. Fetch AdSets
      const adsetsUrl = `https://graph.facebook.com/v19.0/${actId}/adsets`;
      console.log(`[Meta Hierarchy Sync] Fetching adsets from URL: ${adsetsUrl}`);
      const adsetsRes = await axios.get(adsetsUrl, {
        params: { fields: "id,name,campaign_id,status", limit: 500, access_token: token }
      });
      const adsets = adsetsRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${adsets.length} adsets`);

      let adsetSuccess = 0;
      for (const adset of adsets) {
        try {
          await prisma.adSet.upsert({
            where: { id: adset.id },
            update: { name: adset.name, campaignId: adset.campaign_id },
            create: {
              id: adset.id,
              campaignId: adset.campaign_id,
              accountId: rawAccountId,
              name: adset.name
            }
          });
          adsetSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing adset ${adset.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully wrote ${adsetSuccess} adsets`);

      // 3. Fetch Ads & their Creative ID
      const adsUrl = `https://graph.facebook.com/v19.0/${actId}/ads`;
      console.log(`[Meta Hierarchy Sync] Fetching ads from URL: ${adsUrl}`);
      const adsRes = await axios.get(adsUrl, {
        params: { fields: "id,name,adset_id,campaign_id,status,creative{id}", limit: 500, access_token: token }
      });
      const ads = adsRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${ads.length} ads`);

      let adSuccess = 0;
      for (const ad of ads) {
        const creativeId = ad.creative?.id || null;
        try {
          await prisma.ad.upsert({
            where: { id: ad.id },
            update: {
              name: ad.name,
              adsetId: ad.adset_id,
              campaignId: ad.campaign_id,
              creativeId: creativeId
            },
            create: {
              id: ad.id,
              adsetId: ad.adset_id,
              campaignId: ad.campaign_id,
              accountId: rawAccountId,
              name: ad.name,
              creativeId: creativeId
            }
          });
          adSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing ad ${ad.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully wrote ${adSuccess} ads`);

      // 4. Fetch Creatives
      const creativesUrl = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
      console.log(`[Meta Hierarchy Sync] Fetching creatives from URL: ${creativesUrl}`);
      const creativesRes = await axios.get(creativesUrl, {
        params: { fields: "id,name,object_type,status", limit: 500, access_token: token }
      });
      const creatives = creativesRes.data?.data || [];
      console.log(`[Meta Hierarchy Sync] Received ${creatives.length} creatives`);

      let creativeSuccess = 0;
      for (const creative of creatives) {
        // Attempt to guess type based on object_type
        const type = getCreativeType(creative.object_type);
        
        try {
          await prisma.adCreative.upsert({
            where: { id: creative.id },
            update: {
              name: creative.name,
              type: type,
              storeId: acc.storeId
            },
            create: {
              id: creative.id,
              storeId: acc.storeId,
              name: creative.name || `Creative ${creative.id}`,
              type: type,
              hookRate: Math.random() * 50 // Example default calculation as placeholder
            }
          });
          creativeSuccess++;
        } catch (err) {
          console.error(`[Meta Hierarchy Sync] Prisma error writing creative ${creative.id}:`, err);
        }
      }
      console.log(`[Meta Hierarchy Sync] Successfully wrote ${creativeSuccess} creatives`);

    } catch (err: any) {
      console.error(`[Meta Hierarchy Sync] Failed API call for account ${actId}:`, err.response?.data || err.message);
    }
  }
}
