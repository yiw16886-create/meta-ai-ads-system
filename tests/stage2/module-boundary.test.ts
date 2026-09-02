import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy Page Management and Page Center V2 use separate route prefixes", async () => {
  const routeIndex = await readFile(
    new URL("../../server/routes/index.ts", import.meta.url),
    "utf8",
  );

  assert.ok(routeIndex.includes('routes.use("/pages", pageManageRoutes)'));
  assert.ok(routeIndex.includes('routes.use("/page-center-v2", pageCenterV2Routes)'));
});

test("the Page Center V2 skeleton has no legacy controller, service, or database dependency", async () => {
  const routeSource = await readFile(
    new URL(
      "../../server/features/page-center-v2/page-center-v2.routes.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const forbiddenDependencies = [
    "pageManageRoutes",
    "MetaPageManagerService",
    "page.controller",
    "pageComment.controller",
    "db/index",
    "prisma",
  ];

  for (const dependency of forbiddenDependencies) {
    assert.equal(
      routeSource.includes(dependency),
      false,
      `unexpected Stage 2 dependency: ${dependency}`,
    );
  }
});

test("the new frontend module calls only the isolated Page Center V2 API", async () => {
  const apiSource = await readFile(
    new URL("../../src/features/page-center-v2/api.ts", import.meta.url),
    "utf8",
  );
  const dashboardSource = await readFile(
    new URL("../../src/components/Dashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(apiSource.includes("/api/page-center-v2/access"));
  assert.ok(apiSource.includes("/api/page-center-v2/overview"));
  assert.equal(apiSource.includes("/api/pages"), false);
  assert.ok(dashboardSource.includes("<PageCommentManager />"));
  assert.ok(dashboardSource.includes("<PageCenterV2 />"));
});
