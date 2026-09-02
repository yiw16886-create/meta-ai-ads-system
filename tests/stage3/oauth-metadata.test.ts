import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { validateClientMetadata } from "../../server/features/mcp-oauth/client-metadata.js";
import { createMcpOAuthRouter } from "../../server/features/mcp-oauth/oauth.routes.js";
import { createMcpOAuthResourceRouter } from "../../server/features/mcp-oauth/resource.routes.js";

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const environment = { MCP_OAUTH_ISSUER: "https://pages.example.com" };
  app.use(createMcpOAuthRouter(environment));
  app.use(createMcpOAuthResourceRouter(environment));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stop(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("authorization metadata advertises only OAuth code, refresh, S256 and public clients", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    const body = await response.json();
    assert.equal(body.issuer, "https://pages.example.com");
    assert.deepEqual(body.grant_types_supported, ["authorization_code", "refresh_token"]);
    assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(body.token_endpoint_auth_methods_supported, ["none"]);
    assert.equal(body.client_id_metadata_document_supported, true);
    assert.equal(body.authorization_response_iss_parameter_supported, true);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await stop(server);
  }
});

test("protected resource metadata binds the exact Page Center V2 MCP audience", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/page-center-v2/mcp`);
    const body = await response.json();
    assert.equal(body.resource, "https://pages.example.com/page-center-v2/mcp");
    assert.deepEqual(body.authorization_servers, ["https://pages.example.com"]);
    assert.deepEqual(body.bearer_methods_supported, ["header"]);
  } finally {
    await stop(server);
  }
});

test("unauthenticated MCP requests return a discoverable Bearer challenge", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/page-center-v2/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") || "", /resource_metadata="https:\/\/pages\.example\.com\//);
    assert.match(response.headers.get("www-authenticate") || "", /scope="page_center:read"/);
  } finally {
    await stop(server);
  }
});

test("CIMD accepts only allowlisted HTTPS origins and exact metadata", async () => {
  const clientId = "https://chatgpt.com/oauth/client.json";
  const fetcher = async () => new Response(JSON.stringify({
    client_id: clientId,
    client_name: "ChatGPT",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const client = await validateClientMetadata(clientId, {}, fetcher as typeof fetch);
  assert.equal(client.clientName, "ChatGPT");
  await assert.rejects(
    validateClientMetadata("https://internal.example.com/client.json", {}, fetcher as typeof fetch),
    /untrusted_client_metadata_origin/,
  );
});
