import fs from 'fs';
import path from 'path';

const file = path.resolve('api/server.ts');
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ --- NEW STORE & AD ACCOUNT ENDPOINTS ---[\s\S]*?\/\/ --- END STORE ENDPOINTS ---/m;
content = content.replace(regex, '');

fs.writeFileSync(file, content);
console.log('Modified server.ts successfully');
