import prisma from '../../db/index';

export async function getProductIntelligence(startDate: string, endDate: string) {
  // Logic to fetch from ProductPerformanceDaily (aggregating across dates)
  const data = await prisma.productPerformanceDaily.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  // Since we might have multiple days, we should group by product
  const grouped = data.reduce((acc, curr) => {
    const key = curr.productId;
    if (!acc[key]) {
      acc[key] = {
        id: curr.productId,
        storeId: curr.storeId,
        productName: curr.productName,
        sku: curr.sku,
        category: curr.category,
        revenue: 0,
        orders: 0,
        profit: 0,
        adSpend: 0,
        productRoas: 0,
        profitRoas: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        refundRate: 0,
        inventory: curr.inventory,
        topRegion: curr.topRegion,
        topCampaign: curr.topCampaign,
        topCreative: curr.topCreative,
        aiRiskStatus: curr.aiRiskStatus || "SAFE",
        trendStatus: curr.trendStatus || "STABLE",
        aiSuggestion: curr.aiSuggestion || "",
        _count: 0
      };
    }
    
    acc[key].revenue += curr.revenue;
    acc[key].orders += curr.orders;
    acc[key].profit += curr.profit;
    acc[key].adSpend += curr.adSpend;
    
    // Average metrics
    acc[key].ctr += curr.ctr;
    acc[key].cpc += curr.cpc;
    acc[key].cpm += curr.cpm;
    acc[key].frequency += curr.frequency;
    acc[key].refundRate += curr.refundRate;
    acc[key]._count += 1;
    
    return acc;
  }, {} as Record<string, any>);
  
  const result = Object.values(grouped).map((item: any) => {
    if (item._count > 0) {
      item.ctr /= item._count;
      item.cpc /= item._count;
      item.cpm /= item._count;
      item.frequency /= item._count;
      item.refundRate /= item._count;
    }
    item.productRoas = item.adSpend > 0 ? item.revenue / item.adSpend : 0;
    item.profitRoas = item.adSpend > 0 ? item.profit / item.adSpend : 0;
    delete item._count;
    return item;
  });

  // Sort by revenue descending and return top 20
  return result.sort((a, b) => b.revenue - a.revenue).slice(0, 20);
}
