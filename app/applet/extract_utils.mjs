import fs from 'fs';

let c = fs.readFileSync('api/server.ts', 'utf8');

function extract(s) {
  let idx = c.indexOf(s);
  if(idx === -1) return '';
  let i = idx;
  while(c[i] !== '{' && i < c.length) i++;
  let o = 1; i++;
  while(o > 0 && i < c.length) {
    if(c[i]==='{') o++; if(c[i]==='}') o--; i++;
  }
  const b = c.substring(idx, i);
  // Also remove it from c
  c = c.substring(0, idx) + c.substring(i);
  return b;
}

const b1 = extract('async function evaluateActivityStatus');
const b2 = extract('async function getMetaToken');
const b3 = extract('function extractMetaError');
const b4 = extract('function getCachedData');
const b5 = extract('function setCachedData');

const blocks = [b1, b2, b3, b4, b5].filter(x => x);

let out = `import prisma from "./db.js";
import axios from "axios";

// CACHE map for utils
const shoplineCache = new Map();

` + blocks.map(b => b.replace(/^async function/, 'export async function').replace(/^function/, 'export function')).join('\\n\\n');

fs.writeFileSync('api/utils.ts', out);
fs.writeFileSync('api/server.ts', c);
console.log('done utils');
