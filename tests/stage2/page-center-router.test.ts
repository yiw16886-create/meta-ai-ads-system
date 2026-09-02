import assert from "node:assert/strict";
import { type AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import { createPageCenterV2Router } from "../../server/features/page-center-v2/page-center-v2.routes.js";
import type { PageCenterV2Actor, PageCenterV2Environment } from "../../server/features/page-center-v2/access.js";

async function startRouter(
  environment: PageCenterV2Environment,
  actor?: PageCenterV2Actor,
) {
  const app = express();

  if (actor) {
    app.use((req, _res, next) => {
      (req as typeof req & { user: PageCenterV2Actor }).user = actor;
      next();
    });
  }

  app.use(createPageCenterV2Router(environment));

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const actor = { id: 42, email: "owner@example.com" };

test("the access endpoint still requires an authenticated website user", async () => {
  const { server, baseUrl } = await startRouter({
    PAGE_CENTER_V2_ENABLED: "true",
    PAGE_CENTER_V2_ALLOWLIST: "id:42",
  });

  try {
    const response = await fetch(`${baseUrl}/access`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  } finally {
    await stopServer(server);
  }
});

test("the access endpoint reports cohort B without exposing the allowlist", async () => {
  const { server, baseUrl } = await startRouter(
    {
      PAGE_CENTER_V2_ENABLED: "true",
      PAGE_CENTER_V2_ALLOWLIST: "id:42,private@example.com",
    },
    actor,
  );

  try {
    const response = await fetch(`${baseUrl}/access`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.available, true);
    assert.equal(body.data.cohort, "B");
    assert.equal(JSON.stringify(body).includes("private@example.com"), false);
  } finally {
    await stopServer(server);
  }
});

test("the overview endpoint is unavailable while the global flag is disabled", async () => {
  const { server, baseUrl } = await startRouter(
    { PAGE_CENTER_V2_ALLOWLIST: "id:42" },
    actor,
  );

  try {
    const response = await fetch(`${baseUrl}/overview`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.code, "PAGE_CENTER_V2_DISABLED");
  } finally {
    await stopServer(server);
  }
});

test("the overview endpoint rejects authenticated cohort A users", async () => {
  const { server, baseUrl } = await startRouter(
    {
      PAGE_CENTER_V2_ENABLED: "true",
      PAGE_CENTER_V2_ALLOWLIST: "id:99",
    },
    actor,
  );

  try {
    const response = await fetch(`${baseUrl}/overview`);
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.code, "PAGE_CENTER_V2_NOT_IN_COHORT");
  } finally {
    await stopServer(server);
  }
});

test("cohort B receives a read-only skeleton with every write capability disabled", async () => {
  const { server, baseUrl } = await startRouter(
    {
      PAGE_CENTER_V2_ENABLED: "true",
      PAGE_CENTER_V2_ALLOWLIST: "owner@example.com",
    },
    actor,
  );

  try {
    const response = await fetch(`${baseUrl}/overview`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.module, "page-center-v2");
    assert.equal(body.data.readOnly, true);
    assert.equal(body.data.cohort, "B");
    assert.equal(body.data.sections.length, 3);
    assert.equal(Object.values(body.data.capabilities).some(Boolean), false);
  } finally {
    await stopServer(server);
  }
});
