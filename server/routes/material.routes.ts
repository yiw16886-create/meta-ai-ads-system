import { Router } from "express";
import { getShopMaterialLeaderboard, getMaterialTrend } from "../controllers/material.controller.js";

const router = Router();

router.get("/leaderboard", getShopMaterialLeaderboard);
router.get("/trend", getMaterialTrend);

export default router;
