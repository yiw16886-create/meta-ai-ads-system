import { Queue, QueueOptions } from "bullmq";
import { redisClient } from "../cache/redis.client.js";

/**
 * Factory to safely get or create queues.
 * Vercel compatible: Connects to remote Redis and enqueues jobs idempotently.
 */
export class QueueFactory {
  private static queues: Map<string, Queue> = new Map();

  static getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queueOpts: QueueOptions = {
        connection: redisClient,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000, // wait 5s, then 25s, then 125s
          },
          removeOnComplete: {
            age: 3600, // keep completed jobs for 1 hour for UI history
            count: 1000,
          },
          removeOnFail: {
            age: 86400, // keep failed jobs for 24 hours for debugging / Dead Letter
          },
        },
      };

      this.queues.set(queueName, new Queue(queueName, queueOpts));
    }
    return this.queues.get(queueName)!;
  }
}

export const SyncQueue = QueueFactory.getQueue("meta-sync-queue");
export const AiDiagnosisQueue = QueueFactory.getQueue("ai-diagnosis-queue");
