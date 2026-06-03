import fs from 'fs';
import path from 'path';

const file = path.resolve('api/server.ts');
let content = fs.readFileSync(file, 'utf8');

// remove sendInvitationEmail function
content = content.replace(/async function getSmtpConfig[\s\S]*?from: configMap\.SMTP_FROM \|\| configMap\.SMTP_USER\s*};\s*}\s*/, '');
content = content.replace(/async function sendInvitationEmail[\s\S]*?return { success: false, error: err\.message, recommendation: errorRecommend };\s*}\s*}\s*/, '');

// remove auth and user routes
content = content.replace(/app\.post\("\/api\/auth\/login"[\s\S]*?app\.delete\("\/api\/users\/:id"[\s\S]*?res\.status\(500\)\.json\({ success: false, error: "删除用户失败系统异常" }\);\s*}\s*}\);\s*/, '');

// Add router imports and setup
const importStatement = `import routes from "./routes/index.js";\n`;

if (!content.includes('import routes from')) {
    // try to put it around other imports
    content = content.replace(/(import .*?\n)(?=\s*const app = express\(\);)/, `$1${importStatement}`);
}

if (!content.includes('app.use("/api", routes)')) {
    content = content.replace(/(const app = express\(\);\s*)/, `$1app.use("/api", routes);\n`);
}

fs.writeFileSync(file, content);
console.log('Modified server.ts successfully');
