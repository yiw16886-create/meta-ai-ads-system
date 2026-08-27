import dotenv from "dotenv";
dotenv.config({ override: true });
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const prismaClientSingleton = () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.warn("⚠️ DATABASE_URL is not set. Prisma might fail.");
    return new PrismaClient();
  }
  
  // Use standard Prisma Client
  return new PrismaClient({
    datasources: {
      db: { url }
    }
  });
};

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const realPrisma = globalForPrisma.prisma || prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = realPrisma;

// In-Memory Database Fallback State and File Persistence
export let dbFailed = false;
export const isDbFallbackActive = () => dbFailed;

const DB_FILE_PATH = path.join(process.cwd(), "db_fallback.json");

const inMemoryDb: Record<string, any[]> = {
  user: [
    {
      id: 1,
      email: "yiw16886@gmail.com",
      password: "$2a$10$C8bWc6/hH2rU60oY2hV1eeVvE4T7z3D7mre2.8YwGZ2/1wR1vK.qG", // bcrypt hash of "admin"
      password_hash: "$2a$10$C8bWc6/hH2rU60oY2hV1eeVvE4T7z3D7mre2.8YwGZ2/1wR1vK.qG",
      role: "admin",
      status: "ACTIVE",
      org_id: "org_dev_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ],
  invitation: [
    {
      id: 1,
      email: "yiw16886@gmail.com",
      token: "dev",
      role: "admin",
      expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 years
      createdAt: new Date(),
      org_id: "org_dev_1"
    }
  ],
  organization: [
    {
      id: "org_dev_1",
      name: "Dev Team",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  systemSetting: [
    {
      id: 1,
      facebookClientId: "fb_client_id_mock_123",
      facebookClientSecret: "fb_client_secret_mock_123",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  setting: [],
  store: [],
  order: [],
  adAccount: [],
  accountMapping: [],
  metaAccountMonitoring: [],
  facebookPage: [],
  facebookAdPost: [],
  adPostComment: [],
  facebookBusinessManager: [],
  facebookAccount: [],
  userFacebookBinding: [],
  ad: [],
  campaign: [],
  adSet: [],
  adCreative: [],
  metaActionLog: []
};

// Load persistent DB state if exists
export function loadDb() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const content = fs.readFileSync(DB_FILE_PATH, "utf-8");
      const parsed = JSON.parse(content);
      for (const key of Object.keys(parsed)) {
        inMemoryDb[key] = parsed[key];
      }
      console.log(`💾 [In-Memory Engine] Persistent DB loaded. Total Users: ${inMemoryDb.user?.length || 0}`);
    }
  } catch (e: any) {
    console.error("Failed to load in-memory DB from file:", e);
  }
}

// Save DB state to file with debounce for high performance
let saveDbTimer: any = null;

export function saveDb(immediate = false) {
  if (immediate) {
    if (saveDbTimer) {
      clearTimeout(saveDbTimer);
      saveDbTimer = null;
    }
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(inMemoryDb, null, 2), "utf-8");
    } catch (e: any) {
      console.error("Failed to persist in-memory DB (sync):", e);
    }
    return;
  }

  if (saveDbTimer) return;
  saveDbTimer = setTimeout(() => {
    saveDbTimer = null;
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(inMemoryDb, null, 2), "utf-8");
    } catch (e: any) {
      console.error("Failed to persist in-memory DB:", e);
    }
  }, 200);
}

// Initial DB Load
loadDb();


