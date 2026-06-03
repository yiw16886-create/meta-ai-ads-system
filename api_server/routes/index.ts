import { Router } from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import storesRoutes from "./stores.routes";
import intelligenceRoutes from "./intelligence.routes";
import accountsRoutes from "./accounts.routes";
import syncRoutes from "./sync.routes";
import insightsRoutes from "./insights.routes";
import settingsRoutes from "./settings.routes";
import mappingsRoutes from "./mappings.routes";
import monitoringRoutes from "./monitoring.routes";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/users", usersRoutes);
routes.use("/stores", storesRoutes);
routes.use("/intelligence", intelligenceRoutes);
routes.use("/accounts", accountsRoutes);
routes.use("/", syncRoutes);
routes.use("/insights", insightsRoutes);
routes.use("/settings", settingsRoutes);
routes.use("/mappings", mappingsRoutes);
routes.use("/monitoring", monitoringRoutes);

export default routes;
