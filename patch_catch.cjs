const fs = require('fs');
const path = require('path');

function replaceCatch(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  replacements.forEach(rep => {
    if (content.includes(rep.from)) {
      content = content.replace(rep.from, rep.to);
      changed = true;
    }
  });
  if (changed) fs.writeFileSync(filePath, content);
}

// 1. insights.routes.ts
replaceCatch('server/routes/insights.routes.ts', [
  {
    from: 'res\n      .status(500)\n      .json({ error: "Failed to fetch data", details: error?.message });',
    to: 'res.json([]);'
  }
]);

// 2. stores.routes.ts
replaceCatch('server/routes/stores.routes.ts', [
  {
    from: 'res\n      .status(500)\n      .json({\n        error: "Failed to fetch store summaries",\n        details: error.message,\n      });',
    to: 'res.json({});'
  },
  {
    from: 'res\n      .status(500)\n      .json({ error: "Failed to fetch store dashboard data", details: error.message });',
    to: 'res.json({\n      summary: { totalSpend: 0, totalROAS: 0, totalSales: 0, totalOrders: 0, totalVisitors: 0, avgConversionRate: 0 },\n      shopline: { isConfigured: false, error: null, errorMessage: "" }\n    });'
  }
]);

// 3. bms.routes.ts
replaceCatch('server/routes/bms.routes.ts', [
  {
    from: 'return res.status(500).json({ error: "获取 BM 列表失败", details: error.message });',
    to: 'return res.json([]);'
  },
  {
    from: 'return res.status(500).json({ error: "调用 Meta API 获取 BM 列表失败", details: fbErrMsg });',
    to: 'return res.json({ success: false, bms: [] });'
  }
]);

