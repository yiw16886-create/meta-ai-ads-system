import { Router } from "express";
import { AsyncController } from "../controllers/async.controller.js";
import { catchAsync } from "../middlewares/catchAsync.js";

const router = Router();

// Endpoints for enqueuing async tasks via frontend
router.post("/sync/enqueue", catchAsync(AsyncController.enqueueSync));
router.post(
  "/ai/diagnose/enqueue",
  catchAsync(AsyncController.enqueueAiDiagnosis),
);

// Endpoint strictly for external CRON/Scheduler tools
router.post("/cron/daily-tasks", catchAsync(AsyncController.handleCronWebhook));

export default router;
