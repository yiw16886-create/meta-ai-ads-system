import fs from 'fs';
import path from 'path';

const file = path.resolve('api/server.ts');
let content = fs.readFileSync(file, 'utf8');

// match sendInvitationEmail and remove it
content = content.replace(/async function sendInvitationEmail[\s\S]*?return { success: false, error: err\.message, recommendation: errorRecommend };\s*}\s*/, '');

fs.writeFileSync(file, content);
console.log('Modified server.ts successfully');
