import Redis from "ioredis";
import RedisMock from "ioredis-mock";

// Singleton Redis Client for entire infrastructure
class RedisService {
  private static instance: Redis;

  public static getInstance(): Redis {
    if (!RedisService.instance) {
      if (process.env.REDIS_URL) {
        RedisService.instance = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: null, // Required by BullMQ
          enableReadyCheck: false,
          retryStrategy(times) {
            return Math.min(times * 50, 2000);
          },
        });
      } else {
        console.warn(
          "[Redis] REDIS_URL not found. Using ioredis-mock instead.",
        );
        // @ts-ignore
        RedisService.instance = new RedisMock({
          maxRetriesPerRequest: null,
        });
      }

      RedisService.instance.on("error", (err) => {
        console.error("[Redis Error]", err.message);
      });

      RedisService.instance.on("connect", () => {
        console.log("[Redis] Connected safely.");
      });
    }
    return RedisService.instance;
  }
}

export const redisClient = RedisService.getInstance();
