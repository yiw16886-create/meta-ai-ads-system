import fs from 'fs';
import path from 'path';

function addJsToImports(fileOrDir) {
  if (!fs.existsSync(fileOrDir)) return;
  const stat = fs.statSync(fileOrDir);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(fileOrDir);
    for (const f of files) {
      addJsToImports(path.join(fileOrDir, f));
    }
  } else if (fileOrDir.endsWith('.ts')) {
    let content = fs.readFileSync(fileOrDir, 'utf8');
    
    // Regex to add .js to relative imports if not present.
    let newContent = content.replace(/(from\s+['"]\.[^'"]*?)(?<!\.js)(?<!\.json)(?<!\.ts)(?<!\.tsx)(['"])/g, '$1.js$2');
    newContent = newContent.replace(/(import\s+['"]\.[^'"]*?)(?<!\.js)(?<!\.json)(?<!\.ts)(?<!\.tsx)(['"])/g, '$1.js$2');

    if (content !== newContent) {
      fs.writeFileSync(fileOrDir, newContent);
      console.log('Modified:', fileOrDir);
    }
  }
}

addJsToImports('./api');
addJsToImports('./server');
addJsToImports('./db');
