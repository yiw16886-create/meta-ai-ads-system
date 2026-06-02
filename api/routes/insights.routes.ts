import { Router } from "express";
import { InsightsController } from "../controllers/insights.controller.js";

const router = Router();

router.get("/", InsightsController.getInsights);

export default router;
