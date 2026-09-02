import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hashSecret } from "../../server/features/mcp-oauth/security.js";

test("authorization codes are single-use, audience-bound and exchanged with S256", async () => {
  const originalCwd = process.cwd();
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-oauth-stage3-"));
  process.chdir(tempDirectory);
  try {
    const service = await import(`../../server/features/mcp-oauth/oauth-service.js?flow=${Date.now()}`);
    const verifier = "a".repeat(64);
    const challenge = hashSecret(verifier);
    const authorizationRequest = await service.createAuthorizationRequest({
      clientId: "https://chatgpt.com/oauth/client.json",
      clientName: "ChatGPT",
      redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
      resource: "https://pages.example.com/page-center-v2/mcp",
      scope: "page_center:read page_center:write",
      state: "state-123",
      codeChallenge: challenge,
    });
    const redirect = await service.decideAuthorizationRequest(
      authorizationRequest.id,
      { id: 42, org_id: "org-42" },
      true,
      "https://pages.example.com",
    );
    const callback = new URL(redirect);
    const code = callback.searchParams.get("code") || "";
    assert.ok(code);
    assert.equal(callback.searchParams.get("state"), "state-123");
    assert.equal(callback.searchParams.get("iss"), "https://pages.example.com");

    const tokens = await service.exchangeAuthorizationCode({
      code,
      clientId: "https://chatgpt.com/oauth/client.json",
      redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
      resource: "https://pages.example.com/page-center-v2/mcp",
      codeVerifier: verifier,
    });
    assert.ok(tokens.access_token);
    assert.ok(tokens.refresh_token);
    assert.notEqual(hashSecret(tokens.access_token), tokens.access_token);

    const identity = await service.validateAccessToken(
      tokens.access_token,
      "https://pages.example.com/page-center-v2/mcp",
      "page_center:read",
    );
    assert.equal(identity?.userId, 42);
    assert.equal(identity?.orgId, "org-42");
    assert.equal(
      await service.validateAccessToken(tokens.access_token, "https://other.example.com/mcp"),
      null,
    );
    await assert.rejects(
      service.exchangeAuthorizationCode({
        code,
        clientId: "https://chatgpt.com/oauth/client.json",
        redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
        resource: "https://pages.example.com/page-center-v2/mcp",
        codeVerifier: verifier,
      }),
      /invalid_grant/,
    );

    const rotated = await service.exchangeRefreshToken({
      refreshToken: tokens.refresh_token,
      clientId: "https://chatgpt.com/oauth/client.json",
      resource: "https://pages.example.com/page-center-v2/mcp",
    });
    assert.notEqual(rotated.refresh_token, tokens.refresh_token);
    await assert.rejects(
      service.exchangeRefreshToken({
        refreshToken: tokens.refresh_token,
        clientId: "https://chatgpt.com/oauth/client.json",
        resource: "https://pages.example.com/page-center-v2/mcp",
      }),
      /invalid_grant/,
    );
    assert.equal(
      await service.validateAccessToken(rotated.access_token, "https://pages.example.com/page-center-v2/mcp"),
      null,
      "replaying an old refresh token revokes the current token family",
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.chdir(originalCwd);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
