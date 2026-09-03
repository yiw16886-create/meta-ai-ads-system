import type { Request } from "express";
import { getAllowedClientMetadataOrigins } from "../mcp-oauth/config.js";
import {
  getPageCenterGraphVersion,
  loadPageCenterMetaCredentials,
  type PageCenterMetaEnvironment,
} from "./meta-oauth/config.js";
import { assertPageCenterTokenEncryptionConfigured } from "./meta-oauth/token-cipher.js";

type ReadinessEnvironment = PageCenterMetaEnvironment & {
  DATABASE_URL?: string;
  MCP_OAUTH_ISSUER?: string;
  MCP_OAUTH_CLIENT_METADATA_ORIGINS?: string;
  PAGE_CENTER_V2_ENABLED?: string;
  PAGE_CENTER_V2_ALLOWLIST?: string;
  PAGE_CENTER_TOKEN_ENCRYPTION_KEY?: string;
};

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export type PageCenterReadinessCheck = {
  id:
    | "database"
    | "metaApp"
    | "graphVersion"
    | "tokenEncryption"
    | "metaRedirect"
    | "mcpIssuer"
    | "clientMetadataOrigins"
    | "bCohort";
  label: string;
  ready: boolean;
  code: string;
};

function validHttpsOrigin(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value.replace(/\/$/, "");
  } catch {
    return false;
  }
}

function validMetaRedirect(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/api/page-center-v2/meta/callback" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function enabled(value: string | undefined) {
  return ENABLED_VALUES.has((value || "").trim().toLowerCase());
}

export async function getPageCenterReadiness(
  _request: Pick<Request, "protocol" | "get">,
  environment: ReadinessEnvironment = process.env,
) {
  let metaAppReady = false;
  try {
    await loadPageCenterMetaCredentials(environment);
    metaAppReady = true;
  } catch {
    metaAppReady = false;
  }

  let graphVersionReady = false;
  try {
    getPageCenterGraphVersion(environment);
    graphVersionReady = true;
  } catch {
    graphVersionReady = false;
  }

  let encryptionReady = false;
  try {
    assertPageCenterTokenEncryptionConfigured(environment);
    encryptionReady = true;
  } catch {
    encryptionReady = false;
  }

  let clientOriginsReady = false;
  try {
    clientOriginsReady =
      configured(environment.MCP_OAUTH_CLIENT_METADATA_ORIGINS) &&
      getAllowedClientMetadataOrigins(environment).has("https://chatgpt.com");
  } catch {
    clientOriginsReady = false;
  }

  const databaseReady = configured(environment.DATABASE_URL);
  const metaRedirectReady = validMetaRedirect(environment.PAGE_CENTER_META_REDIRECT_URI);
  const mcpIssuerReady = validHttpsOrigin(environment.MCP_OAUTH_ISSUER);
  const bCohortReady =
    enabled(environment.PAGE_CENTER_V2_ENABLED) &&
    configured(environment.PAGE_CENTER_V2_ALLOWLIST);

  const checks: PageCenterReadinessCheck[] = [
    {
      id: "database",
      label: "Preview PostgreSQL 数据库",
      ready: databaseReady,
      code: databaseReady ? "READY" : "DATABASE_URL_MISSING",
    },
    {
      id: "metaApp",
      label: "Meta App ID 与 App Secret",
      ready: metaAppReady,
      code: metaAppReady ? "READY" : "META_APP_CREDENTIALS_MISSING",
    },
    {
      id: "graphVersion",
      label: "Meta Graph API 版本",
      ready: graphVersionReady,
      code: graphVersionReady ? "READY" : "META_GRAPH_API_VERSION_INVALID",
    },
    {
      id: "tokenEncryption",
      label: "Page Token 加密密钥",
      ready: encryptionReady,
      code: encryptionReady ? "READY" : "TOKEN_ENCRYPTION_KEY_INVALID",
    },
    {
      id: "metaRedirect",
      label: "Meta OAuth 精确回调地址",
      ready: metaRedirectReady,
      code: metaRedirectReady ? "READY" : "META_REDIRECT_URI_INVALID",
    },
    {
      id: "mcpIssuer",
      label: "MCP OAuth 稳定签发地址",
      ready: mcpIssuerReady,
      code: mcpIssuerReady ? "READY" : "MCP_OAUTH_ISSUER_INVALID",
    },
    {
      id: "clientMetadataOrigins",
      label: "ChatGPT 客户端元数据来源",
      ready: clientOriginsReady,
      code: clientOriginsReady ? "READY" : "CHATGPT_ORIGIN_NOT_ALLOWED",
    },
    {
      id: "bCohort",
      label: "Page Center B 组开关与名单",
      ready: bCohortReady,
      code: bCohortReady ? "READY" : "B_COHORT_NOT_CONFIGURED",
    },
  ];

  return {
    ready: checks.every((check) => check.ready),
    checks,
    externalChecks: [
      {
        id: "deploymentProtection",
        label: "OAuth 与 MCP 地址可被 ChatGPT 直接访问",
        status: "manual" as const,
      },
      {
        id: "databaseMigrations",
        label: "阶段 3–5 Prisma 迁移已部署",
        status: "manual" as const,
      },
      {
        id: "metaPermissions",
        label: "Meta 权限及主页任务已实际授权",
        status: "manual" as const,
      },
    ],
  };
}
