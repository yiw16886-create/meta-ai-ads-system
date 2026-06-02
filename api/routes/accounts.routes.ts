import { Router } from "express";
import { AccountsController } from "../controllers/accounts.controller.js";

const router = Router();

router.get("", AccountsController.listMetaAccounts);
router.get("/:accountId/details", AccountsController.getAccountDetails);
router.get("/:accountId/audience-insights", AccountsController.getAudienceInsights);
router.get("/:accountId/hierarchy", AccountsController.getAccountHierarchy);
router.get("/list", AccountsController.listUniqueActiveAccounts);

export default router;
