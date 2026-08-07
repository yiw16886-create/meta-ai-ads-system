/**
 * 轻量级 LRU 内存缓存
 * 用于减少 Neon 数据库查询和 Meta API 调用频率
 * 零外部依赖，适合 Vercel Serverless 环境
 */

import { config } from "../config.js";

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private maxEntries: number;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    // LRU: move to end (delete + re-set)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // 达到上限时删除最旧的条目
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { data, expiry: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * 通过前缀清除一组缓存
   */
  clearByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  get size(): number {
    return this.store.size;
  }
}

// 全局缓存实例
export const cache = new MemoryCache(500);

// 预定义的缓存键前缀
export const CacheKeys = {
  metaInsights: (accountId: string, date: string) => `insights:${accountId}:${date}`,
  aggregatedData: (type: string, params: string) => `aggregated:${type}:${params}`,
  accountList: (userId: number) => `accounts:${userId}`,
  bmList: (userId: number) => `bms:${userId}`,
  token: (userId: number) => `token:${userId}`,
  dashboard: (tab: string, userId: number) => `dashboard:${tab}:${userId}`,
} as const;

/**
 * 缓存装饰器：如果缓存命中则返回缓存，否则执行 fn 并缓存结果
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) return cached;

  const data = await fn();
  cache.set(key, data, ttlMs);
  return data;
}
