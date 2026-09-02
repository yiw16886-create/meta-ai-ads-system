import { Request, Response, Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import prisma from "../db/index.js";
import { getMetaToken } from "./utils.js";
import { MetaPageManagerService } from "./services/metaPageManager.service.js";
import {
  legacyMcpWritesEnabled,
  validateMcpAuthHeaders,
  type McpAuthDecision,
} from "./security/mcp-auth.js";
import axios from "axios";
import mcpOAuthRouter from "./features/mcp-oauth/oauth.routes.js";
import mcpOAuthResourceRouter from "./features/mcp-oauth/resource.routes.js";

// Active SSE Transports Map
const sseTransports = new Map<string, { transport: SSEServerTransport; server: McpServer }>();

type UnifiedMcpServerOptions = {
  legacyWritesEnabled?: boolean;
};

function legacyWriteBlocked(toolName: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: false,
          code: "LEGACY_MCP_WRITES_DISABLED",
          message: `旧版 MCP 写操作 ${toolName} 在迁移期间已停用，请改用 Page Center V2。`,
        }),
      },
    ],
    isError: true,
  };
}

export function createUnifiedMcpServer(options: UnifiedMcpServerOptions = {}): McpServer {
  const allowLegacyWrites =
    options.legacyWritesEnabled ?? legacyMcpWritesEnabled();
  const server = new McpServer({
    name: "meta-ads-and-page-manager",
    version: "3.0.0",
  });

  // 1. Tool: List Facebook Pages
  server.tool(
    "list_facebook_pages",
    "获取系统当前绑定的所有 Facebook 公共主页列表（包含主页名称、ID、分类及连接状态）",
    {},
    async () => {
      try {
        const pages = await prisma.facebookPage.findMany({
          orderBy: { created_at: "desc" },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                count: pages.length,
                pages: pages.map((p) => ({
                  id: p.id,
                  name: p.page_name,
                  shop_id: p.shop_id,
                  is_active: p.is_active,
                  has_token: !!p.access_token,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `获取公共主页列表失败: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. Tool: Get Page Regular Posts
  server.tool(
    "get_page_posts",
    "获取指定 Facebook 公共主页的普通帖子流（包含贴文内容、配图、发布时间及永久链接）",
    {
      pageId: z.string().describe("Facebook 公共主页 ID"),
    },
    async ({ pageId }) => {
      try {
        const result = await MetaPageManagerService.fetchPagePosts(pageId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                pageId,
                total: result.posts.length,
                warnings: result.warnings,
                posts: result.posts.map((p: any) => ({
                  id: p.id,
                  message: p.message || p.story || "",
                  created_time: p.created_time,
                  picture: p.preview_url || p.full_picture || p.picture || null,
                  permalink_url: p.permalink_url || null,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `抓取主页帖子失败: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. Tool: Publish Post to Facebook Page
  server.tool(
    "publish_page_post",
    "在指定的 Facebook 公共主页上发布新的图文动态或纯文本动态",
    {
      pageId: z.string().describe("Facebook 公共主页 ID"),
      message: z.string().describe("贴文正文文案内容"),
      imageUrl: z.string().optional().describe("可选的图片公网 URL 地址"),
    },
    async ({ pageId, message, imageUrl }) => {
      if (!allowLegacyWrites) {
        return legacyWriteBlocked("publish_page_post");
      }

      try {
        const page = await prisma.facebookPage.findUnique({ where: { id: pageId } });
        if (!page || !page.access_token) {
          throw new Error("找不到该公共主页或主页未获取到授权 Token");
        }

        let metaRes;
        if (imageUrl && imageUrl.trim().startsWith("http")) {
          // 带图贴文
          metaRes = await axios.post(
            `https://graph.facebook.com/v20.0/${pageId}/photos`,
            {
              url: imageUrl.trim(),
              caption: message,
              published: true,
              access_token: page.access_token,
            }
          );
        } else {
          // 纯文本贴文
          metaRes = await axios.post(
            `https://graph.facebook.com/v20.0/${pageId}/feed`,
            {
              message,
              published: true,
              access_token: page.access_token,
            }
          );
        }

        const postId = metaRes.data?.id || metaRes.data?.post_id;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "贴文发布成功！",
                postId,
                pageId,
                raw: metaRes.data,
              }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        const errorMsg = err.response?.data?.error?.error_user_msg || err.response?.data?.error?.message || err.message;
        return {
          content: [{ type: "text", text: `发布主页贴文失败: ${errorMsg}` }],
          isError: true,
        };
      }
    }
  );

  // 4. Tool: Get Ad Accounts & Balance
  server.tool(
    "get_ad_accounts",
    "获取系统关联的所有 Meta 广告账户信息，包括账户余额、花费限额及投放状态",
    {},
    async () => {
      try {
        const token = await getMetaToken();
        if (!token) {
          throw new Error("未配置 Meta Access Token");
        }
        const res = await axios.get("https://graph.facebook.com/v20.0/me/adaccounts", {
          params: {
            fields: "name,account_id,account_status,amount_spent,balance,currency,spend_cap",
            access_token: token,
            limit: 100,
          },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                accounts: res.data?.data || [],
              }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `获取广告账户失败: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 5. Tool: Hide or Unhide Comment
  server.tool(
    "toggle_hide_comment",
    "对主页贴文下的指定评论执行隐藏或取消隐藏操作（控评防灌水）",
    {
      commentId: z.string().describe("Facebook 评论 ID"),
      isHidden: z.boolean().describe("true 为隐藏，false 为显示"),
    },
    async ({ commentId, isHidden }) => {
      if (!allowLegacyWrites) {
        return legacyWriteBlocked("toggle_hide_comment");
      }

      try {
        const comment = await prisma.adPostComment.findUnique({
          where: { id: commentId },
          include: { post: { include: { page: true } } },
        });
        if (!comment || !comment.post?.page?.access_token) {
          throw new Error("找不到该评论或缺少主页授权 Token");
        }
        await axios.post(`https://graph.facebook.com/v20.0/${commentId}`, {
          is_hidden: isHidden,
          access_token: comment.post.page.access_token,
        });
        await prisma.adPostComment.update({
          where: { id: commentId },
          data: { is_hidden: isHidden },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                commentId,
                is_hidden: isHidden,
                message: isHidden ? "评论已成功隐藏" : "评论已取消隐藏",
              }),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `操作评论失败: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

export const mcpRouter = Router();

// Page Center V2 OAuth routes are registered before legacy discovery and MCP routes.
mcpRouter.use(mcpOAuthRouter);
mcpRouter.use(mcpOAuthResourceRouter);

// 1. RFC 8414 OAuth Authorization Server Discovery & Metadata
mcpRouter.get("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
  const host = req.get("host") || "ais-pre-4joetnk37juysrnaweg4cx-659177948337.us-east1.run.app";
  const protocol = req.protocol === "http" && !req.get("x-forwarded-proto") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    scopes_supported: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_read_user_content",
      "pages_manage_engagement",
      "ads_read",
      "ads_management"
    ],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    code_challenge_methods_supported: ["S256", "plain"]
  });
});

mcpRouter.get("/.well-known/openid-configuration", (req: Request, res: Response) => {
  const host = req.get("host") || "ais-pre-4joetnk37juysrnaweg4cx-659177948337.us-east1.run.app";
  const protocol = req.protocol === "http" && !req.get("x-forwarded-proto") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    scopes_supported: ["openid", "profile", "email"],
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"]
  });
});

// 2. Stage-1 service authentication for the legacy MCP endpoint.
function rejectMcpAuth(res: Response, decision: McpAuthDecision, requestId: unknown) {
  if (!("reason" in decision)) return false;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("WWW-Authenticate", 'Bearer realm="meta-ads-and-page-manager"');

  const missingConfiguration = decision.reason === "missing_configuration";
  res.status(missingConfiguration ? 503 : 401).json({
    jsonrpc: "2.0",
    error: {
      code: missingConfiguration ? -32002 : -32001,
      message: missingConfiguration
        ? "MCP authentication is not configured"
        : "Unauthorized: valid MCP credentials are required",
    },
    id: requestId ?? null,
  });
  return true;
}

// 3. MCP Streamable HTTP Endpoint (POST /mcp or POST /api/mcp)
const handleStreamableMcp = async (req: Request, res: Response) => {
  const authDecision = validateMcpAuthHeaders(req.headers);
  if (rejectMcpAuth(res, authDecision, req.body?.id)) {
    return;
  }

  // If body is empty or not JSON-RPC (e.g., simple GET or empty POST)
  if (!req.body || typeof req.body !== "object" || !req.body.method) {
    // Return server info
    return res.json({
      name: "meta-ads-and-page-manager",
      version: "3.0.0",
      status: "ready",
      transport: ["streamable-http", "sse"],
      endpoints: {
        mcp: "/mcp",
        sse: "/sse",
        discovery: "/.well-known/oauth-authorization-server"
      }
    });
  }

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createUnifiedMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (error: any) {
    console.error("MCP Request Error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error.message || "Internal server error" },
        id: req.body?.id || null,
      });
    }
  }
};

// 4. MCP SSE Endpoint (GET /sse or GET /mcp/sse or GET /mcp)
const handleSseMcp = async (req: Request, res: Response) => {
  // Check if client expects SSE stream (Accept header contains text/event-stream or default GET /sse)
  const acceptHeader = req.headers.accept || "";
  const isSse = acceptHeader.includes("text/event-stream") || req.path === "/sse" || req.path === "/mcp/sse";

  if (!isSse && req.path === "/mcp") {
    // Return info for standard browser GET
    return res.json({
      name: "meta-ads-and-page-manager",
      version: "3.0.0",
      status: "ready",
      mcp_endpoint: "/mcp",
      sse_endpoint: "/sse",
      docs: "Connect via MCP Protocol (Streamable HTTP POST or SSE GET)"
    });
  }

  const authDecision = validateMcpAuthHeaders(req.headers);
  if (rejectMcpAuth(res, authDecision, null)) {
    return;
  }

  try {
    const transport = new SSEServerTransport("/mcp/message", res);
    const server = createUnifiedMcpServer();
    await server.connect(transport);

    const sessionId = transport.sessionId;
    sseTransports.set(sessionId, { transport, server });

    req.on("close", () => {
      sseTransports.delete(sessionId);
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (error: any) {
    console.error("MCP SSE Error:", error);
    if (!res.headersSent) {
      res.status(500).send("Error establishing SSE connection");
    }
  }
};

// 5. MCP Message POST for SSE
const handleSseMessage = async (req: Request, res: Response) => {
  const authDecision = validateMcpAuthHeaders(req.headers);
  if (rejectMcpAuth(res, authDecision, req.body?.id)) {
    return;
  }

  const sessionId = req.query.sessionId as string;
  const session = sseTransports.get(sessionId);

  if (!session) {
    return res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session not found" },
      id: null,
    });
  }

  try {
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (error: any) {
    console.error("MCP SSE Message Error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error.message || "Internal server error" },
        id: null,
      });
    }
  }
};

// Bind Routes
mcpRouter.post("/mcp", handleStreamableMcp);
mcpRouter.post("/api/mcp", handleStreamableMcp);
mcpRouter.get("/mcp", handleSseMcp);
mcpRouter.get("/api/mcp", handleSseMcp);
mcpRouter.get("/sse", handleSseMcp);
mcpRouter.get("/mcp/sse", handleSseMcp);
mcpRouter.post("/mcp/message", handleSseMessage);
