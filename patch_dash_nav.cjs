const fs = require('fs');

let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

content = content.replace(
  /onClick=\{\(\) => navigate\(\`\/account\/\$\{item\.accountId\}\`\)\}/g,
  'onClick={() => navigate(`/account/${item.accountId}?from=${format(startDate, "yyyy-MM-dd")}&to=${format(endDate, "yyyy-MM-dd")}`)}'
);

content = content.replace(
  /onClick=\{\(\) => navigate\(\`\/store\/\$\{encodeURIComponent\(item\.store\)\}\`\)\}/g,
  'onClick={() => navigate(`/store/${encodeURIComponent(item.store)}?from=${format(startDate, "yyyy-MM-dd")}&to=${format(endDate, "yyyy-MM-dd")}`)}'
);

fs.writeFileSync('src/components/Dashboard.tsx', content);
