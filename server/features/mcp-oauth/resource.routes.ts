import { Router, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getMcpOAuthIssuer, getMcpResource, MCP_OAUTH_SCOPES } from "./config.js";
import { validateAccessToken } from "./oauth-service.js";

function bearerToken(value: string | undefined) {
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export function createMcpOAuthResourceRouter(environment = process.env) {
  const router = Router();

  const metadata = (req: any, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      resource: getMcpResource(req, environment),
      authorization_servers: [getMcpOAuthIssuer(req, environment)],
      scopes_supported: MCP_OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
    });
  };

  router.get("/.well-known/oauth-protected-resource", metadata);
  router.get("/.well-known/oauth-protected-resource/page-center-v2/mcp", metadata);

  router.all("/page-center-v2/mcp", async (req, res) => {
    const resource = getMcpResource(req, environment);
    const metadataUrl = `${getMcpOAuthIssuer(req, environment)}/.well-known/oauth-protected-resource/page-center-v2/mcp`;
    const token = await validateAccessToken(bearerToken(req.get("authorization")), resource, "page_center:read");
    if (!token) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl}", scope="page_center:read"`);
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "OAuth access token required" },
        id: req.body?.id ?? null,
      });
    }

    if (req.method === "GET" || !req.body?.method) {
      return res.json({
        name: "page-center-v2",
        version: "3.0.0",
        status: "ready",
        mode: "oauth-skeleton",
      });
    }

    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = new McpServer({ name: "page-center-v2", version: "3.0.0" });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: error?.message || "Internal server error" },
          id: req.body?.id ?? null,
        });
      }
    }
  });

  return router;
}

export default createMcpOAuthResourceRouter();
