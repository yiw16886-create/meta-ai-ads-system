import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const protectedRouteMounts = [
  'routes.use("/stores", storesRoutes)',
  'routes.use("/accounts", accountsRoutes)',
  'routes.use("/materials", materialRoutes)',
  'routes.use("/bms", bmsRoutes)',
  'routes.use("/insights", insightsRoutes)',
  'routes.use("/mappings", mappingsRoutes)',
  'routes.use("/monitoring", monitoringRoutes)',
  'routes.use("/dashboard", dashboardRoutes)',
  'routes.use("/ad-operations", adOperationsRoutes)',
];

test("protected dashboard, monitoring, store, material, and ad routes remain mounted", async () => {
  const routeIndex = await readFile(new URL("../../server/routes/index.ts", import.meta.url), "utf8");

  for (const routeMount of protectedRouteMounts) {
    assert.ok(routeIndex.includes(routeMount), `missing protected route mount: ${routeMount}`);
  }
});

test("MCP remains isolated from the existing /api application router", async () => {
  const serverSource = await readFile(new URL("../../server/server.ts", import.meta.url), "utf8");
  assert.ok(serverSource.includes("app.use(mcpRouter)"));
  assert.ok(serverSource.includes('app.use("/api", routes)'));
});
