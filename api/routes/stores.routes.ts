import { Router } from "express";
import { StoresController } from "../controllers/stores.controller.js";

const router = Router();

router.get("/", StoresController.listStores);
router.post("/", StoresController.saveStore);
router.get("/all-dashboard-summary", StoresController.getStoresDashboardSummary);
router.get("/:id/dashboard-summary", StoresController.getStoreDashboardSummary);
router.get("/:id", StoresController.getStore);
router.delete("/:id", StoresController.deleteStore);
router.post("/:id/accounts", StoresController.addAdAccount);
router.delete("/:id/accounts/:accountId", StoresController.removeAdAccount);

export default router;
