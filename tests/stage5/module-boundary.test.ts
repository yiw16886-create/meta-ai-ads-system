import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stage 5 migration adds only the isolated idempotency table", async () => {
  const migration = await readFile(
    new URL("../../prisma/migrations/20260903010000_add_page_center_action_receipts/migration.sql", import.meta.url),
    "utf8",
  );
  assert.ok(migration.includes('CREATE TABLE "PageCenterActionReceipt"'));
  assert.equal(migration.includes("ALTER TABLE"), false);
});

test("Stage 5 tools never import the legacy page manager or global FacebookPage model", async () => {
  const files = ["tool-handlers.ts", "tool-security.ts", "meta-pages-client.ts", "register-tools.ts"];
  for (const file of files) {
    const source = await readFile(
      new URL(`../../server/features/page-center-v2/tools/${file}`, import.meta.url),
      "utf8",
    );
    for (const forbidden of ["MetaPageManagerService", "facebookPage", "getMetaToken", "triggerInitialFullSync"]) {
      assert.equal(source.includes(forbidden), false, `${file} includes legacy dependency ${forbidden}`);
    }
  }
});
