import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import express from "express";
import { createUnifiedMcpServer, mcpRouter } from "../../server/mcp.js";

let server: http.Server;
let baseUrl = "";

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(mcpRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("browser GET /mcp remains a public, read-only status response", async () => {
  const response = await fetch(`${baseUrl}/mcp`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ready");
});

test("POST /mcp fails closed when server credentials are not configured", async () => {
  const original = process.env.MCP_API_KEY;
  delete process.env.MCP_API_KEY;
  try {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 503);
  } finally {
    if (original === undefined) delete process.env.MCP_API_KEY;
    else process.env.MCP_API_KEY = original;
  }
});

test("POST /mcp rejects an invalid key and accepts a valid key", async () => {
  const original = process.env.MCP_API_KEY;
  process.env.MCP_API_KEY = "stage-1-test-key";
  try {
    const invalidResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-key",
      },
      body: JSON.stringify({}),
    });
    assert.equal(invalidResponse.status, 401);
    assert.match(invalidResponse.headers.get("www-authenticate") || "", /Bearer/);

    const validResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "stage-1-test-key",
      },
      body: JSON.stringify({}),
    });
    assert.equal(validResponse.status, 200);
    const body = await validResponse.json();
    assert.equal(body.status, "ready");
  } finally {
    if (original === undefined) delete process.env.MCP_API_KEY;
    else process.env.MCP_API_KEY = original;
  }
});

test("SSE and SSE message endpoints reject unauthenticated requests", async () => {
  const original = process.env.MCP_API_KEY;
  process.env.MCP_API_KEY = "stage-1-test-key";
  try {
    const sseResponse = await fetch(`${baseUrl}/sse`, {
      headers: { accept: "text/event-stream" },
    });
    assert.equal(sseResponse.status, 401);

    const messageResponse = await fetch(`${baseUrl}/mcp/message?sessionId=unknown`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1 }),
    });
    assert.equal(messageResponse.status, 401);
  } finally {
    if (original === undefined) delete process.env.MCP_API_KEY;
    else process.env.MCP_API_KEY = original;
  }
});

test("legacy publish tool is blocked before any database or Meta call", async () => {
  const mcpServer = createUnifiedMcpServer({ legacyWritesEnabled: false });
  const client = new Client({ name: "stage-1-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({
      name: "publish_page_post",
      arguments: {
        pageId: "test-page",
        message: "must not be published",
      },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /LEGACY_MCP_WRITES_DISABLED/);
  } finally {
    await client.close();
    await mcpServer.close();
  }
});
