import prisma from '../../db/index';

export async function getCreativeIntelligence(startDate: string, endDate: string, storeIdOrName?: string) {
  let targetStoreIds: number[] = [];

  if (storeIdOrName && storeIdOrName !== 'all') {
    // Try to find by ID or Name
    const isNum = !isNaN(Number(storeIdOrName));
    const store = await prisma.store.findFirst({
      where: isNum 
        ? { id: Number(storeIdOrName) } 
        : { name: { equals: storeIdOrName, mode: 'insensitive' } }
    });
    if (store) {
      targetStoreIds.push(store.id);
    }
  }

  // 1. Fetch fbAccountIds from AccountMapping
  const mappingsWhere = targetStoreIds.length > 0 ? { storeId: { in: targetStoreIds } } : {};
  const mappings = await prisma.accountMapping.findMany({
    where: mappingsWhere,
    select: { fbAccountId: true, storeId: true }
  });
  const fbAccountIds = mappings.map(m => m.fbAccountId);

  // 2. Resolve creativeIds from AdCreative
  const creatives = await prisma.adCreative.findMany({
    where: fbAccountIds.length > 0 ? { fbAccountId: { in: fbAccountIds } } : {},
    select: { creativeId: true, name: true, type: true, imageUrl: true, storeId: true }
  });
  const creativeIds = creatives.map(c => c.creativeId);

  // Build a lookup map for static metadata
  const creativeMetadata = new Map(creatives.map(c => [
    c.creativeId, 
    { 
      id: c.creativeId, 
      storeId: c.storeId, 
      creativeName: c.name || `Creative ${c.creativeId}`, 
      type: c.type || 'IMAGE',
      imageUrl: c.imageUrl
    }
  ]));

  // 3. Query CreativePerformanceDaily with database groupBy
  const performanceSums = await prisma.creativePerformanceDaily.groupBy({
    by: ['creativeId'],
    where: {
      creativeId: { in: creativeIds },
      date: { gte: startDate, lte: endDate }
    },
    _sum: {
      spend: true,
      impressions: true,
      clicks: true,
      revenue: true,
      purchases: true
    }
  });

  // Calculate the four core metrics and construct the final payload
  const results = performanceSums.map(group => {
    const meta = creativeMetadata.get(group.creativeId);
    if (!meta) return null;

    const spend = group._sum.spend || 0;
    const revenue = group._sum.revenue || 0;
    const impressions = group._sum.impressions || 0;
    const clicks = group._sum.clicks || 0;
    const purchases = Number(group._sum.purchases || 0);

    const roas = spend > 0 ? revenue / spend : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;

    return {
      ...meta,
      spend,
      revenue,
      roas,
      ctr,
      clicks,
      impressions,
      purchases,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      frequency: 1.0, // Default base frequency representing unique level view
      hookRate: ctr * 100 // Example representative hook rate based on CTR percentage
    };
  }).filter(Boolean);

  return results;
}
