import { Router } from "express";
import {
  evaluatePageCenterV2Access,
  type PageCenterV2Environment,
} from "./access.js";
import {
  noStore,
  requirePageCenterV2,
  type PageCenterV2Request,
} from "./access-middleware.js";
import { getMcpOAuthIssuer } from "../mcp-oauth/config.js";
import {
  decideAuthorizationRequest,
  getAuthorizationRequest,
} from "../mcp-oauth/oauth-service.js";
import { createPageCenterMetaRouter } from "./meta-oauth/meta.routes.js";

const MODULE_ID = "page-center-v2";
const CONTRACT_VERSION = "2026-09-03.stage-5";

export function createPageCenterV2Router(
  environment: PageCenterV2Environment = process.env,
) {
  const router = Router();

  router.use("/meta", createPageCenterMetaRouter(environment as NodeJS.ProcessEnv & PageCenterV2Environment));

  router.get("/access", (req: PageCenterV2Request, res) => {
    noStore(res);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: "PAGE_CENTER_V2_UNAUTHENTICATED",
        message: "请先登录后再检查公共主页中心访问状态。",
      });
    }

    const decision = evaluatePageCenterV2Access(req.user, environment);

    return res.json({
      success: true,
      data: {
        module: MODULE_ID,
        available: decision.available,
        cohort: decision.cohort,
        reason: decision.reason,
      },
    });
  });

  router.get("/overview", requirePageCenterV2(environment), (req: PageCenterV2Request, res) => {
    noStore(res);

    return res.json({
      success: true,
      data: {
        module: MODULE_ID,
        contractVersion: CONTRACT_VERSION,
        cohort: req.pageCenterV2Access?.cohort || "B",
        mode: "tools",
        readOnly: false,
        sections: [
          {
            id: "oauth",
            title: "OAuth 连接",
            description: "网站用户可通过 OAuth 2.1 + PKCE 授权 MCP 客户端。",
            phase: 3,
            status: "ready",
          },
          {
            id: "pages",
            title: "主页授权",
            description: "用户级 Meta OAuth、主页清单和权限校验已独立接入。",
            phase: 4,
            status: "ready",
          },
          {
            id: "tools",
            title: "主页工具",
            description: "主页读取、发帖、评论和删除 MCP 工具已受控接入。",
            phase: 5,
            status: "ready",
          },
        ],
        capabilities: {
          connectOAuth: true,
          listPages: true,
          readPosts: true,
          publishPosts: true,
          manageComments: true,
        },
      },
    });
  });

  router.get("/oauth/requests/:id", requirePageCenterV2(environment), async (req: PageCenterV2Request, res) => {
    try {
      const request = await getAuthorizationRequest(req.params.id);
      return res.json({
        success: true,
        data: {
          id: request.id,
          clientName: request.clientName,
          scope: String(request.scope).split(/\s+/).filter(Boolean),
          resource: request.resource,
          expiresAt: request.expiresAt,
        },
      });
    } catch {
      return res.status(404).json({
        success: false,
        code: "MCP_OAUTH_REQUEST_NOT_FOUND",
        message: "授权请求不存在、已过期或已处理。",
      });
    }
  });

  router.post("/oauth/requests/:id/decision", requirePageCenterV2(environment), async (req: PageCenterV2Request, res) => {
    if (typeof req.body?.approved !== "boolean") {
      return res.status(400).json({ success: false, code: "MCP_OAUTH_INVALID_DECISION" });
    }
    try {
      const redirectUrl = await decideAuthorizationRequest(
        req.params.id,
        req.user!,
        req.body.approved,
        getMcpOAuthIssuer(req, environment),
      );
      return res.json({ success: true, data: { redirectUrl } });
    } catch {
      return res.status(409).json({
        success: false,
        code: "MCP_OAUTH_REQUEST_ALREADY_HANDLED",
        message: "授权请求已过期或已处理，请从客户端重新发起连接。",
      });
    }
  });

  return router;
}

export default createPageCenterV2Router();
