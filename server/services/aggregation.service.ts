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

      // 2. Process Creative Intelligence
      if (options.syncCreative) {
        console.log(`[Aggregation Service] Skipping Creative Intelligence aggregation because CreativePerformanceDaily has been removed for re-development.`);
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
