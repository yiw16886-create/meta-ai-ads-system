import fs from 'fs';
import path from 'path';

const serverFile = path.resolve('api/server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

function extract(searchStringStart) {
  let startIndex = content.indexOf(searchStringStart);
  if (startIndex === -1) return '';
  let i = startIndex;
  while(content[i] !== '{' && i < content.length) i++;
  let open = 1; i++;
  while(open > 0 && i < content.length) {
    if(content[i]==='{') open++;
    if(content[i]==='}') open--;
    i++;
  }
  if(content.substring(i, i+2) === ');') i += 2;
  const block = content.substring(startIndex, i);
  content = content.substring(0, startIndex) + content.substring(i);
  return block;
}

const accountsBlocks = [
  extract('app.get("/api/accounts"'),
  extract('app.get("/api/accounts/:accountId/details"'),
  extract('app.get("/api/accounts/:accountId/audience-insights"'),
  extract('app.get("/api/accounts/:accountId/hierarchy"'),
  extract('app.get("/api/accounts/list"')
];

fs.writeFileSync('api/routes/accounts.routes.ts', 'import { Router } from "express";\\nimport prisma from "../db.js";\\nimport axios from "axios";\\nimport { getMetaToken, extractMetaError, evaluateActivityStatus } from "../utils.js";\\n\\nconst router = Router();\\n\\n' + accountsBlocks.join('\\n\\n').replace(/app\.(get|post|put|delete)\("\/api\/accounts/g, 'router.$1("') + '\\n\\nexport default router;');

fs.writeFileSync('api/server.ts', content);
console.log('done accounts');
