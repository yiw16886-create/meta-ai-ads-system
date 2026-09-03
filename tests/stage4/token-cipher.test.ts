import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptPageCenterToken,
  encryptPageCenterToken,
} from "../../server/features/page-center-v2/meta-oauth/token-cipher.js";

const environment = {
  PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "11".repeat(32),
};

test("Page Center tokens use randomized authenticated encryption", () => {
  const first = encryptPageCenterToken("secret-page-token", environment);
  const second = encryptPageCenterToken("secret-page-token", environment);
  assert.notEqual(first, second);
  assert.equal(first.includes("secret-page-token"), false);
  assert.equal(decryptPageCenterToken(first, environment), "secret-page-token");
});

test("token encryption fails closed for missing, malformed or mismatched keys", () => {
  assert.throws(() => encryptPageCenterToken("token", {}), /KEY_MISSING/);
  assert.throws(
    () => encryptPageCenterToken("token", { PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "short" }),
    /KEY_INVALID/,
  );
  const sealed = encryptPageCenterToken("token", environment);
  assert.throws(
    () => decryptPageCenterToken(sealed, { PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "22".repeat(32) }),
    /DECRYPTION_FAILED/,
  );
});
