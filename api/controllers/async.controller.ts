import { Request, Response } from "express";
import {
  SyncQueue,
  AiDiagnosisQueue,
} from "../infrastructure/queue/queue.factory.js";

export class AsyncController {
  /**
   * Enqueue a background sync task instead of blocking the request
   */
  static enqueueSync = async (req: Request, res: Response) => {
    const { accountId, token, startDate, endDate } = req.body;

    if (!accountId || !startDate || !endDate || !token) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const job = await SyncQueue.add(
        "sync-account",
        {
          accountId,
          token,
          startDate,
          endDate,
        },
        {
          jobId: `sync-${accountId}-${startDate}-${endDate}`, // Idempotent queuing
        },
      );

      res.status(202).json({
        success: true,
        message: "Sync job enqueued",
        jobId: job.id,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  /**
   * Enqueue a heavyweight AI analysis task
   */
  static enqueueAiDiagnosis = async (req: Request, res: Response) => {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    try {
      const job = await AiDiagnosisQueue.add(
        "ai-diagnosis",
        {
          accountId,
          triggerSource: "MANUAL",
        },
        {
          jobId: `ai-${accountId}-${new Date().toISOString().split("T")[0]}`,
        },
      );

      res.status(202).json({
        success: true,
        message: "AI diagnosis enqueued",
        jobId: job.id,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  /**
   * Webhook endpoint specifically designed to be called by a CRON scheduler (e.g. Vercel Cron/GitHub Actions)
   */
  static handleCronWebhook = async (req: Request, res: Response) => {
    // In production, verify auth headers/signatures here

    // Simulating pushing 50 active accounts to the Sync worker
    // 1. Fetch active accounts from DB
    // 2. Map over and SyncQueue.add()
    res
      .status(200)
      .json({ message: "Cron jobs disparched successfully to BullMQ." });
  };
}
