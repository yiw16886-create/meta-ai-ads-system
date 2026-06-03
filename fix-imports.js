import fs from 'fs';
import path from 'path';

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixImports(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/from "(.*)\.js"/g, 'from "$1.js"'); // just to check
      // Wait, let's just do replace /from "([^"]+)\.js"/g with from "$1.js" ? NO, from "$1"
      content = content.replace(/from "([^"]+)\.js"/g, 'from "$1"');
      fs.writeFileSync(fullPath, content);
    }
  }
}

fixImports('./server');
fixImports('./api');
fixImports('./src');

// Also fix test scripts
const rootFiles = ['test-agg.ts', 'test-query.ts', 'test-shopline.ts', 'sync_test.ts'];
for (const file of rootFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/from "([^"]+)\.js"/g, 'from "$1"');
    fs.writeFileSync(file, content);
  }
}
