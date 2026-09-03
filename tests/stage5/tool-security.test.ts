import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCommentBelongsToPage,
  assertPostBelongsToPage,
  requireConfirmation,
  validatePublicImageUrl,
} from "../../server/features/page-center-v2/tools/tool-security.js";

test("write confirmation requires the exact action-specific phrase", () => {
  assert.doesNotThrow(() => requireConfirmation(true, "PUBLISH:123", "PUBLISH:123"));
  assert.throws(() => requireConfirmation(false, "PUBLISH:123", "PUBLISH:123"), /CONFIRMATION_REQUIRED/);
  assert.throws(() => requireConfirmation(true, "PUBLISH:999", "PUBLISH:123"), /CONFIRMATION_REQUIRED/);
});

test("image validation permits only credential-free public HTTPS URLs", async () => {
  assert.equal(
    await validatePublicImageUrl("https://cdn.example.com/image.jpg", async () => true),
    "https://cdn.example.com/image.jpg",
  );
  await assert.rejects(
    validatePublicImageUrl("http://cdn.example.com/image.jpg", async () => true),
    /IMAGE_URL_INVALID/,
  );
  await assert.rejects(
    validatePublicImageUrl("https://127.0.0.1/image.jpg", async () => false),
    /IMAGE_URL_UNSAFE/,
  );
});

test("post and comment targets must resolve to the selected Page", () => {
  assert.doesNotThrow(() => assertPostBelongsToPage({ id: "123_456" }, "123"));
  assert.throws(() => assertPostBelongsToPage({ id: "999_456" }, "123"), /OWNERSHIP_MISMATCH/);
  assert.doesNotThrow(() => assertCommentBelongsToPage({ parent: { id: "123_456" } }, "123"));
  assert.throws(
    () => assertCommentBelongsToPage({ parent: { id: "999_456" } }, "123"),
    /OWNERSHIP_MISMATCH/,
  );
});
