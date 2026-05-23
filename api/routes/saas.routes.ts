import { Router } from "express";
import { SaaSController } from "../controllers/saas.controller.js";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware.js";
import { catchAsync } from "../middlewares/catchAsync.js";

const router = Router();

// Retrieve user's SaaS workspaces
router.get("/workspaces", catchAsync(SaaSController.getWorkspacesByUser));

// Secure Enterprise Operation
router.post(
  "/:workspaceId/ad-accounts/:accountId/budget",
  requireWorkspaceRole(["ADMIN", "OPERATOR"]), // Requires proper authority
  catchAsync(SaaSController.updateAdAccountBudget),
);

export default router;
