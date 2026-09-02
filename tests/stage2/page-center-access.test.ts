import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePageCenterV2Access } from "../../server/features/page-center-v2/access.js";

const actor = {
  id: 42,
  email: "owner@example.com",
  role: "SUPER_ADMIN",
  org_id: "org-1",
};

test("Page Center V2 is fail-closed when the global flag is absent", () => {
  const decision = evaluatePageCenterV2Access(actor, {});

  assert.equal(decision.available, false);
  assert.equal(decision.cohort, "A");
  assert.equal(decision.reason, "global_disabled");
});

test("an enabled flag does not grant access without an explicit allowlist match", () => {
  const decision = evaluatePageCenterV2Access(actor, {
    PAGE_CENTER_V2_ENABLED: "true",
  });

  assert.equal(decision.available, false);
  assert.equal(decision.cohort, "A");
  assert.equal(decision.reason, "not_allowlisted");
});

test("a user ID can place an authenticated user in cohort B", () => {
  const decision = evaluatePageCenterV2Access(actor, {
    PAGE_CENTER_V2_ENABLED: "yes",
    PAGE_CENTER_V2_ALLOWLIST: "id:42",
  });

  assert.equal(decision.available, true);
  assert.equal(decision.cohort, "B");
  assert.equal(decision.reason, "allowlisted");
});

test("email allowlist matching is trimmed and case-insensitive", () => {
  const decision = evaluatePageCenterV2Access(actor, {
    PAGE_CENTER_V2_ENABLED: "1",
    PAGE_CENTER_V2_ALLOWLIST: " email:OWNER@EXAMPLE.COM ",
  });

  assert.equal(decision.available, true);
  assert.equal(decision.cohort, "B");
});

test("wildcards and roles never grant cohort B access", () => {
  const decision = evaluatePageCenterV2Access(actor, {
    PAGE_CENTER_V2_ENABLED: "on",
    PAGE_CENTER_V2_ALLOWLIST: "*,SUPER_ADMIN,role:SUPER_ADMIN",
  });

  assert.equal(decision.available, false);
  assert.equal(decision.cohort, "A");
});

test("an unauthenticated request cannot enter cohort B", () => {
  const decision = evaluatePageCenterV2Access(undefined, {
    PAGE_CENTER_V2_ENABLED: "true",
    PAGE_CENTER_V2_ALLOWLIST: "id:42",
  });

  assert.equal(decision.available, false);
  assert.equal(decision.reason, "unauthenticated");
});
