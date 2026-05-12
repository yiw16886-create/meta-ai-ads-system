const fs = require('fs');

function processFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\{sortConfig\?\.key === ['"](.*?)['"] && <ArrowUpDown className="([^"]*)" \/>\}/g,
        (match, key, classStr) => `<ArrowUpDown className={\`${classStr} \${sortConfig?.key === '${key}' ? 'text-meta-blue' : 'text-gray-300'}\`}/>`);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Processed', file);
}

processFile('src/components/Dashboard.tsx');
processFile('src/components/AccountDetailsPage.tsx');
