const fs = require('fs');

let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regex = /navigate\("(\/\?tab=[^"]+)"\)/g;
content = content.replace(regex, (match, p1) => {
  return `navigate(\`${p1}&from=\${format(startDate, "yyyy-MM-dd")}&to=\${format(endDate, "yyyy-MM-dd")}\`)`;
});

const regex2 = /navigate\(\`(\/\?tab=\$\{item\.id\})\`\)/g;
content = content.replace(regex2, (match, p1) => {
  return `navigate(\`${p1}&from=\${format(startDate, "yyyy-MM-dd")}&to=\${format(endDate, "yyyy-MM-dd")}\`)`;
});

const regex3 = /navigate\(\`(\/\?tab=overview)\`\)/g;
content = content.replace(regex3, (match, p1) => {
  return `navigate(\`${p1}&from=\${format(startDate, "yyyy-MM-dd")}&to=\${format(endDate, "yyyy-MM-dd")}\`)`;
});


fs.writeFileSync('src/components/Dashboard.tsx', content);
