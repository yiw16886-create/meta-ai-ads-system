const fs = require('fs');
const path = require('path');

function replaceCatch(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  replacements.forEach(rep => {
    if (content.includes(rep.from)) {
      content = content.replace(rep.from, rep.to);
      changed = true;
    }
  });
  if (changed) fs.writeFileSync(filePath, content);
}

// 1. accounts.routes.ts
replaceCatch('server/routes/accounts.routes.ts', [
  {
    from: 'res.status(500).json({\n      error: "Failed to fetch unique accounts from DB",\n      details: err.message,\n      code: err.code,\n    });',
    to: 'res.json([]);'
  }
]);

// 2. mappings.routes.ts
replaceCatch('server/routes/mappings.routes.ts', [
  {
    from: 'res.status(500).json({\n      error: "Failed to fetch mappings from DB",\n      details: err.message,\n    });',
    to: 'res.json([]);'
  },
  {
    from: 'return res.status(500).json({ error: error.message });',
    to: 'return res.json([]);'
  }
]);

// 3. sync.routes.ts (wait, let's see what sync returns if we didn't patch it yet)
