import { Router } from "express";
import { getShopMaterialLeaderboard, getMaterialTrend } from "../controllers/material.controller.js";

const router = Router();

router.get("/leaderboard", getShopMaterialLeaderboard);
router.post("/leaderboard", getShopMaterialLeaderboard);

router.get("/trend", getMaterialTrend);
router.post("/trend", getMaterialTrend);

export default router;
