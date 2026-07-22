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

// 全局防御：禁止在 URL Query 参数中传递任何敏感 Token
routes.use((req, res, next) => {
  const sensitiveKeys = ['token', 'access_token', 'shopify_token', 'shopline_token', 'shoplazza_token', 'fb_access_token'];
  for (const key of Object.keys(req.query)) {
    if (sensitiveKeys.includes(key.toLowerCase()) || key.toLowerCase().includes('token')) {
      return res.status(403).json({ error: "Security Error: Passing access tokens in URL query parameters is strictly prohibited." });
    }
  }
  next();
});

// 统一 API 路由鉴权白名单
routes.use((req, res, next) => {
  const isWhitelisted = (path: string) => {
    // 忽略末尾斜杠
    const cleanPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
    const whitelist = [
      '/auth/login',
      '/auth/register',
      '/facebook/callback',      // 允许 Facebook OAuth 回调放行
      '/auth/facebook/callback' // 允许 Facebook OAuth 回调放行
    ];
    return whitelist.includes(cleanPath);
  };

  if (isWhitelisted(req.path)) {
    return next();
  }

  // 健康检查 /api/health 不在此 Router 中，直接在 server.ts 根实例放行
  
  // Facebook callback 等无需 JWT 的接口，根据题意要求移除所有匿名访问权限，
  // 严格遵循例外白名单要求，此处不予放行，统一拦截
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

export default routes;
