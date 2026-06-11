import prisma from '../../db/index.js';
import axios from 'axios';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getCreativeIntelligence(startDate: string, endDate: string, storeFilter?: string) {
  console.log(`[Creative Intelligence] Fetching data from ${startDate} to ${endDate} for storeFilter: ${storeFilter}`);
  
  const setting = await prisma.setting.findUnique({ where: { key: "meta_access_token" } });
  if (!setting || !setting.value) {
    console.warn("[Creative Intelligence] Missing Meta Access Token");
    return [];
  }
  const token = setting.value;

  const accounts = await prisma.adAccount.findMany({
    include: { store: true }
  });
  
  const targetAccounts = storeFilter && storeFilter !== "all" 
      ? accounts.filter(a => a.store?.name === storeFilter || a.storeId.toString() === storeFilter) 
      : accounts;
      
  const hashAggregations: Record<string, any> = {};

  for (const acc of targetAccounts) {
      if (acc.activityStatus > 2) continue;

      const fbAccountId = acc.fb_account_id.startsWith('act_') ? acc.fb_account_id : `act_${acc.fb_account_id}`;
      const url = `https://graph.facebook.com/v21.0/${fbAccountId}/insights`;
      try {
          const res = await axios.get(url, {
              params: {
                  level: 'ad',
                  time_range: JSON.stringify({ since: startDate, until: endDate }),
                  fields: 'ad_id,ad_name,spend,impressions,clicks,reach,actions,action_values',
                  limit: 1000,
                  access_token: token
              }
          });
          
          const insights = res.data?.data || [];
          
          if (insights.length > 0) {
              const adIds = insights.map((i: any) => i.ad_id);
              const adsInDb = await prisma.ad.findMany({
                  where: { id: { in: adIds } },
                  include: { creative: true }
              });
              
              const adMap = new Map();
              for(const dbAd of adsInDb) {
                  if (dbAd.creativeId) {
                      adMap.set(dbAd.id, {
                          creativeId: dbAd.creativeId,
                          hash: dbAd.creative?.imageHash || dbAd.creative?.videoHash || dbAd.creative?.metaAssetId || dbAd.creativeId,
                          previewUrl: dbAd.creative?.previewUrl,
                          type: dbAd.creative?.type,
                          landingUrl: dbAd.creative?.landingUrl,
                          pageId: dbAd.creative?.pageId,
                          effectivePostId: dbAd.creative?.effectivePostId
                      });
                  }
              }
              
              for (const stat of insights) {
                  const adId = stat.ad_id;
                  const adData = adMap.get(adId);
                  
                  if (!adData || !adData.hash) continue;
                  
                  const hash = adData.hash;
                  
                  if (!hashAggregations[hash]) {
                      hashAggregations[hash] = {
                          id: hash,
                          name: stat.ad_name,
                          creativeId: adData.creativeId || hash,
                          storeName: acc.store ? acc.store.name : "未分配",
                          accountId: acc.fb_account_id,
                          accountName: acc.fb_account_name || acc.fb_account_id,
                          status: "ACTIVE", 
                          spend: 0,
                          impressions: 0,
                          clicks: 0,
                          reach: 0,
                          purchases: 0,
                          purchaseValue: 0,
                          previewUrl: adData.previewUrl,
                          landingUrl: adData.landingUrl,
                          pageId: adData.pageId,
                          pageName: adData.pageName,
                          effectivePostId: adData.effectivePostId,
                          type: adData.type
                      };
                  }
                  
                  const agg = hashAggregations[hash];
                  agg.spend += parseFloat(stat.spend || "0");
                  agg.impressions += parseInt(stat.impressions || "0", 10);
                  agg.reach += parseInt(stat.reach || "0", 10);
                  
                  // Extract clicks if they exist in basic fields or actions. Let's fetch clicks from action type 'link_click' or total 'clicks' 
                  // usually clicks is a field in insights. We need to ensure we request it. 
                  agg.clicks += parseInt(stat.clicks || "0", 10);
                  
                  if (stat.actions) {
                      const pur = stat.actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
                      if (pur) agg.purchases += parseInt(pur.value || "0", 10);
                  }
                  if (stat.action_values) {
                      const val = stat.action_values.find((a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
                      if (val) agg.purchaseValue += parseFloat(val.value || "0");
                  }
              }
          }
      } catch (err: any) {
         console.warn(`[Creative Intelligence] Minor error fetching ad insights for ${acc.fb_account_id}:`, err.message);
      }
      
      // Delay to respect rate limits
      await delay(150);
  }
  
  return Object.values(hashAggregations).map(agg => {
      agg.roas = agg.spend > 0 ? agg.purchaseValue / agg.spend : 0;
      agg.cpp = agg.purchases > 0 ? agg.spend / agg.purchases : 0;
      agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
      agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
      agg.cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
      return agg;
  }).sort((a,b) => b.spend - a.spend); 
}
