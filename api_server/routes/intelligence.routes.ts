import { Router } from "express";
import { IntelligenceController } from "../controllers/intelligence.controller";

const router = Router();

router.get("/products", IntelligenceController.getProductIntelligence);
router.get("/creatives", IntelligenceController.getCreativeIntelligence);
router.get("/creatives/daily", IntelligenceController.getDailyCreativePerformance);
router.post("/aggregate", IntelligenceController.aggregate);

export default router;
