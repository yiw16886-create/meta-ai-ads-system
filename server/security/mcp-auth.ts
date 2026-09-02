import crypto from "crypto";
import type { IncomingHttpHeaders } from "http";

export type McpAuthFailure =
  | "missing_configuration"
  | "missing_credentials"
  | "invalid_credentials";

export type McpAuthDecision =
  | { authorized: true }
  | { authorized: false; reason: McpAuthFailure };

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() || "";
  }
  return value?.trim() || "";
}

function bearerToken(value: string | string[] | undefined): string {
  const header = firstHeaderValue(value);
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || "";
}

/**
 * Hash both values before comparison so timingSafeEqual always receives
 * equal-length buffers. Empty credentials are rejected before comparison.
 */
export function constantTimeSecretEquals(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;

  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = crypto.createHash("sha256").update(supplied, "utf8").digest();
  return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
}

/**
 * Stage-1 service authentication for the legacy MCP endpoint.
 *
 * The endpoint fails closed when MCP_API_KEY is absent. Callers may provide
 * the key as either `Authorization: Bearer ...` or `X-API-Key: ...`.
 * Human/user OAuth is deliberately handled by the isolated Page Center phase.
 */
export function validateMcpAuthHeaders(
  headers: IncomingHttpHeaders,
  configuredKey = process.env.MCP_API_KEY,
): McpAuthDecision {
  const expected = configuredKey?.trim() || "";
  if (!expected) {
    return { authorized: false, reason: "missing_configuration" };
  }

  const candidates = [
    bearerToken(headers.authorization),
    firstHeaderValue(headers["x-api-key"]),
  ].filter(Boolean);

  if (candidates.length === 0) {
    return { authorized: false, reason: "missing_credentials" };
  }

  if (candidates.some((candidate) => constantTimeSecretEquals(expected, candidate))) {
    return { authorized: true };
  }

  return { authorized: false, reason: "invalid_credentials" };
}

export function legacyMcpWritesEnabled(
  value = process.env.MCP_LEGACY_WRITES_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