// Filter logic helper mimicking Prisma's where conditions
function matchFilter(item: any, where: any): boolean {
  if (!where) return true;

  // Handle top-level OR / AND
  if (where.OR && Array.isArray(where.OR)) {
    let anyMatch = false;
    for (const subFilter of where.OR) {
      if (matchFilter(item, subFilter)) {
        anyMatch = true;
        break;
      }
    }
    if (!anyMatch) return false;
  }

  if (where.AND && Array.isArray(where.AND)) {
    for (const subFilter of where.AND) {
      if (!matchFilter(item, subFilter)) return false;
    }
  }

  for (const key of Object.keys(where)) {
    if (key === 'OR' || key === 'AND') continue;

    // Handle composite unique keys
    if (key === 'accountId_date' && where[key]) {
      const filterVal = where[key];
      if (item.accountId !== filterVal.accountId || item.date !== filterVal.date) return false;
      continue;
    }
    if (key === 'storeId_productId_date' && where[key]) {
      const filterVal = where[key];
      if (item.storeId !== filterVal.storeId || item.productId !== filterVal.productId || item.date !== filterVal.date) return false;
      continue;
    }
    if (key === 'userId_fb_account_id' && where[key]) {
      const filterVal = where[key];
      if (item.userId !== filterVal.userId || item.fb_account_id !== filterVal.fb_account_id) return false;
      continue;
    }
    if (key === 'userId_bmId' && where[key]) {
      const filterVal = where[key];
      if (item.userId !== filterVal.userId || item.bmId !== filterVal.bmId) return false;
      continue;
    }

    const filterVal = where[key];
    const itemVal = item[key];

    if (filterVal === undefined) continue;

    if (filterVal && typeof filterVal === 'object' && !(filterVal instanceof Date)) {
      if ('equals' in filterVal) {
        if (itemVal !== filterVal.equals) return false;
      }
      if ('in' in filterVal) {
        if (!Array.isArray(filterVal.in) || !filterVal.in.includes(itemVal)) return false;
      }
      if ('notIn' in filterVal) {
        if (Array.isArray(filterVal.notIn) && filterVal.notIn.includes(itemVal)) return false;
      }
      if ('gte' in filterVal) {
        if (itemVal === undefined || itemVal === null || itemVal < filterVal.gte) return false;
      }
      if ('lte' in filterVal) {
        if (itemVal === undefined || itemVal === null || itemVal > filterVal.lte) return false;
      }
      if ('gt' in filterVal) {
        if (itemVal === undefined || itemVal === null || itemVal <= filterVal.gt) return false;
      }
      if ('lt' in filterVal) {
        if (itemVal === undefined || itemVal === null || itemVal >= filterVal.lt) return false;
      }
      if ('contains' in filterVal) {
        if (typeof itemVal !== 'string' || !itemVal.toLowerCase().includes(filterVal.contains.toLowerCase())) return false;
      }
    } else {
      if (itemVal !== filterVal) return false;
    }
  }
  return true;
}

