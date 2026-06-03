import fs from 'fs';
import path from 'path';

const rootDir = '/';
const dirsToScan = ['/server', '/src', '/api', '/api_server']; // including old dirs if they exist

const broken = [];
const redundant = [];
const fixDirs = {}; // Group by file

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const fullPath = path.join(dir, f);
        if (f.startsWith('.')) continue;
        if (f === 'node_modules') continue;
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (fullPath.match(/\.(ts|tsx|js|jsx)$/)) {
            analyzeFile(fullPath);
        }
    }
}

function analyzeFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const lines = code.split('\n');
    lines.forEach((line, index) => {
        const importRegex = /(?:import|export)\s+(?:(?:.|\n)*?)\s*from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(line)) !== null) {
            checkImport(filePath, index + 1, match[1], line);
        }
        
        const requireRegex = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(line)) !== null) {
            checkImport(filePath, index + 1, match[1], line);
        }
    });
}

function resolvePath(filePath, importPath) {
    if (importPath.startsWith('.')) {
        return path.resolve(path.dirname(filePath), importPath);
    } else if (importPath.startsWith('@/')) {
        return path.join('/src', importPath.slice(2)); 
    }
    return null; // External package or built-in, skip
}

function checkImport(filePath, lineNum, importPath, line) {
    const resolved = resolvePath(filePath, importPath);
    if (!resolved) return; 
    
    // Check missing file
    // Check if the exact path + possible extension exists
    const extsToCheck = ['', '.js', '.ts', '.tsx', '.jsx', '/index.js', '/index.ts', '/index.tsx'];
    let exists = false;
    let actualExt = '';
    
    // Explicit .js check 
    if (importPath.endsWith('.js')) {
        const base = importPath.slice(0, -3);
        const resolvedBase = resolvePath(filePath, base);
        if (fs.existsSync(resolved) || fs.existsSync(resolvedBase + '.ts') || fs.existsSync(resolvedBase + '.tsx')) {
            exists = true;
            // .js mapping to .ts is valid in NodeNext/ESM! 
        }
    } else {
        for (const ext of extsToCheck) {
            if (fs.existsSync(resolved + ext)) {
                if (fs.statSync(resolved + ext).isFile()) {
                    exists = true;
                    actualExt = ext;
                    break;
                }
            }
        }
    }
    
    if (!exists) {
       broken.push({file: filePath, line: lineNum, path: importPath, reason: 'Broken link'});
    } else {
        // Redundant imports check? (E.g. Importing from outdated dir /api instead of /server)
        if (importPath.includes('/api/')) {
            redundant.push({file: filePath, line: lineNum, path: importPath, reason: 'Legacy /api path usage'});
        } else if (importPath.includes('/api_server/')) {
            redundant.push({file: filePath, line: lineNum, path: importPath, reason: 'Legacy /api_server path usage'});
        }
    }
}

dirsToScan.forEach(scanDir);
['/test-agg.ts', '/test-query.ts', '/test-shopline.ts', '/sync_test.ts'].forEach(f => {
    if (fs.existsSync(f)) analyzeFile(f);
});

console.log("=== BROKEN ===");
broken.forEach(b => console.log(`${b.file}:${b.line} - ${b.path}`));

console.log("\n=== REDUNDANT/LEGACY ===");
redundant.forEach(r => console.log(`${r.file}:${r.line} - ${r.path} (${r.reason})`));

