import { Router } from "express";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import storesRoutes from "./stores.routes.js";
import intelligenceRoutes from "./intelligence.routes.js";
import accountsRoutes from "./accounts.routes.js";
import syncRoutes from "./sync.routes.js";
import insightsRoutes from "./insights.routes.js";
import settingsRoutes from "./settings.routes.js";
import mappingsRoutes from "./mappings.routes.js";
import monitoringRoutes from "./monitoring.routes.js";
import materialRoutes from "./material.routes.js";
import pageManageRoutes from "./pageManage.routes.js";
import bmsRoutes from "./bms.routes.js";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/users", usersRoutes);
routes.use("/stores", storesRoutes);
routes.use("/intelligence", intelligenceRoutes);
routes.use("/accounts", accountsRoutes);
routes.use("/materials", materialRoutes);
routes.use("/bms", bmsRoutes);
routes.use("/", syncRoutes);
routes.use("/insights", insightsRoutes);
routes.use("/settings", settingsRoutes);
routes.use("/mappings", mappingsRoutes);
routes.use("/monitoring", monitoringRoutes);
routes.use("/pages", pageManageRoutes);

export default routes;
