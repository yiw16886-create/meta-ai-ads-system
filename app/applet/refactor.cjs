import fs from 'fs';
import path from 'path';

const serverFile = path.resolve('api/server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

// We will use regex to extract the blocks. 
// A helper to pull out a block by matching its start and matching braces.
function extractBlock(startRegex) {
  const match = startRegex.exec(content);
  if (!match) return null;
  
  let startIndex = match.index;
  let i = startIndex + match[0].length;
  let openBraces = 1; // Assuming the match ends with `{` or we start counting from the first `{`
  
  // Find the first opening brace if not already passed
  while(content[i] !== '{' && i < content.length) {
    i++;
  }
  openBraces = 1;
  i++; // move past `{`

  while(openBraces > 0 && i < content.length) {
    if(content[i] === '{') openBraces++;
    if(content[i] === '}') openBraces--;
    i++;
  }
  
  // Also include `});` if present (like in express handlers)
  if(content.substring(i, i+2) === ');') {
    i += 2;
  }
  
  const block = content.substring(startIndex, i);
  content = content.substring(0, startIndex) + content.substring(i);
  return block;
}

const routes = {
  accounts: [/app\.get\("\/api\/accounts",/, /app\.get\("\/api\/accounts\/:accountId\/details",/, /app\.get\("\/api\/accounts\/:accountId\/audience-insights",/, /app\.get\("\/api\/accounts\/:accountId\/hierarchy",/, /app\.get\("\/api\/accounts\/list",/],
  sync: [/app\.post\("\/api\/sync",/, /app\.post\("\/api\/sync-store",/, /app\.post\("\/api\/sync-creatives",/],
  insights: [/app\.get\("\/api\/insights",/],
  settings: [/app\.get\("\/api\/settings",/, /app\.post\("\/api\/settings",/],
  mappings: [/app\.get\("\/api\/mappings",/, /app\.post\("\/api\/mappings\/batch",/],
  monitoring: [/app\.get\("\/api\/monitoring\/accounts",/, /app\.post\("\/api\/monitoring\/accounts\/:accountId\/reset",/],
  cron: [/app\.get\("\/api\/cron\/sync-monthly",/]
};

const routeCodes = {};

for (const [name, regexes] of Object.entries(routes)) {
  routeCodes[name] = [];
  for (const regex of regexes) {
    let block = extractBlock(regex);
    if (block) {
      // replace /api/xxx with /xxx or / depending on the route mount point
      // for example, /api/accounts/:accountId/details -> /:accountId/details
      let prefix = \`/api/\${name === 'cron' ? 'cron/sync-monthly' : name}\`;
      if (name === 'sync') prefix = '/api/sync'; 
      // We will handle the string replace after, but maybe simpler to just replace "/api/"
      // actually, a simple regex for the first arg of app.xxx
      
      routeCodes[name].push(block);
    }
  }
}

// Ensure the routes dir exists
if(!fs.existsSync('api/routes')) fs.mkdirSync('api/routes');

for (const [name, blocks] of Object.entries(routeCodes)) {
  let fileContent = \`import { Router } from "express";
import prisma from "../db.js";
import axios from "axios";
import { format, subDays } from "date-fns";
// import specific helpers if needed

const router = Router();

\`;

  for (let block of blocks) {
    // replace `app.get("/api/accounts/list"` -> `router.get("/list"`
    let basePrefix = \`/api/\${name}\`;
    if(name === 'sync') basePrefix = '/api/sync';
    if(name === 'cron') basePrefix = '/api/cron';
    
    // Quick and dirty replace for the route path
    block = block.replace(/(app\.(get|post|put|delete))\("(\/api\/[\w-]*)(.*?)"/g, (match, p1, p2, p3, p4) => {
      let newPath = p4 || "/";
      if (!newPath.startsWith("/")) newPath = "/" + newPath;
      if (p3 === '/api/sync' && name === 'sync') {
          // special fix for sync
          if (newPath === '/') newPath = '/';
      }
      return \`router.\${p2}("\${newPath}"\`;
    });
    
    fileContent += block + "\\n\\n";
  }
  
  fileContent += "export default router;\\n";
  fs.writeFileSync(\`api/routes/\${name}.routes.ts\`, fileContent);
}

// Also write updated server.ts
fs.writeFileSync(serverFile, content);
console.log("Refactoring complete");
