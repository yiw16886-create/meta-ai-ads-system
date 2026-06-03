import fs from 'fs';
const files = ['server/services/product-intelligence.service.ts', 'server/services/creative-intelligence.service.ts', 'server/services/aggregation.service.ts', 'api/index.ts', 'test-query.ts', 'test-shopline.ts'];
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/\.js'/g, "'");
    fs.writeFileSync(f, content);
});
