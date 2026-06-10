import { Router } from "express";
import { getShopMaterialLeaderboard } from "../controllers/material.controller.js";

const router = Router();

router.get("/leaderboard", getShopMaterialLeaderboard);

export default router;
