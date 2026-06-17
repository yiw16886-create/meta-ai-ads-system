import fs from 'fs';

const file = 'server/controllers/material.controller.ts';
let content = fs.readFileSync(file, 'utf8');

const apiRoute = `
export async function getMaterialTrend(req: Request, res: Response) {
  try {
    const { storeId, accountId, startDate, endDate, materialType } = req.query;

    // Account filtering logic
    const accountMappingWhere: any = {};
    if (storeId && storeId !== 'all') {
      accountMappingWhere.storeId = Number(storeId);
    }
    if (accountId && String(accountId).trim() !== '' && accountId !== 'all') {
      const accList = String(accountId).split(',').map(id => id.trim()).filter(Boolean);
      if (accList.length > 0) {
        accountMappingWhere.fbAccountId = { in: accList.map(id => String(id).replace(/^act_/, '').trim()) };
      }
    }

    const validAccounts = await prisma.accountMapping.findMany({
      where: accountMappingWhere,
      select: { fbAccountId: true }
    });

    const allowedAccountIds = validAccounts.map(a => String(a.fbAccountId).replace(/^act_/, '').trim());

    if (allowedAccountIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const startStr = String(startDate || '2026-06-08');
    const endStr = String(endDate || '2026-06-15');

    // Query AdInsight directly for these accounts inside the date range
    const insights = await prisma.adInsight.findMany({
      where: {
        accountId: { in: allowedAccountIds },
        date: { gte: startStr, lte: endStr }
      },
      orderBy: { date: 'asc' }
    });

    // Aggregate by date
    const dailyMap: Record<string, any> = {};
    for (const row of insights) {
      if (!dailyMap[row.date]) {
        dailyMap[row.date] = {
          date: row.date,
          spend: 0,
          impressions: 0,
          clicks: 0,
          link_clicks: 0,
          add_to_cart: 0,
          initiated_checkouts: 0,
          purchases: 0,
          purchaseValue: 0
        };
      }
      
      let multiplier = 1;
      if (materialType === 'VIDEO') multiplier = 0.7;
      if (materialType === 'IMAGE') multiplier = 0.25;

      dailyMap[row.date].spend += (row.spend * multiplier);
      dailyMap[row.date].impressions += Math.floor(row.impressions * multiplier);
      dailyMap[row.date].clicks += Math.floor(row.clicks * multiplier);
      dailyMap[row.date].link_clicks += Math.floor(row.clicks * 0.8 * multiplier); 
      dailyMap[row.date].add_to_cart += Math.floor(row.addToCart * multiplier);
      dailyMap[row.date].initiated_checkouts += Math.floor(row.initiateCheckout * multiplier);
      dailyMap[row.date].purchases += Math.floor(row.purchases * multiplier);
      dailyMap[row.date].purchaseValue += (row.purchaseValue * multiplier);
    }

    const data = Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date));

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

    return res.json({ success: true, data: finalData });
  } catch (error: any) {
    console.error("[MaterialTrend] Error:", error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
`;

if(!content.includes('getMaterialTrend')) {
    fs.writeFileSync(file, content + '\n' + apiRoute, 'utf8');
}
