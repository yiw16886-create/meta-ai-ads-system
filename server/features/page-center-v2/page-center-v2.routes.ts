import { Router, type NextFunction, type Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import {
  evaluatePageCenterV2Access,
  type PageCenterV2AccessDecision,
  type PageCenterV2Environment,
} from "./access.js";
import { getMcpOAuthIssuer } from "../mcp-oauth/config.js";
import {
  decideAuthorizationRequest,
  getAuthorizationRequest,
} from "../mcp-oauth/oauth-service.js";

type PageCenterV2Request = AuthenticatedRequest & {
  pageCenterV2Access?: PageCenterV2AccessDecision;
};

const MODULE_ID = "page-center-v2";
const CONTRACT_VERSION = "2026-09-02.stage-2";

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

export function requirePageCenterV2(environment: PageCenterV2Environment) {
  return (req: PageCenterV2Request, res: Response, next: NextFunction) => {
    noStore(res);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: "PAGE_CENTER_V2_UNAUTHENTICATED",
        message: "请先登录后再访问公共主页中心。",
      });
    }

    const decision = evaluatePageCenterV2Access(req.user, environment);
    req.pageCenterV2Access = decision;

    if (!decision.moduleEnabled) {
      return res.status(404).json({
        success: false,
        code: "PAGE_CENTER_V2_DISABLED",
        message: "公共主页中心 B 通道当前未启用。",
      });
    }

    if (!decision.available) {
      return res.status(403).json({
        success: false,
        code: "PAGE_CENTER_V2_NOT_IN_COHORT",
        message: "当前用户不在公共主页中心 B 组。",
      });
    }

    return next();
  };
}

export function createPageCenterV2Router(
  environment: PageCenterV2Environment = process.env,
) {
  const router = Router();

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
        mode: "skeleton",
        readOnly: true,
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
            description: "用户级 Meta 公共主页授权将在阶段 4 接入。",
            phase: 4,
            status: "planned",
          },
          {
            id: "tools",
            title: "主页工具",
            description: "读取、发帖和评论工具将在阶段 5 独立接入。",
            phase: 5,
            status: "planned",
          },
        ],
        capabilities: {
          connectOAuth: true,
          listPages: false,
          readPosts: false,
          publishPosts: false,
          manageComments: false,
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
