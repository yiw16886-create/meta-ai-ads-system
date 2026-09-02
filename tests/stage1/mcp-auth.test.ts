import assert from "node:assert/strict";
import test from "node:test";
import {
  constantTimeSecretEquals,
  legacyMcpWritesEnabled,
  validateMcpAuthHeaders,
} from "../../server/security/mcp-auth.js";

test("constant-time comparison accepts only the exact secret", () => {
  assert.equal(constantTimeSecretEquals("correct-key", "correct-key"), true);
  assert.equal(constantTimeSecretEquals("correct-key", "wrong-key"), false);
  assert.equal(constantTimeSecretEquals("correct-key", ""), false);
});

test("MCP authentication fails closed when MCP_API_KEY is missing", () => {
  assert.deepEqual(validateMcpAuthHeaders({}, ""), {
    authorized: false,
    reason: "missing_configuration",
  });
});

test("MCP authentication rejects missing and invalid credentials", () => {
  assert.deepEqual(validateMcpAuthHeaders({}, "expected-key"), {
    authorized: false,
    reason: "missing_credentials",
  });
  assert.deepEqual(
    validateMcpAuthHeaders({ authorization: "Bearer wrong-key" }, "expected-key"),
    { authorized: false, reason: "invalid_credentials" },
  );
  assert.deepEqual(
    validateMcpAuthHeaders({ authorization: "Basic expected-key" }, "expected-key"),
    { authorized: false, reason: "missing_credentials" },
  );
});

test("MCP authentication accepts Bearer and X-API-Key credentials", () => {
  assert.deepEqual(
    validateMcpAuthHeaders({ authorization: "Bearer expected-key" }, "expected-key"),
    { authorized: true },
  );
  assert.deepEqual(
    validateMcpAuthHeaders({ "x-api-key": "expected-key" }, "expected-key"),
    { authorized: true },
  );
});

test("legacy MCP writes require an explicit true flag", () => {
  assert.equal(legacyMcpWritesEnabled(undefined), false);
  assert.equal(legacyMcpWritesEnabled("false"), false);
  assert.equal(legacyMcpWritesEnabled("TRUE"), true);
});
