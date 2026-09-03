import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stage 4 changes only add isolated Page Center tables", async () => {
  const migration = await readFile(
    new URL("../../prisma/migrations/20260903000000_add_page_center_meta_oauth/migration.sql", import.meta.url),
    "utf8",
  );
  assert.equal(migration.includes("ALTER TABLE"), false);
  assert.ok(migration.includes('CREATE TABLE "PageCenterMetaAuthorization"'));
  assert.ok(migration.includes('CREATE TABLE "PageCenterAuthorizedPage"'));
});

test("Stage 4 does not import or trigger legacy page, ad or shop sync services", async () => {
  const service = await readFile(
    new URL("../../server/features/page-center-v2/meta-oauth/meta-service.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of ["triggerInitialFullSync", "MetaPageManagerService", "FacebookPage", "AdAccount", "Store"]) {
    assert.equal(service.includes(forbidden), false, `unexpected legacy dependency: ${forbidden}`);
  }
});

test("only the exact Page Center Meta callback is added to the public boundary", async () => {
  const routeIndex = await readFile(new URL("../../server/routes/index.ts", import.meta.url), "utf8");
  assert.ok(routeIndex.includes('reqPath === "/page-center-v2/meta/callback"'));
  assert.ok(routeIndex.includes('cleanOriginalUrl === "/api/page-center-v2/meta/callback"'));
  assert.equal(routeIndex.includes('startsWith("/page-center-v2/meta")'), false);
});
