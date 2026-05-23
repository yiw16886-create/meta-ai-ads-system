import { Worker, Job } from "bullmq";
import { redisClient } from "../cache/redis.client.js";
import { AiDiagnosticService } from "../../services/ai/ai.service.js";
import { AiDiagnosisJobPayload } from "../queue/jobs.interface.js";

/**
 * Worker for processing asynchronous AI diagnoses.
 * In a Vercel-only environment, this can be mapped to an API route acting as a Webhook receiver (Upstash/QStash pattern).
 * In a standard Node environment (Render/Railway), this file is executed as a long-running process.
 */
export class AiAnalysisWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      "ai-diagnosis-queue",
      async (job: Job<AiDiagnosisJobPayload>) => this.processJob(job),
      {
        connection: redisClient,
        concurrency: 5, // Process 5 AI tasks simultaneously max to avoid Gemini API limits
        limiter: {
          max: 10,
          duration: 1000 * 60, // Limit to 10 jobs per minute (Rate Limit coordination)
        },
      },
    );

    this.worker.on("completed", this.onCompleted);
    this.worker.on("failed", this.onFailed);
  }

  private async processJob(job: Job<AiDiagnosisJobPayload>) {
    const { accountId, triggerSource } = job.data;
    console.log(
      `[AI Worker] Commencing diagnosis for account ${accountId} (Trigger: ${triggerSource})`,
    );

    // 1. Run the heavyweight AI Diagnosis
    const diagnosisResult = await AiDiagnosticService.runDiagnosis(accountId);

    // 2. Persist the result to database (placeholder)
    // await AiResultRepository.saveResult(diagnosisResult);

    // 3. For real-time UIs, we can publish an event back over Redis pub/sub
    await redisClient.publish(
      `ws:ai:${accountId}`,
      JSON.stringify({
        event: "DIAGNOSIS_COMPLETED",
        data: diagnosisResult,
      }),
    );

    return diagnosisResult;
  }

  private onCompleted = (job: Job) => {
    console.log(`[AI Worker] Job ${job.id} completed successfully.`);
  };

  private onFailed = (job: Job | undefined, err: Error) => {
    console.error(`[AI Worker] Job ${job?.id} failed with error:`, err.message);
    // Note: If attempts > MAX_ATTEMPTS, job goes to the DLQ (Dead Letter Queue) intrinsically in BullMQ
  };
}

// In standard persistent server environments, auto-start:
// new AiAnalysisWorker();
