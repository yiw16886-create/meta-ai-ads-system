import { Router } from "express";
import { SettingsController } from "../controllers/settings.controller";

const router = Router();

router.get("/", SettingsController.getSettings);
router.post("/", SettingsController.updateSetting);
router.get("/db-diagnose", SettingsController.dbDiagnose);
router.post("/db-push", SettingsController.dbPush);

export default router;