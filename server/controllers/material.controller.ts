import { Request, Response } from 'express';
import prisma from '../../db/index.js';
import axios from 'axios';
import { collapseRequest, getMetaToken, callMetaApiWithRetry } from '../utils.js';

// Helper function to clean leading act_ prefix for reliable ID comparisons
function cleanFbAccountId(id: string | null | undefined): string {
  if (!id) return '';
  return String(id).replace(/^act_/, '').trim();
}

const apiCache = new Map<string, { data: any, expire: number }>();
function getCachedApi(key: string, forceRefresh: boolean = false) {
  if (forceRefresh) {
    apiCache.delete(key);
    return null;
  }
  const hit = apiCache.get(key);
  if (hit && hit.expire > Date.now()) return hit.data;
  return null;
}
function setCachedApi(key: string, data: any, ttlSecs: number) {
  apiCache.set(key, { data, expire: Date.now() + ttlSecs * 1000 });
}

export async function getShopMaterialLeaderboard(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.json({ success: true, data: [], total: 0 });
    }

    // 1. 获取前端传来的筛选参数
    const { storeId, accountIds, startDate, endDate, materialType, page = 1, pageSize = 20 } = req.query;
    
    const parsedPage = Number(page);
    const parsedPageSize = Number(pageSize);
    const skip = (parsedPage - 1) * parsedPageSize;

    // 2. 第一步：以 AccountMapping 表为大闸，严格使用 storeId、userId 和 fbAccountId 进行权限隔离
    const accountMappingWhere: any = {
      OR: [
        { userId: Number(userId) },
        { userId: null }
      ]
    };
    if (storeId && storeId !== 'all') {
      accountMappingWhere.storeId = Number(storeId);
    }
    if (accountIds && String(accountIds).trim() !== '' && accountIds !== 'all') {
      const accList = String(accountIds).split(',').map(id => id.trim()).filter(Boolean);
      if (accList.length > 0) {
        // Uniform cleaning
        const cleanAccList = accList.map(id => cleanFbAccountId(id));
        accountMappingWhere.fbAccountId = { in: cleanAccList };
      }
    }

    // 查询该用户与店铺下所有合法绑定的 fbAccountId 集合
    const validAccounts = await prisma.accountMapping.findMany({
      where: accountMappingWhere,
      select: { fbAccountId: true, storeId: true }
    });

    let allowedAccountIds = validAccounts.map(a => cleanFbAccountId(a.fbAccountId));

    if (allowedAccountIds.length === 0) {
      const userAccounts = await prisma.adAccount.findMany({
        where: { OR: [{ userId: Number(userId) }, { userId: null }] },
        select: { fb_account_id: true }
      });
      allowedAccountIds = userAccounts.map(a => cleanFbAccountId(a.fb_account_id));
    }

    if (allowedAccountIds.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }

    // 预备查询账号 IDs (同时照顾带 act_ 前缀及不带的前缀)
    const queryAccountIds = [
      ...allowedAccountIds,
      ...allowedAccountIds.map(id => `act_${id}`)
    ];

    // 3. 第二步：跨表联动 Ad 表（匹配 账户ID），捞出对应的 Ad 记录，并关联对应的 creatives
    const ads = await prisma.ad.findMany({
      where: {
        accountId: { in: queryAccountIds }
      },
      include: {
        creative: true
      }
    });

    // 4. 第三步：获取每一个广告的表现指标
    // 优先尝试从 Facebook API 异步拉取
    const globalToken = await getMetaToken(userId);

    // 提前获取各账户独立Token
    const adAccounts = await prisma.adAccount.findMany({
      where: { fb_account_id: { in: allowedAccountIds } },
      select: { fb_account_id: true, fb_access_token: true }
    });
    const tokenMap = new Map();
    adAccounts.forEach(acc => {
      if (acc.fb_access_token) {
        tokenMap.set(acc.fb_account_id, acc.fb_access_token);
      }
    });

    type RealAdMetrics = {
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      linkClicks: number;
      purchases: number;
      purchaseValue: number;
      addToCart: number;
      initiateCheckout: number;
    };
    const emptyMetrics = (): RealAdMetrics => ({
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      linkClicks: 0,
      purchases: 0,
      purchaseValue: 0,
      addToCart: 0,
      initiateCheckout: 0,
    });
    const adMetrics: Record<string, RealAdMetrics> = {};
    
    // 初始化每一个 ad 零值指标
    for (const ad of ads) {
      adMetrics[ad.id] = emptyMetrics();
    }

    const forceRefresh = req.query.force_refresh === 'true';
    if (allowedAccountIds.length > 0) {
      console.log(`[Material Controller] Fetching insights for accounts: ${allowedAccountIds.join(', ')}`);
      
      const fetchPromises = allowedAccountIds.map(async (actId) => {
        try {
          const cleanActId = cleanFbAccountId(actId);
          const cacheKey = `MAT_AD_INS_${cleanActId}_${startDate}_${endDate}`;
          const cached = getCachedApi(cacheKey, forceRefresh);
          if (cached) {
            return { actId, insights: cached };
          }
          
          const useToken = tokenMap.get(cleanActId) || globalToken;
          if (!useToken) return { actId, insights: [] };

          const fbActId = `act_${cleanActId}`;
          const url = `https://graph.facebook.com/v21.0/${fbActId}/insights`;
          
          const insights = await collapseRequest(cacheKey, async () => {
            const res = await callMetaApiWithRetry(
              url,
              {
                params: {
                  level: 'ad',
                  time_range: JSON.stringify({
                    since: String(startDate || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
                    until: String(endDate || new Date().toISOString().slice(0, 10)),
                  }),
                  time_increment: 1,
                  fields: 'date_start,ad_id,spend,impressions,reach,inline_link_clicks,clicks,actions,action_values',
                  limit: 1000,
                  access_token: useToken
                },
                timeout: 45000,
              },
              3
            );
            const fetched = res.data?.data || [];
            setCachedApi(cacheKey, fetched, 1800); // cache for 30 minutes
            return fetched;
          });

          return { actId, insights };
        } catch (err: any) {
          const metaError = err.response?.data?.error;
          const errorMessage =
            metaError?.message ||
            err.message ||
            "Meta广告级指标请求失败";

          console.error(
            `[Material Controller] Failed to fetch real insights for account ${actId}:`,
            {
              status: err.response?.status || null,
              code: metaError?.code || null,
              subcode: metaError?.error_subcode || null,
              message: errorMessage
            }
          );

          return {
            actId,
            insights: [],
            error: errorMessage
          };
        }
      });

      const results = await Promise.all(fetchPromises);

      for (const { actId, insights } of results) {
        if (insights.length === 0) continue;
        for (const stat of insights) {
          const adId = stat.ad_id;
          if (adId) {
            if (!adMetrics[adId]) {
              adMetrics[adId] = emptyMetrics();
            }
            const metrics = adMetrics[adId];
            metrics.spend += parseFloat(stat.spend || '0');
            metrics.impressions += parseInt(stat.impressions || '0', 10);
            metrics.reach += parseInt(stat.reach || '0', 10);
            metrics.clicks += parseInt(stat.clicks || '0', 10);
            metrics.linkClicks += parseInt(stat.inline_link_clicks || '0', 10);

            let itemPurchases = 0;
            let itemPurchaseValue = 0;
            let itemAddToCart = 0;
            let itemInitiateCheckout = 0;
            if (stat.actions && Array.isArray(stat.actions)) {
              const purchaseAction = stat.actions.find((act: any) => 
                act.action_type === 'purchase' || 
                act.action_type === 'offsite_conversion.fb_pixel_purchase'
              );
              if (purchaseAction) {
                itemPurchases = parseInt(purchaseAction.value || '0', 10);
              }
              const addToCartAction = stat.actions.find((act: any) =>
                act.action_type === 'add_to_cart' ||
                act.action_type === 'offsite_conversion.fb_pixel_add_to_cart'
              );
              const checkoutAction = stat.actions.find((act: any) =>
                act.action_type === 'initiate_checkout' ||
                act.action_type === 'offsite_conversion.fb_pixel_initiate_checkout'
              );
              itemAddToCart = parseInt(addToCartAction?.value || '0', 10);
              itemInitiateCheckout = parseInt(checkoutAction?.value || '0', 10);
            }
            if (stat.action_values && Array.isArray(stat.action_values)) {
              const purchaseValAction = stat.action_values.find((act: any) => 
                act.action_type === 'purchase' || 
                act.action_type === 'offsite_conversion.fb_pixel_purchase'
              );
              if (purchaseValAction) {
                itemPurchaseValue = parseFloat(purchaseValAction.value || '0');
              }
            }

            metrics.purchases += itemPurchases;
            metrics.purchaseValue += itemPurchaseValue;
            metrics.addToCart += itemAddToCart;
            metrics.initiateCheckout += itemInitiateCheckout;

            const insightDate = String(stat.date_start || "").trim();

            if (adId && insightDate) {
              const relatedAd = ads.find(currentAd => currentAd.id === adId);

              try {
                await prisma.adPerformanceDaily.upsert({
                  where: {
                    adId_date: {
                      adId,
                      date: insightDate
                    }
                  },
                  update: {
                    accountId: cleanFbAccountId(actId),
                    creativeId: relatedAd?.creativeId || null,
                    spend: parseFloat(stat.spend || "0"),
                    impressions: parseInt(stat.impressions || "0", 10),
                    reach: parseInt(stat.reach || "0", 10),
                    clicks: parseInt(stat.clicks || "0", 10),
                    linkClicks: parseInt(stat.inline_link_clicks || "0", 10),
                    purchases: itemPurchases,
                    purchaseValue: itemPurchaseValue,
                    addToCart: itemAddToCart,
                    initiateCheckout: itemInitiateCheckout
                  },
                  create: {
                    date: insightDate,
                    accountId: cleanFbAccountId(actId),
                    adId,
                    creativeId: relatedAd?.creativeId || null,
                    spend: parseFloat(stat.spend || "0"),
                    impressions: parseInt(stat.impressions || "0", 10),
                    reach: parseInt(stat.reach || "0", 10),
                    clicks: parseInt(stat.clicks || "0", 10),
                    linkClicks: parseInt(stat.inline_link_clicks || "0", 10),
                    purchases: itemPurchases,
                    purchaseValue: itemPurchaseValue,
                    addToCart: itemAddToCart,
                    initiateCheckout: itemInitiateCheckout
                  }
                });
              } catch (databaseError: any) {
                console.error(
                  `[Material Controller] Failed to persist ad insight ${adId}/${insightDate}:`,
                  databaseError.message
                );
              }
            }
          }
        }
      }
    }

    if (ads.length > 0) {
      const fallbackStartDate = String(
        startDate ||
          new Date(Date.now() - 7 * 86400000)
            .toISOString()
            .slice(0, 10)
      );
      const fallbackEndDate = String(
        endDate || new Date().toISOString().slice(0, 10)
      );

      const storedMetrics = await prisma.adPerformanceDaily.findMany({
        where: {
          adId: { in: ads.map(ad => ad.id) },
          date: {
            gte: fallbackStartDate,
            lte: fallbackEndDate
          }
        }
      });

      const storedByAd: Record<
        string,
        ReturnType<typeof emptyMetrics>
      > = {};

      for (const row of storedMetrics) {
        if (!storedByAd[row.adId]) {
          storedByAd[row.adId] = emptyMetrics();
        }

        const target = storedByAd[row.adId];
        target.spend += Number(row.spend || 0);
        target.impressions += Number(row.impressions || 0);
        target.reach += Number(row.reach || 0);
        target.clicks += Number(row.clicks || 0);
        target.linkClicks += Number(row.linkClicks || 0);
        target.purchases += Number(row.purchases || 0);
        target.purchaseValue += Number(row.purchaseValue || 0);
        target.addToCart += Number(row.addToCart || 0);
        target.initiateCheckout += Number(row.initiateCheckout || 0);
      }

      for (const ad of ads) {
        const current = adMetrics[ad.id] || emptyMetrics();
        const stored = storedByAd[ad.id];
        const liveHasData =
          current.spend > 0 || current.impressions > 0;

        if (!liveHasData && stored) {
          adMetrics[ad.id] = stored;
        }
      }
    }

    // 5. 广告级指标只接受 Meta API 的 level=ad 返回值。
    // AdInsight 当前只有账户级数据，不能再将账户总量人工分摊到具体广告。

    // 6. 转换结果并组装，拼装创意素材和所属店铺
    const formattedData: any[] = [];
    
    for (const ad of ads) {
      const creative = ad.creative;
      
      // 过滤素材类型（前端顶部联动）
      if (materialType && materialType !== 'all') {
        const typeMatch = (creative?.type || creative?.mediaType || '').toLowerCase();
        if (materialType === 'image' && typeMatch !== 'image') continue;
        if (materialType === 'video' && typeMatch !== 'video') continue;
        if (materialType === 'carousel' && typeMatch !== 'carousel') continue;
      }

      const metrics = adMetrics[ad.id] || emptyMetrics();
      
      const totalSpend = Number(metrics.spend);
      const totalImpressions = Number(metrics.impressions);
      const totalClicks = Number(metrics.clicks);
      const totalPurchases = Number(metrics.purchases || 0);
      const totalPurchaseValue = Number(metrics.purchaseValue || 0);

      // 剔除无消耗 or 无曝光的广告，保护报表和渲染性能
      if (totalSpend <= 0 || totalImpressions <= 0) {
        continue;
      }

      const realSpend = totalSpend || 0;
      const realValue = totalPurchaseValue || 0;
      const roas = realSpend > 0 ? Number((realValue / realSpend).toFixed(2)) : 0.00;

      const cleanAdAccountId = cleanFbAccountId(ad.accountId);
      const currentMapping = validAccounts.find(a => cleanFbAccountId(a.fbAccountId) === cleanAdAccountId);
      const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;

      let rawMaterialName = creative?.name || ad.name || '未知广告名称';
      if (creative?.name) {
        let cleanedName = creative.name.trim();
        if (cleanedName.startsWith("Creative for ")) {
          cleanedName = cleanedName.substring("Creative for ".length).trim();
        }
        cleanedName = cleanedName.replace(/\s+\d{4}-\d{2}-\d{2}-[a-f0-9]+$/i, "");
        rawMaterialName = cleanedName || ad.name || '未知广告名称';
      }

      const calcStoreId = currentMapping?.storeId || ad.storeId || null;
      const finalLandingUrl = creative?.landingUrl || null;

      formattedData.push({
        creative_id: ad.id,               // 映射为 creative_id 以兼容前端字段结构，实为广告 ID
        real_creative_id: ad.creativeId,  // 备用
        material_name: rawMaterialName,
        material_type: creative?.type || creative?.mediaType || 'IMAGE',
        preview_url: creative?.previewUrl || creative?.imageUrl || null,
        landing_url: finalLandingUrl,
        storeId: calcStoreId,
        account_id: ad.accountId,
        spend: totalSpend.toFixed(2),
        impressions: totalImpressions,
        clicks: totalClicks,
        reach: Number(metrics.reach || 0),
        linkClicks: Number(metrics.linkClicks || 0),
        purchases: totalPurchases,
        purchaseValue: totalPurchaseValue,
        addToCart: Number(metrics.addToCart || 0),
        initiateCheckout: Number(metrics.initiateCheckout || 0),
        roas: roas,
        cpm: cpm.toFixed(2),
        pageId: creative?.pageId || null,
        pageName: creative?.pageName || null,
        effectivePostId: creative?.effectivePostId || null
      });
    }

    // 根据花费高低排序
    formattedData.sort((a, b) => Number(b.spend) - Number(a.spend));

    // 分页过滤
    const paginatedData = formattedData.slice(skip, skip + parsedPageSize);

    res.json({
      success: true,
      data: paginatedData,
      total: formattedData.length
    });

  } catch (error: any) {
    console.error('[数据联通报错]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}


export async function getMaterialTrend(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.json({ success: true, data: [] });
    }

    const { storeId, accountId, startDate, endDate, materialType } = req.query;

    // Account filtering logic
    const accountMappingWhere: any = {
      userId: Number(userId)
    };
    if (storeId && storeId !== 'all') {
      accountMappingWhere.storeId = Number(storeId);
    }
    if (accountId && String(accountId).trim() !== '' && accountId !== 'all') {
      const accList = String(accountId).split(',').map(id => id.trim()).filter(Boolean);
      if (accList.length > 0) {
        accountMappingWhere.fbAccountId = { in: accList.map(id => cleanFbAccountId(id)) };
      }
    }

    const validAccounts = await prisma.accountMapping.findMany({
      where: accountMappingWhere,
      select: { fbAccountId: true, storeId: true }
    });

    let allowedAccountIds = validAccounts.map(a => cleanFbAccountId(a.fbAccountId));

    if (allowedAccountIds.length === 0) {
      const userAccounts = await prisma.adAccount.findMany({
        where: { userId: Number(userId) },
        select: { fb_account_id: true }
      });
      allowedAccountIds = userAccounts.map(a => cleanFbAccountId(a.fb_account_id));
    }

    if (allowedAccountIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const startStr = String(startDate || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const endStr = String(endDate || new Date().toISOString().slice(0, 10));

    const globalToken = await getMetaToken(userId);

    const adAccounts = await prisma.adAccount.findMany({
      where: { fb_account_id: { in: allowedAccountIds } },
      select: { fb_account_id: true, fb_access_token: true }
    });
    const tokenMap = new Map();
    adAccounts.forEach(acc => {
      if (acc.fb_access_token) tokenMap.set(acc.fb_account_id, acc.fb_access_token);
    });

    const forceRefresh = req.query.force_refresh === 'true';
    const dailyMap: Record<string, any> = {};
    const trendAds = await prisma.ad.findMany({
      where: { accountId: { in: [...allowedAccountIds, ...allowedAccountIds.map(id => `act_${id}`)] } },
      include: { creative: true },
    });
    const allowedTrendAdIds = new Set(
      trendAds
        .filter((ad) => {
          if (!materialType || materialType === 'all') return true;
          const actualType = String(ad.creative?.type || ad.creative?.mediaType || '').toUpperCase();
          return actualType === String(materialType).toUpperCase();
        })
        .map(ad => ad.id),
    );

    const fetchPromises = allowedAccountIds.map(async (actId) => {
      const cleanActId = cleanFbAccountId(actId);
      const cacheKey = `MAT_TREND_${cleanActId}_${startStr}_${endStr}`;
      const cached = getCachedApi(cacheKey, forceRefresh);
      if (cached) return { actId, insights: cached, isApi: true };

      const useToken = tokenMap.get(cleanActId) || globalToken;
      if (!useToken) return { actId, insights: null, isApi: false };

      try {
        const url = `https://graph.facebook.com/v21.0/act_${cleanActId}/insights`;
        const apiData = await collapseRequest(cacheKey, async () => {
          const res = await callMetaApiWithRetry(
            url,
            {
              params: {
                level: 'ad',
                time_range: JSON.stringify({ since: startStr, until: endStr }),
                time_increment: 1,
                fields: 'ad_id,date_start,spend,impressions,reach,inline_link_clicks,clicks,actions,action_values',
                limit: 1000,
                access_token: useToken
              },
              timeout: 15000,
            },
            3
          );
          const fetched = res.data?.data || [];
          setCachedApi(cacheKey, fetched, 1800);
          return fetched;
        });

        return { actId, insights: apiData, isApi: true };
      } catch(e) {
        console.log(`[Trend] Fallback for ${cleanActId}`);
        return { actId, insights: null, isApi: false };
      }
    });

    const liveResults = await Promise.all(fetchPromises);

    liveResults.forEach(r => {
      if (!r.insights) return;
      for (const row of r.insights) {
        if (!row.ad_id || !allowedTrendAdIds.has(row.ad_id)) continue;
        const d = row.date_start;
        if (!dailyMap[d]) {
           dailyMap[d] = {
             date: d, spend: 0, impressions: 0, clicks: 0, link_clicks: 0, add_to_cart: 0, initiated_checkouts: 0, purchases: 0, purchaseValue: 0
           };
        }
        
        dailyMap[d].spend += parseFloat(row.spend || '0');
        dailyMap[d].impressions += parseInt(row.impressions || '0', 10);
        dailyMap[d].clicks += parseInt(row.clicks || '0', 10);
        dailyMap[d].link_clicks += parseInt(row.inline_link_clicks || '0', 10);

        let fbPurchases = 0; let fbPurchaseVal = 0; let fbAddToCart = 0; let fbIC = 0;
        if (row.actions && Array.isArray(row.actions)) {
          const p = row.actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
          if (p) fbPurchases = parseInt(p.value || '0', 10);
          const atc = row.actions.find((a: any) => a.action_type === 'add_to_cart');
          if (atc) fbAddToCart = parseInt(atc.value || '0', 10);
          const ic = row.actions.find((a: any) => a.action_type === 'initiate_checkout');
          if (ic) fbIC = parseInt(ic.value || '0', 10);
        }
        if (row.action_values && Array.isArray(row.action_values)) {
          const pv = row.action_values.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
          if (pv) fbPurchaseVal = parseFloat(pv.value || '0');
        }

        dailyMap[d].purchases += fbPurchases;
        dailyMap[d].purchaseValue += fbPurchaseVal;
        dailyMap[d].add_to_cart += fbAddToCart;
        dailyMap[d].initiated_checkouts += fbIC;
      }
    });

    let data = Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Fill missing dates
    const dateList = [];
    let currDto = new Date(startStr);
    const endDto = new Date(endStr);
    while(currDto <= endDto) {
      dateList.push(currDto.toISOString().split('T')[0]);
      currDto.setDate(currDto.getDate() + 1);
    }
    
    const finalData = dateList.map(date => {
       const existing = data.find(d => d.date === date);
       return existing || {
          date: date,
          spend: 0,
          impressions: 0,
          clicks: 0,
          link_clicks: 0,
          add_to_cart: 0,
          initiated_checkouts: 0,
          purchases: 0,
          purchaseValue: 0
       };
    });

    // 绘制 24 小时 x 7 天的真实地理位置热力图矩阵数据 (168个格子)
    const heatmapMatrix: number[][] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmapMatrix.push([hour, day, 0]);
      }
    }

    try {
      const ordersStart = new Date(startStr);
      const ordersEnd = new Date(`${endStr}T23:59:59.999Z`);
      let ordersForHeatmap = [];

      if (storeId && storeId !== 'all') {
        ordersForHeatmap = await prisma.order.findMany({
          where: {
            storeId: Number(storeId),
            createdAt: { gte: ordersStart, lte: ordersEnd }
          },
          select: { createdAt: true }
        });
      } else {
        const storeMappingIds = Array.from(new Set(validAccounts.map(a => a.storeId).filter(Boolean))) as number[];
        if (storeMappingIds.length > 0) {
          ordersForHeatmap = await prisma.order.findMany({
            where: {
              storeId: { in: storeMappingIds },
              createdAt: { gte: ordersStart, lte: ordersEnd }
            },
            select: { createdAt: true }
          });
        }
      }

      for (const order of ordersForHeatmap) {
         const date = new Date(order.createdAt);
         // JS getDay(): 0(Sun) -> 6(Sat). Frontend expects category [日,一,二,三,四,五,六] -> [0,1,2,3,4,5,6]
         // Actually, wait, frontend has days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
         // User JS date.getDay(): 0=Sun, 1=Mon, 2=Tue...
         // To map to frontend index: 1(Mon)->0, 2(Tue)->1 ... 0(Sun)->6
         const jsDay = date.getDay();
         const mappedDay = jsDay === 0 ? 6 : jsDay - 1;
         const hour = date.getHours();
         
         const matrixItem = heatmapMatrix.find(item => item[0] === hour && item[1] === mappedDay);
         if (matrixItem) {
           matrixItem[2] += 1;
         }
      }
    } catch (e) {
      // 降级兜底：全零
      console.warn('[MaterialTrend] Heatmap orders aggregation failed:', e);
    }

    return res.json({ success: true, data: finalData, heatmapData: heatmapMatrix });
  } catch (error: any) {
    console.error("[MaterialTrend] Error:", error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
