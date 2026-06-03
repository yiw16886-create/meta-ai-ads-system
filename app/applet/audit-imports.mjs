import fs from 'fs';
import path from 'path';

const rootDir = '.';
const dirsToScan = ['./server', './src', './api', './api_server']; 

const broken = [];
const redundant = [];
const warnings = [];

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
    
    // Process whole file to handle multiline imports
    const importRegex = /(?:import|export)\s+(?:[^'"]*?)\s*from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
        const lineNum = code.substring(0, match.index).split('\n').length;
        checkImport(filePath, lineNum, match[1], match[0]);
    }
    
    const requireRegex = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(code)) !== null) {
        const lineNum = code.substring(0, match.index).split('\n').length;
        checkImport(filePath, lineNum, match[1], match[0]);
    }
}

function resolvePath(filePath, importPath) {
    if (importPath.startsWith('.')) {
        return path.resolve(path.dirname(filePath), importPath);
    } else if (importPath.startsWith('@/')) {
        return path.join(process.cwd(), 'src', importPath.slice(2)); 
    }
    return null; // External package or built-in, skip
}

function checkImport(filePath, lineNum, importPath, line) {
    const resolved = resolvePath(filePath, importPath);
    if (!resolved) return; 
    
    // Convert to relative path from PWD for display
    const relativeFilePath = path.relative(process.cwd(), filePath);
    
    // Determine actual file on disk
    const extsToCheck = ['', '.js', '.ts', '.tsx', '.jsx', '/index.js', '/index.ts', '/index.tsx'];
    let exists = false;
    
    // Check capitalization by readdir if exact match fails
    // But Vercel/Linux is case sensitive. So simple existsSync is usually fine if we assume Linux container
    
    // Explicit .js mapping check
    if (importPath.endsWith('.js')) {
        const base = importPath.slice(0, -3);
        const resolvedBase = resolvePath(filePath, base);
        if (fs.existsSync(resolved) || fs.existsSync(resolvedBase + '.ts') || fs.existsSync(resolvedBase + '.tsx')) {
            exists = true;
            // .js mapping to .ts is valid in NodeNext/ESM! 
        } else if (fs.existsSync(resolvedBase + '.js')) {
            exists = true;
        } else if (fs.existsSync(resolvedBase)) {
             // Maybe it points to a directory index? like ./services.js mapping to ./services/index.ts
             if (fs.existsSync(resolvedBase + '/index.ts') || fs.existsSync(resolvedBase + '/index.js')) {
                 exists = true;
                 warnings.push({file: relativeFilePath, line: lineNum, path: importPath, reason: '.js appended to a directory import (may parse wrong in Vercel/NodeNext)'});
             }
        }
    } else {
        // No explicit js extension -> Could be broken in NodeNext, or Vite aliases
        // If it's in ./server, and no explicit .js, it's missing for NodeNext unless it's a package
        for (const ext of extsToCheck) {
            if (fs.existsSync(resolved + ext) && fs.statSync(resolved + ext).isFile()) {
                exists = true;
                if (!importPath.endsWith('.js') && relativeFilePath.startsWith('server') && !importPath.startsWith('@/')) {
                    warnings.push({file: relativeFilePath, line: lineNum, path: importPath, reason: 'Missing .js extension in server code (NodeNext mode required by Vercel/Node)'});
                }
                break;
            }
        }
    }
    
    if (!exists) {
       broken.push({file: relativeFilePath, line: lineNum, path: importPath, reason: 'Target file not found on disk'});
    } else {
        // Redundant imports check (api/ or api_server/ instead of server/)
        if (importPath.includes('/api/')) {
            redundant.push({file: relativeFilePath, line: lineNum, path: importPath, reason: 'Legacy /api path usage'});
        } else if (importPath.includes('/api_server/')) {
            redundant.push({file: relativeFilePath, line: lineNum, path: importPath, reason: 'Legacy /api_server path usage'});
        }
    }
}

dirsToScan.forEach(scanDir);
['./test-agg.ts', './test-query.ts', './test-shopline.ts', './sync_test.ts'].forEach(f => {
    if (fs.existsSync(f)) analyzeFile(f);
});

console.log("=== \u274C BROKEN ===");
broken.forEach(b => console.log(`${b.file}:${b.line} - ${b.path} [${b.reason}]`));

console.log("\n=== \u26A0\uFE0F WARNINGS ===");
warnings.forEach(w => console.log(`${w.file}:${w.line} - ${w.path} [${w.reason}]`));

console.log("\n=== \uD83E\uDDF9 REDUNDANT/LEGACY ===");
redundant.forEach(r => console.log(`${r.file}:${r.line} - ${r.path} (${r.reason})`));