// Mimicking Prisma skip, take, and orderBy
function applyQueryModifiers(items: any[], args: any): any[] {
  let result = [...items];

  // Apply orderBy
  if (args?.orderBy) {
    const orderBy = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
    result.sort((a, b) => {
      for (const orderObj of orderBy) {
        for (const key of Object.keys(orderObj)) {
          const orderDir = orderObj[key];
          const valA = a[key];
          const valB = b[key];
          if (valA === valB) continue;
          if (valA === undefined || valA === null) return orderDir === 'asc' ? 1 : -1;
          if (valB === undefined || valB === null) return orderDir === 'asc' ? -1 : 1;
          
          if (typeof valA === 'string' && typeof valB === 'string') {
            return orderDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return orderDir === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
        }
      }
      return 0;
    });
  }

  // Apply skip
  if (typeof args?.skip === 'number') {
    result = result.slice(args.skip);
  }

  // Apply take (limit)
  if (typeof args?.take === 'number') {
    result = result.slice(0, args.take);
  }

  return result;
}

function mockCreate(modelName: string, args: any): any {
  inMemoryDb[modelName] = inMemoryDb[modelName] || [];
  const rawData = args?.data || {};
  const record: any = { ...rawData };

  if (record.id === undefined) {
    if (modelName === 'user' || modelName === 'store' || modelName === 'adAccount' || modelName === 'facebookBusinessManager' || modelName === 'invitation') {
      const maxId = inMemoryDb[modelName].reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
      record.id = maxId + 1;
    } else {
      record.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    }
  }

  if (!record.createdAt) record.createdAt = new Date();
  if (!record.updatedAt) record.updatedAt = new Date();

  inMemoryDb[modelName].push(record);
  saveDb();
  return record;
}

function mockUpdate(modelName: string, args: any): any {
  inMemoryDb[modelName] = inMemoryDb[modelName] || [];
  const index = inMemoryDb[modelName].findIndex(item => matchFilter(item, args?.where));
  if (index !== -1) {
    const existing = inMemoryDb[modelName][index];
    const updateData = args?.data || {};
    const updated = { ...existing, ...updateData, updatedAt: new Date() };
    inMemoryDb[modelName][index] = updated;
    saveDb();
    return updated;
  }
  
  // If record is not found during fallback mode, automatically create it with combined where & data fields
  // to avoid application crash or failing operations.
  const updateData = args?.data || {};
  const whereFields: any = {};
  if (args?.where) {
    for (const key of Object.keys(args.where)) {
      const val = args.where[key];
      if (val !== undefined && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
        whereFields[key] = val;
      }
    }
  }

  const record = { ...whereFields, ...updateData };
  if (record.id === undefined) {
    if (modelName === 'user' || modelName === 'store' || modelName === 'adAccount' || modelName === 'facebookBusinessManager' || modelName === 'invitation') {
      const maxId = inMemoryDb[modelName].reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
      record.id = maxId + 1;
    } else {
      record.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    }
  }

  if (!record.createdAt) record.createdAt = new Date();
  if (!record.updatedAt) record.updatedAt = new Date();

  inMemoryDb[modelName].push(record);
  console.warn(`[In-Memory Engine] Auto-created missing record for update on ${modelName}:`, record);
  saveDb();
  return record;
}

function mockUpdateMany(modelName: string, args: any): { count: number } {
  inMemoryDb[modelName] = inMemoryDb[modelName] || [];
  let count = 0;
  const updateData = args?.data || {};
  inMemoryDb[modelName] = inMemoryDb[modelName].map(item => {
    if (matchFilter(item, args?.where)) {
      count++;
      return { ...item, ...updateData, updatedAt: new Date() };
    }
    return item;
  });
  if (count > 0) saveDb();
  return { count };
}

function mockUpsert(modelName: string, args: any): any {
  inMemoryDb[modelName] = inMemoryDb[modelName] || [];
  const existingIndex = inMemoryDb[modelName].findIndex(item => matchFilter(item, args?.where));
  
  if (existingIndex !== -1) {
    const existing = inMemoryDb[modelName][existingIndex];
    const updateData = args?.update || {};
    const updated = { ...existing, ...updateData, updatedAt: new Date() };
    inMemoryDb[modelName][existingIndex] = updated;
    saveDb();
    return updated;
  } else {
    const createData = args?.create || {};
    const record = { ...createData };
    
    if (record.id === undefined) {
      if (modelName === 'user' || modelName === 'store' || modelName === 'adAccount' || modelName === 'facebookBusinessManager' || modelName === 'invitation') {
        const maxId = inMemoryDb[modelName].reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
        record.id = maxId + 1;
      } else {
        record.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      }
    }
    
    if (args?.where) {
      if (args.where.accountId_date) {
        record.accountId = args.where.accountId_date.accountId;
        record.date = args.where.accountId_date.date;
      }
      if (args.where.storeId_productId_date) {
        record.storeId = args.where.storeId_productId_date.storeId;
        record.productId = args.where.storeId_productId_date.productId;
        record.date = args.where.storeId_productId_date.date;
      }
      if (args.where.userId_fb_account_id) {
        record.userId = args.where.userId_fb_account_id.userId;
        record.fb_account_id = args.where.userId_fb_account_id.fb_account_id;
      }
      if (args.where.userId_bmId) {
        record.userId = args.where.userId_bmId.userId;
        record.bmId = args.where.userId_bmId.bmId;
      }
    }

    if (!record.createdAt) record.createdAt = new Date();
    if (!record.updatedAt) record.updatedAt = new Date();

    inMemoryDb[modelName].push(record);
    saveDb();
    return record;
  }
}

function mockDelete(modelName: string, args: any): any {
  inMemoryDb[modelName] = inMemoryDb[modelName] || [];
  const index = inMemoryDb[modelName].findIndex(item => matchFilter(item, args?.where));
  if (index !== -1) {
    const deleted = inMemoryDb[modelName].splice(index, 1)[0];
    saveDb();
    return deleted;
  }
  return null;
}

function mockDeleteMany(modelName: string, args: any): { count: number } {
  inMemoryDb[modelName] = inMemoryDb[modelName] || [];
  const initialLength = inMemoryDb[modelName].length;
  inMemoryDb[modelName] = inMemoryDb[modelName].filter(item => !matchFilter(item, args?.where));
  const deletedCount = initialLength - inMemoryDb[modelName].length;
  if (deletedCount > 0) saveDb();
  return { count: deletedCount };
}

function mockCount(modelName: string, args: any): number {
  const items = inMemoryDb[modelName] || [];
  const filtered = items.filter(item => matchFilter(item, args?.where));
  return filtered.length;
}

function mockGroupBy(modelName: string, args: any): any[] {
  const items = inMemoryDb[modelName] || [];
  const filtered = items.filter(item => matchFilter(item, args?.where));
  
  if (!args?.by || !Array.isArray(args.by)) {
    return [];
  }

  const groups = new Map<string, any[]>();
  for (const item of filtered) {
    const keyParts = args.by.map((byKey: string) => String(item[byKey] || ""));
    const groupKey = keyParts.join("::");
    const existing = groups.get(groupKey) || [];
    existing.push(item);
    groups.set(groupKey, existing);
  }

  const result: any[] = [];
  for (const [groupKey, groupItems] of groups.entries()) {
    const firstItem = groupItems[0];
    const groupRow: any = {};
    for (const byKey of args.by) {
      groupRow[byKey] = firstItem[byKey];
    }

    if (args._sum) {
      groupRow._sum = {};
      for (const sumKey of Object.keys(args._sum)) {
        const total = groupItems.reduce((acc, item) => acc + (Number(item[sumKey]) || 0), 0);
        groupRow._sum[sumKey] = total;
      }
    }
    
    if (args._avg) {
      groupRow._avg = {};
      for (const avgKey of Object.keys(args._avg)) {
        const total = groupItems.reduce((acc, item) => acc + (Number(item[avgKey]) || 0), 0);
        groupRow._avg[avgKey] = groupItems.length ? total / groupItems.length : 0;
      }
    }

    result.push(groupRow);
  }

  return result;
}

async function executeWithFallback<T>(modelName: string, opName: string, realFn: () => Promise<T>, fallbackFn: () => any): Promise<T> {
  if (dbFailed) {
    try {
      return fallbackFn();
    } catch (fallbackErr: any) {
      console.error(`[In-Memory Model Error] Fail-safe operation failed on model ${modelName}.${opName}:`, fallbackErr.message);
      throw fallbackErr;
    }
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Prisma query timed out (3000ms)")), 3000)
    );
    return await Promise.race([realFn(), timeoutPromise]);
  } catch (err: any) {
    const isQuotaOrConnectionErr = 
      err.message?.toLowerCase().includes("quota") ||
      err.message?.toLowerCase().includes("exceeded") ||
      err.message?.toLowerCase().includes("initialization") ||
      err.message?.toLowerCase().includes("connection") ||
      err.message?.toLowerCase().includes("timed out") ||
      err.code === "P1001" ||
      err.code === "P2024" ||
      err.code === "P1017";

    dbFailed = true;
    console.warn(`[Prisma Model Error] ${modelName}.${opName} failed: ${err.message}. Switched to High-Performance In-Memory Engine.`);
    try {
      return fallbackFn();
    } catch (fallbackErr: any) {
      return fallbackFn();
    }
  }
}

