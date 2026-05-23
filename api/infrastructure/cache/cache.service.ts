import { redisClient } from "./redis.client.js";

/**
 * Enterprise Cache Service
 * Handles unified Redis cache abstractions for speed and rate-limiting.
 */
export class CacheService {
  /**
   * Get value from cache or execute fallback function and cache result
   */
  static async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await redisClient.get(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Fallback to fetcher if JSON parse fails
      }
    }

    const data = await fetcher();
    if (data) {
      await redisClient.set(key, JSON.stringify(data), "EX", ttlSeconds);
    }

    return data;
  }

  /**
   * Invalidate cache prefix or exact key
   */
  static async invalidate(key: string) {
    if (key.endsWith("*")) {
      const keys = await redisClient.keys(key);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } else {
      await redisClient.del(key);
    }
  }

  /**
   * Simple Rate Limiting / Circuit Breaking
   * @returns true if allowed, false if blocked
   */
  static async attemptRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const current = await redisClient.incr(key);
    if (current === 1) {
      await redisClient.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      return false; // Throttled
    }
    return true; // Allowed
  }
}
