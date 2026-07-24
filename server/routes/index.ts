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
import dashboardRoutes from "./dashboard.routes.js";

const routes = Router();

// 全局防御：禁止在 URL Query 参数中传递任何敏感 Token
routes.use((req, res, next) => {
  const sensitiveKeys = ['token', 'access_token', 'shopify_token', 'shopline_token', 'shoplazza_token', 'fb_access_token', 'jwt_token'];
  for (const key of Object.keys(req.query)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      return res.status(403).json({ error: "Security Error: Passing access tokens in URL query parameters is strictly prohibited." });
    }
  }
  next();
});

// 统一 API 路由鉴权白名单
routes.use((req, res, next) => {
  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/verify-token',
    '/auth/accept-invite',
    '/auth/invites/verify',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-token',
    '/api/auth/accept-invite',
    '/api/invites/verify',
    '/facebook/callback',
    '/auth/facebook/callback',
    '/api/facebook/callback',
    '/api/auth/facebook/callback'
  ];

  const reqPath = req.path || '';
  const originalUrl = req.originalUrl || '';

  if (publicPaths.some(path => reqPath.startsWith(path) || originalUrl.startsWith(path))) {
    return next();
  }

  // 健康检查 /api/health 不在此 Router 中，直接在 server.ts 根实例放行
  return authenticateJWT(req as any, res, next);
});

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
routes.use("/facebook", facebookRoutes);
routes.use("/admin/settings", adminSettingsRoutes);
routes.use("/meta", metaRoutes);
routes.use("/dashboard", dashboardRoutes);

export default routes;
