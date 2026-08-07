import prisma from '../../db/index.js';

export async function aggregateData(startDate: string, endDate: string, options: { syncProduct?: boolean; syncCreative?: boolean } = { syncProduct: false, syncCreative: false }, storeIdentifier?: string) {
  try {
    console.log(`[Aggregation Service] Starting aggregation for date range ${startDate} to ${endDate}. Options:`, options);
    let stores;
    if (storeIdentifier) {
      const isNumeric = !isNaN(parseInt(storeIdentifier, 10)) && /^\d+$/.test(storeIdentifier);
      if (isNumeric) {
        stores = await prisma.store.findMany({ where: { id: parseInt(storeIdentifier, 10) } });
      } else {
        stores = await prisma.store.findMany({ where: { name: { equals: storeIdentifier, mode: 'insensitive' } } });
      }
    } else {
      stores = await prisma.store.findMany();
    }
    console.log(`[Aggregation Service] Found ${stores.length} stores to process`);

    for (const store of stores) {
      console.log(`[Aggregation Service] Processing store ${store.id} (${store.name})`);
      
      // 1. Process Product Intelligence
      if (options.syncProduct) {
        const products = await prisma.product.findMany({ where: { storeId: store.id } });
        console.log(`[Aggregation Service] Found ${products.length} products for store ${store.id}`);
        
        let productAggSuccess = 0;
        for (const product of products) {
          try {
            // Find orders for this product in date range
            const orders = await prisma.order.findMany({
              where: {
                storeId: store.id,
                productId: product.id,
                createdAt: {
                  gte: new Date(startDate),
                  lte: new Date(endDate + 'T23:59:59.999Z')
                }
              }
            });

            const revenue = orders.reduce((sum, o) => sum + o.revenue, 0);
            const profit = orders.reduce((sum, o) => sum + o.profit, 0);
            const refunds = orders.filter(o => o.refunded).length;
            const totalOrders = orders.length;

            // Find ad insights.
            const ads = await prisma.adInsight.findMany({
              where: {
                date: { gte: startDate, lte: endDate },
                accountName: { contains: store.name } // A rough proxy for store's ad insights
              }
            });

            const storeSpend = ads.reduce((sum, ad) => sum + (ad.spend || 0), 0);
            const adSpend = products.length > 0 ? storeSpend / products.length : 0; 
            
            await prisma.productPerformanceDaily.upsert({
              where: {
                storeId_productId_date: {
                  storeId: store.id,
                  productId: product.id,
                  date: endDate // Using endDate as the aggregation reference date
                }
              },
              update: {
                revenue,
                orders: totalOrders,
                profit,
                refundRate: totalOrders > 0 ? ((refunds / totalOrders) * 100) : 0,
                adSpend,
                productName: product.name,
                sku: product.sku,
                category: product.category,
                inventory: product.inventory,
              },
              create: {
                storeId: store.id,
                productId: product.id,
                date: endDate,
                revenue,
                orders: totalOrders,
                profit,
                refundRate: totalOrders > 0 ? ((refunds / totalOrders) * 100) : 0,
                adSpend,
                productName: product.name,
                sku: product.sku,
                category: product.category,
                inventory: product.inventory,
                ctr: 0, cpc: 0, cpm: 0, frequency: 0, productRoas: adSpend > 0 ? revenue / adSpend : 0, profitRoas: adSpend > 0 ? profit / adSpend : 0
              }
            });
            productAggSuccess++;
          } catch (pErr) {
            console.error(`[Aggregation Service] Prisma error aggregating product ${product.id} for store ${store.id}:`, pErr);
          }
        }
        console.log(`[Aggregation Service] Successfully aggregated ${productAggSuccess} products for store ${store.id}`);
      } else {
        console.log(`[Aggregation Service] Skipping Product Intelligence for store ${store.id} as it is not enabled.`);
      }

      // 2. Process Creative Intelligence — 基于 AdCreative + AdPerformanceDaily 聚合
      if (options.syncCreative) {
        console.log(`[Aggregation Service] Processing Creative Intelligence for store ${store.id}...`);
        
        try {
          // 2a. 获取该店铺关联的所有广告账户
          const accountMappings = await prisma.accountMapping.findMany({
            where: { storeId: store.id, status: "ACTIVE" },
            select: { fbAccountId: true },
          });
          const accountIds = accountMappings.map(m => m.fbAccountId);
          
          if (accountIds.length === 0) {
            console.log(`[Aggregation Service] No active accounts for store ${store.id}, skipping creative aggregation`);
            continue;
          }

          // 2b. 获取时间范围内的创意素材
          const creatives = await prisma.adCreative.findMany({
            where: {
              fbAccountId: { in: accountIds },
            },
            include: {
              ads: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

          console.log(`[Aggregation Service] Found ${creatives.length} creatives for store ${store.id}`);

          let creativeAggSuccess = 0;
          for (const creative of creatives) {
            try {
              // 2c. 获取该创意的广告表现数据
              const adIds = creative.ads.map(a => a.id);
              const performances = await prisma.adPerformanceDaily.findMany({
                where: {
                  adId: { in: adIds },
                  date: { gte: startDate, lte: endDate },
                },
              });

              const totalSpend = performances.reduce((s, p) => s + p.spend, 0);
              const totalImpressions = performances.reduce((s, p) => s + p.impressions, 0);
              const totalClicks = performances.reduce((s, p) => s + p.clicks, 0);
              const totalPurchases = performances.reduce((s, p) => s + p.purchases, 0);
              const totalRevenue = performances.reduce((s, p) => s + p.purchaseValue, 0);

              // 计算素材效果指标
              const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
              const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
              const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

              // 素材疲劳度：如果平均展示频率 > 4.0 标记为疲劳
              const avgFrequency = performances.length > 0
                ? performances.reduce((s, p) => s + (p.reach > 0 ? p.impressions / p.reach : 0), 0) / performances.length
                : 0;

              // 更新创意素材的效果指标（写入 AdCreative 的现有字段）
              await prisma.adCreative.update({
                where: { creativeId: creative.creativeId },
                data: {
                  hookRate: Math.round(ctr * 100) / 100,
                },
              });

              creativeAggSuccess++;
            } catch (cErr) {
              console.error(`[Aggregation Service] Error aggregating creative ${creative.creativeId}:`, cErr);
            }
          }
          
          console.log(`[Aggregation Service] Successfully aggregated ${creativeAggSuccess} creatives for store ${store.id}`);
        } catch (storeErr) {
          console.error(`[Aggregation Service] Error processing creative intelligence for store ${store.id}:`, storeErr);
        }
      } else {
        console.log(`[Aggregation Service] Skipping Creative Intelligence for store ${store.id} as it is not enabled.`);
      }
    }
    console.log(`[Aggregation Service] Aggregation completely finished for ${startDate} to ${endDate}`);
    return { success: true };
  } catch (error) {
    console.error(`[Aggregation Service] CRITICAL ERROR during aggregation:`, error);
    throw error;
  }
}
