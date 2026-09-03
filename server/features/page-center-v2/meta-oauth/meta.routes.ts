import { Router, type Request, type Response } from "express";
import type { AuthenticatedRequest } from "../../../middlewares/auth.middleware.js";
import type { PageCenterV2Environment } from "../access.js";
import { requirePageCenterV2 } from "../access-middleware.js";
import { loadPageCenterMetaConfig, type PageCenterMetaEnvironment } from "./config.js";
import {
  completeMetaAuthorization,
  createMetaAuthorizationUrl,
  disconnectMetaAuthorization,
  getMetaAuthorizationStatus,
  verifyMetaAuthorization,
} from "./meta-service.js";
import { assertPageCenterTokenEncryptionConfigured } from "./token-cipher.js";

type Environment = PageCenterMetaEnvironment & PageCenterV2Environment;

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

function publicCallbackHtml(result: "success" | "error", message: string, origin: string) {
  const event = result === "success" ? "PAGE_CENTER_META_CONNECTED" : "PAGE_CENTER_META_ERROR";
  const safePayload = JSON.stringify({ type: event, message }).replace(/</g, "\\u003c");
  const safeOrigin = JSON.stringify(origin).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Meta 授权</title></head><body><p>${result === "success" ? "授权完成，窗口即将关闭。" : "授权未完成，请返回公共主页中心重试。"}</p><script>if(window.opener){window.opener.postMessage(${safePayload},${safeOrigin});}setTimeout(function(){window.close();},800);</script></body></html>`;
}

function apiError(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : "PAGE_CENTER_META_UNKNOWN_ERROR";
  const reconnect = /NOT_CONNECTED|GRAPH_ERROR|IDENTITY_CHANGED|DECRYPTION/.test(code);
  return res.status(code.includes("NOT_CONNECTED") ? 409 : 503).json({
    success: false,
    code,
    message: reconnect ? "Meta 授权已失效，请重新授权。" : "Meta OAuth 暂不可用，请检查服务器配置后重试。",
    reconnectRequired: reconnect,
  });
}

export function createPageCenterMetaRouter(environment: Environment = process.env) {
  const router = Router();

  router.get("/callback", async (req: Request, res) => {
    noStore(res);
    let origin = "null";
    try {
      assertPageCenterTokenEncryptionConfigured(environment);
      const config = await loadPageCenterMetaConfig(req, environment);
      origin = new URL(config.redirectUri).origin;
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!state || !code || req.query.error) throw new Error("PAGE_CENTER_META_CALLBACK_INVALID");
      const result = await completeMetaAuthorization({ code, state, config, environment });
      return res.status(200).send(publicCallbackHtml("success", `已授权 ${result.pageCount} 个公共主页`, origin));
    } catch {
      return res.status(200).send(publicCallbackHtml("error", "Meta 授权失败或已取消", origin));
    }
  });

  router.use(requirePageCenterV2(environment));

  router.post("/connect", async (req: AuthenticatedRequest, res) => {
    noStore(res);
    try {
      assertPageCenterTokenEncryptionConfigured(environment);
      const config = await loadPageCenterMetaConfig(req, environment);
      const url = await createMetaAuthorizationUrl({ actor: req.user!, config });
      return res.json({ success: true, data: { url } });
    } catch (error) {
      return apiError(res, error);
    }
  });

  router.get("/status", async (req: AuthenticatedRequest, res) => {
    noStore(res);
    try {
      return res.json({ success: true, data: await getMetaAuthorizationStatus(req.user!.id) });
    } catch (error) {
      return apiError(res, error);
    }
  });

  router.post("/verify", async (req: AuthenticatedRequest, res) => {
    noStore(res);
    try {
      const config = await loadPageCenterMetaConfig(req, environment);
      const data = await verifyMetaAuthorization({ actor: req.user!, config, environment });
      return res.json({ success: true, data });
    } catch (error) {
      return apiError(res, error);
    }
  });

  router.post("/disconnect", async (req: AuthenticatedRequest, res) => {
    noStore(res);
    try {
      await disconnectMetaAuthorization(req.user!.id);
      return res.json({ success: true });
    } catch (error) {
      return apiError(res, error);
    }
  });

  return router;
}
