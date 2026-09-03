import assert from "node:assert/strict";
import test from "node:test";
import {
  getPageCenterGraphVersion,
  loadPageCenterMetaConfig,
} from "../../server/features/page-center-v2/meta-oauth/config.js";
import { getPageCenterReadiness } from "../../server/features/page-center-v2/readiness.js";

const request = {
  protocol: "https",
  get: (name: string) => name === "host" ? "preview.example.com" : undefined,
} as any;

const readyEnvironment = {
  DATABASE_URL: "postgresql://configured.invalid/database",
  META_APP_ID: "configured-app-id",
  META_APP_SECRET: "configured-app-secret",
  META_GRAPH_API_VERSION: "v99.0",
  PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "44".repeat(32),
  PAGE_CENTER_META_REDIRECT_URI: "https://preview.example.com/api/page-center-v2/meta/callback",
  MCP_OAUTH_ISSUER: "https://preview.example.com",
  MCP_OAUTH_CLIENT_METADATA_ORIGINS: "https://chatgpt.com",
  PAGE_CENTER_V2_ENABLED: "true",
  PAGE_CENTER_V2_ALLOWLIST: "id:42",
};

test("Stage 6 requires an explicit well-formed Graph API version", async () => {
  assert.equal(getPageCenterGraphVersion(readyEnvironment), "v99.0");
  assert.throws(() => getPageCenterGraphVersion({}), /GRAPH_VERSION_MISSING/);
  assert.throws(
    () => getPageCenterGraphVersion({ META_GRAPH_API_VERSION: "latest" }),
    /GRAPH_VERSION_INVALID/,
  );
  await assert.rejects(
    loadPageCenterMetaConfig(request, {
      META_APP_ID: "app",
      META_APP_SECRET: "secret",
      PAGE_CENTER_META_REDIRECT_URI: readyEnvironment.PAGE_CENTER_META_REDIRECT_URI,
    }),
    /GRAPH_VERSION_MISSING/,
  );
});

test("Stage 6 readiness reports only status and never secret values", async () => {
  const result = await getPageCenterReadiness(request, readyEnvironment);
  assert.equal(result.ready, true);
  assert.equal(result.checks.length, 8);
  assert.equal(result.externalChecks.length, 3);
  const serialized = JSON.stringify(result);
  for (const secret of [
    readyEnvironment.DATABASE_URL,
    readyEnvironment.META_APP_ID,
    readyEnvironment.META_APP_SECRET,
    readyEnvironment.PAGE_CENTER_TOKEN_ENCRYPTION_KEY,
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("Stage 6 readiness fails closed on unstable or incomplete configuration", async () => {
  const result = await getPageCenterReadiness(request, {
    ...readyEnvironment,
    DATABASE_URL: "",
    META_GRAPH_API_VERSION: "v20",
    PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "too-short",
    PAGE_CENTER_META_REDIRECT_URI: "http://preview.example.com/wrong",
    MCP_OAUTH_ISSUER: "https://preview.example.com/path",
    MCP_OAUTH_CLIENT_METADATA_ORIGINS: "https://example.com",
  });
  assert.equal(result.ready, false);
  const failed = new Set(result.checks.filter((check) => !check.ready).map((check) => check.id));
  for (const id of [
    "database",
    "graphVersion",
    "tokenEncryption",
    "metaRedirect",
    "mcpIssuer",
    "clientMetadataOrigins",
  ]) {
    assert.equal(failed.has(id as any), true);
  }
});
