import { Router } from "express";
import { MonitoringController } from "../controllers/monitoring.controller.js";

const router = Router();

router.get("/accounts", MonitoringController.listMonitoringAccounts);
router.post("/accounts/:accountId/reset", MonitoringController.resetLimit);

export default router;
