import prisma from '../db.js';

export async function getCreativeIntelligence(startDate: string, endDate: string) {
  const data = await prisma.creativePerformanceDaily.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const grouped = data.reduce((acc, curr) => {
    const key = curr.creativeId;
    if (!acc[key]) {
      acc[key] = {
        id: curr.creativeId,
        storeId: curr.storeId,
        creativeName: curr.creativeName,
        type: curr.type,
        spend: 0,
        purchases: 0,
        revenue: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        hookRate: 0,
        aiRiskStatus: curr.aiRiskStatus || "SAFE",
        trendStatus: curr.trendStatus || "STABLE",
        aiSuggestion: curr.aiSuggestion || "",
        _count: 0
      };
    }
    
    acc[key].spend += curr.spend;
    acc[key].purchases += curr.purchases;
    acc[key].revenue += curr.revenue;
    
    // Average
    acc[key].ctr += curr.ctr;
    acc[key].cpc += curr.cpc;
    acc[key].cpm += curr.cpm;
    acc[key].frequency += curr.frequency;
    acc[key].hookRate += curr.hookRate;
    acc[key]._count += 1;
    
    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped).map((item: any) => {
    if (item._count > 0) {
      item.ctr /= item._count;
      item.cpc /= item._count;
      item.cpm /= item._count;
      item.frequency /= item._count;
      item.hookRate /= item._count;
    }
    item.roas = item.spend > 0 ? item.revenue / item.spend : 0;
    delete item._count;
    return item;
  });
}
