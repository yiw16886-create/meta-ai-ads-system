import { Router } from "express";
import { SettingsController } from "../controllers/settings.controller.js";

const router = Router();

router.get("/", SettingsController.getSettings);
router.post("/", SettingsController.updateSetting);

export default router;