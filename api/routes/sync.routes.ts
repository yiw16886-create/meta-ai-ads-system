import { Router } from "express";
import { SyncController } from "../controllers/sync.controller.js";

const router = Router();

router.post("/sync", SyncController.syncAdData);
router.post("/sync-store", SyncController.syncStoreData);
router.post("/sync-creatives", SyncController.syncCreatives);
router.get("/cron/sync-monthly", SyncController.cronSyncMonthly);

export default router;
