import fs from 'fs';
import path from 'path';

function fixPrisma(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if(fs.statSync(full).isDirectory()) fixPrisma(full);
    else if(f.endsWith('.ts')) {
      let c = fs.readFileSync(full, 'utf8');
      c = c.replace(/\.\.\/db\.js/g, '../../db/index.js');
      fs.writeFileSync(full, c);
    }
  }
}
fixPrisma('./server/routes');
fixPrisma('./server/services');
let rootC = fs.readFileSync('./server/server.ts', 'utf8');
rootC = rootC.replace(/\.\/db/g, '../db/index.js').replace(/\.\/db\/index\.js\.js/g, '../db/index.js');
fs.writeFileSync('./server/server.ts', rootC);
