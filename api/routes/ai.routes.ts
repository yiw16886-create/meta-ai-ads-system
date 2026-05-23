import { Router } from "express";
import { AiController } from "../controllers/ai.controller.js";
import { catchAsync } from "../middlewares/catchAsync.js";

const router = Router();

// Endpoint for structured diagnosis using the new architecture
router.post("/diagnose-structured", catchAsync(AiController.generateDiagnosis));

export default router;
