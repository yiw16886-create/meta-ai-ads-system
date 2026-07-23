const fs = require('fs');
let content = fs.readFileSync('server/routes/bms.routes.ts', 'utf8');
content = content.replace(/return res\.status\(500\)\.json\(\{ error: "获取资产列表失败", details: error\.message \}\);/, 'return res.json({ pixels: [], pages: [], adAccounts: [] });');
fs.writeFileSync('server/routes/bms.routes.ts', content);
