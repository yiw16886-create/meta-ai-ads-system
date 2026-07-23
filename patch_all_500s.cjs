const fs = require('fs');

function replaceAll500s(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/res\.status\(500\)\.json\(\{([^}]*)\}\)/g, 'res.json({$1})');
  fs.writeFileSync(file, content);
}

['server/routes/insights.routes.ts', 'server/routes/stores.routes.ts', 'server/routes/bms.routes.ts', 'server/routes/sync.routes.ts', 'server/routes/monitoring.routes.ts', 'server/routes/intelligence.routes.ts', 'server/routes/pageManage.routes.ts', 'server/routes/settings.routes.ts', 'server/routes/mappings.routes.ts'].forEach(replaceAll500s);
