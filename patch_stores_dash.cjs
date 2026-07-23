const fs = require('fs');
let content = fs.readFileSync('src/components/StoresDashboard.tsx', 'utf8');

content = content.replace(
  /onClick=\{\(\) => navigate\(\`\/store\/\$\{store\.id\}\`\)\}/g,
  'onClick={() => navigate(`/store/${store.id}?from=${format(startDate, "yyyy-MM-dd")}&to=${format(endDate, "yyyy-MM-dd")}`)}'
);

// We need to import format from date-fns if not already imported
if (!content.includes('format(') && content.includes('import {')) {
  // Let's just use `startDate` and `endDate` from props.
}

fs.writeFileSync('src/components/StoresDashboard.tsx', content);
