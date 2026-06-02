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

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/users", usersRoutes);
routes.use("/stores", storesRoutes);
routes.use("/intelligence", intelligenceRoutes);
routes.use("/accounts", accountsRoutes);
routes.use("/sync", syncRoutes);
routes.use("/insights", insightsRoutes);
routes.use("/settings", settingsRoutes);
routes.use("/mappings", mappingsRoutes);
routes.use("/monitoring", monitoringRoutes);

export default routes;
