import { Worker, Job } from "bullmq";
import { redisClient } from "../cache/redis.client.js";
import { SyncService } from "../../services/sync/sync.service.js";
import { SyncAccountJobPayload } from "../queue/jobs.interface.js";

export class MetaSyncWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      "meta-sync-queue",
      async (job: Job<SyncAccountJobPayload>) => this.processJob(job),
      {
        connection: redisClient,
        concurrency: 10, // Parallelism safely isolated from Vercel timeout
      },
    );

    this.worker.on("completed", this.onCompleted);
    this.worker.on("failed", this.onFailed);
  }

  private async processJob(job: Job<SyncAccountJobPayload>) {
    const { accountId, token, startDate, endDate } = job.data;
    console.log(
      `[Sync Worker] Start Syncing Account ${accountId} from ${startDate} to ${endDate}`,
    );

    // Check global Redis rate limit circuit breaker first before firing to Meta API
    const isThrottled = await redisClient.get(`throttle:meta:${accountId}`);
    if (isThrottled) {
      throw new Error("Rate limit circuit breaker active. Postponing job.");
    }

    const { count } = await SyncService.syncAccountInsights(accountId, token, {
      startDate,
      endDate,
    });

    // Notify UI
    await redisClient.publish(
      `ws:sync:${accountId}`,
      JSON.stringify({
        event: "SYNC_COMPLETED",
        count,
      }),
    );

    return { accountId, count };
  }

  private onCompleted = (job: Job) => {
    console.log(
      `[Sync Worker] Job ${job.id} completed. Rows synced: ${job.returnvalue.count}`,
    );
  };

  private onFailed = (job: Job | undefined, err: Error) => {
    console.error(`[Sync Worker] Job ${job?.id} failed:`, err.message);
  };
}
