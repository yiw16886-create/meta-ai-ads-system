import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stage 6 readiness stays inside the Page Center V2 route", async () => {
  const router = await readFile(
    new URL("../../server/features/page-center-v2/page-center-v2.routes.ts", import.meta.url),
    "utf8",
  );
  const readiness = await readFile(
    new URL("../../server/features/page-center-v2/readiness.ts", import.meta.url),
    "utf8",
  );
  assert.ok(router.includes('router.get("/readiness"'));
  for (const forbidden of ["MetaPageManagerService", "facebookPage", "getMetaToken", "triggerInitialFullSync"]) {
    assert.equal(readiness.includes(forbidden), false);
  }
});

test("Stage 6 removes the silent v20 Graph API fallback from Page Center", async () => {
  const sources = await Promise.all([
    "../../server/features/page-center-v2/meta-oauth/config.ts",
    "../../server/features/page-center-v2/tools/meta-pages-client.ts",
    "../../server/features/page-center-v2/tools/tool-handlers.ts",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  assert.equal(sources.some((source) => source.includes('|| "v20.0"')), false);
});
