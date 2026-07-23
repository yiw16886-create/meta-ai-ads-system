const fs = require('fs');
let content = fs.readFileSync('src/components/StoresDashboard.tsx', 'utf8');

content = content.replace(
  /onClick=\{\(\) => navigate\(\`\/store\/\$\{store\.id\}\?from=\$\{format\(startDate, "yyyy-MM-dd"\)\}\&to=\$\{format\(endDate, "yyyy-MM-dd"\)\}\`\)\}/g,
  'onClick={() => navigate(`/store/${store.id}?from=${format(startDate || new Date(), "yyyy-MM-dd")}&to=${format(endDate || new Date(), "yyyy-MM-dd")}`)}'
);

fs.writeFileSync('src/components/StoresDashboard.tsx', content);
