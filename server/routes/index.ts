import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
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
import facebookRoutes from "./facebook.routes.js";
import adminSettingsRoutes from "./adminSettings.routes.js";
import metaRoutes from "./meta.routes.js";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/users", authenticateJWT as any, usersRoutes);
routes.use("/stores", authenticateJWT as any, storesRoutes);
routes.use("/intelligence", authenticateJWT as any, intelligenceRoutes);
routes.use("/accounts", authenticateJWT as any, accountsRoutes);
routes.use("/materials", authenticateJWT as any, materialRoutes);
routes.use("/bms", authenticateJWT as any, bmsRoutes);
routes.use("/", authenticateJWT as any, syncRoutes);
routes.use("/insights", authenticateJWT as any, insightsRoutes);
routes.use("/settings", authenticateJWT as any, settingsRoutes);
routes.use("/mappings", authenticateJWT as any, mappingsRoutes);
routes.use("/monitoring", authenticateJWT as any, monitoringRoutes);
routes.use("/pages", authenticateJWT as any, pageManageRoutes);
routes.use("/facebook", authenticateJWT as any, facebookRoutes);
routes.use("/admin/settings", authenticateJWT as any, adminSettingsRoutes);
routes.use("/meta", authenticateJWT as any, metaRoutes);

export default routes;