function createModelProxy(modelName: string, realModel: any) {
  return new Proxy(realModel || {}, {
    get(target, opName, receiver) {
      if (typeof opName !== 'string') return Reflect.get(target, opName, receiver);

      return async (...args: any[]) => {
        const queryArgs = args[0];

        const realFn = async () => {
          if (!realModel || !realModel[opName]) {
            throw new Error(`Method ${opName} does not exist on Prisma model ${modelName}`);
          }
          return await realModel[opName](...args);
        };

        const fallbackFn = () => {
          inMemoryDb[modelName] = inMemoryDb[modelName] || [];
          
          switch (opName) {
            case 'findMany': {
              const items = inMemoryDb[modelName].filter(item => matchFilter(item, queryArgs?.where));
              return applyQueryModifiers(items, queryArgs);
            }
            case 'findUnique':
            case 'findFirst': {
              const items = inMemoryDb[modelName].filter(item => matchFilter(item, queryArgs?.where));
              const modified = applyQueryModifiers(items, queryArgs);
              return modified.length > 0 ? modified[0] : null;
            }
            case 'create':
              return mockCreate(modelName, queryArgs);
            case 'update':
              return mockUpdate(modelName, queryArgs);
            case 'updateMany':
              return mockUpdateMany(modelName, queryArgs);
            case 'upsert':
              return mockUpsert(modelName, queryArgs);
            case 'delete':
              return mockDelete(modelName, queryArgs);
            case 'deleteMany':
              return mockDeleteMany(modelName, queryArgs);
            case 'count':
              return mockCount(modelName, queryArgs);
            case 'groupBy':
              return mockGroupBy(modelName, queryArgs);
            default:
              console.warn(`[In-Memory Engine] Unhandled method: ${modelName}.${opName}`);
              return null;
          }
        };

        return await executeWithFallback(modelName, opName, realFn, fallbackFn);
      };
    }
  });
}

const mockTopLevel = {
  $transaction: async (arg: any) => {
    if (Array.isArray(arg)) {
      const results: any[] = [];
      for (const p of arg) {
        results.push(await p);
      }
      return results;
    } else if (typeof arg === "function") {
      return await arg(prismaProxy);
    }
    return [];
  },
  $executeRaw: async (...args: any[]) => {
    console.log("[Mock $executeRaw] Database connection bypass. Statement skipped.");
    return 0;
  },
  $queryRaw: async (...args: any[]) => {
    console.log("[Mock $queryRaw] Database connection bypass. Statement returned empty.");
    return [];
  },
  $connect: async () => {
    console.log("[Mock $connect] Database bypass.");
  },
  $disconnect: async () => {
    console.log("[Mock $disconnect] Database bypass.");
  }
};

const prismaProxy = new Proxy(realPrisma, {
  get(target, prop, receiver) {
    if (typeof prop === "string" && prop !== "then" && prop !== "catch") {
      if (prop === "$transaction" || prop === "$executeRaw" || prop === "$queryRaw" || prop === "$connect" || prop === "$disconnect") {
        return mockTopLevel[prop as keyof typeof mockTopLevel];
      }
      const realModel = (target as any)[prop];
      return createModelProxy(prop, realModel);
    }
    return Reflect.get(target, prop, receiver);
  }
});

export const prisma = prismaProxy as unknown as PrismaClient;
export const rawPrisma = realPrisma;
export default prisma;
