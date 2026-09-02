import type { Request } from "express";

export const MCP_OAUTH_SCOPES = ["page_center:read", "page_center:write"] as const;

function normalizeOrigin(value: string) {
  return new URL(value).origin;
}

export function getMcpOAuthIssuer(req: Request, environment = process.env) {
  if (environment.MCP_OAUTH_ISSUER) {
    return normalizeOrigin(environment.MCP_OAUTH_ISSUER);
  }

  if (environment.VERCEL_URL) {
    return normalizeOrigin(`https://${environment.VERCEL_URL}`);
  }

  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = req.get("host");
  if (!host) throw new Error("Unable to determine the OAuth issuer");
  return normalizeOrigin(`${protocol}://${host}`);
}

export function getMcpResource(req: Request, environment = process.env) {
  return `${getMcpOAuthIssuer(req, environment)}/page-center-v2/mcp`;
}

export function getAllowedClientMetadataOrigins(environment = process.env) {
  return new Set(
    (environment.MCP_OAUTH_CLIENT_METADATA_ORIGINS || "https://chatgpt.com")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeOrigin),
  );
}
