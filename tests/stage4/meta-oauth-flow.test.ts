import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PageCenterMetaClient } from "../../server/features/page-center-v2/meta-oauth/meta-client.js";

test("Meta OAuth state is single-use and authorization data is isolated by website user", async () => {
  const originalCwd = process.cwd();
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "page-center-meta-stage4-"));
  process.chdir(tempDirectory);
  try {
    const service = await import(`../../server/features/page-center-v2/meta-oauth/meta-service.js?flow=${Date.now()}`);
    const { default: prisma } = await import("../../db/index.js");
    const environment = {
      PAGE_CENTER_V2_ENABLED: "true",
      PAGE_CENTER_V2_ALLOWLIST: "id:42",
      PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "33".repeat(32),
    };
    const config = {
      clientId: "meta-app",
      clientSecret: "meta-secret",
      graphVersion: "v20.0",
      redirectUri: "https://pages.example.com/api/page-center-v2/meta/callback",
    };
    await (prisma as any).user.create({
      data: {
        id: 42,
        email: "owner@example.com",
        password: "not-used",
        status: "ACTIVE",
        org_id: "org-42",
      },
    });
    const authorizationUrl = await service.createMetaAuthorizationUrl({
      actor: { id: 42, email: "owner@example.com", org_id: "org-42" },
      config,
    });
    const parsed = new URL(authorizationUrl);
    const state = parsed.searchParams.get("state") || "";
    assert.ok(state);
    assert.equal(parsed.searchParams.get("scope")?.includes("ads_management"), false);
    assert.equal(parsed.searchParams.get("scope")?.includes("pages_manage_posts"), true);

    let tokenExchangeCount = 0;
    const observedUrls: string[] = [];
    const request: typeof fetch = async (input) => {
      const url = new URL(String(input));
      observedUrls.push(url.toString());
      if (url.pathname.endsWith("/oauth/access_token")) {
        tokenExchangeCount += 1;
        return Response.json({ access_token: tokenExchangeCount === 1 ? "short-user-token" : "long-user-token", expires_in: 3600 });
      }
      if (url.pathname.endsWith("/me/permissions")) {
        return Response.json({ data: [
          { permission: "pages_show_list", status: "granted" },
          { permission: "pages_read_engagement", status: "granted" },
          { permission: "pages_manage_posts", status: "granted" },
          { permission: "pages_manage_engagement", status: "declined" },
        ] });
      }
      if (url.pathname.endsWith("/me/accounts")) {
        return Response.json({ data: [{
          id: "page-chicwoo",
          name: "chicwoo-US",
          category: "Shopping & retail",
          access_token: "page-secret-token",
          tasks: ["CREATE_CONTENT", "MODERATE"],
        }] });
      }
      return Response.json({ id: "fb-user-42", name: "Page Owner" });
    };
    const client = new PageCenterMetaClient(config, request);
    await service.completeMetaAuthorization({ code: "code-1", state, config, environment, client });

    const ownStatus = await service.getMetaAuthorizationStatus(42);
    const otherStatus = await service.getMetaAuthorizationStatus(99);
    assert.equal(ownStatus.connected, true);
    assert.equal(ownStatus.pages[0].pageName, "chicwoo-US");
    assert.equal(ownStatus.pages[0].canRead, true);
    assert.equal(ownStatus.pages[0].canPublish, true);
    assert.equal(ownStatus.pages[0].canManageComments, false);
    assert.equal(JSON.stringify(ownStatus).includes("page-secret-token"), false);
    assert.equal(observedUrls.some((url) => url.includes("user-token") || url.includes("meta-secret")), false);
    assert.equal(otherStatus.connected, false);
    assert.equal(otherStatus.pages.length, 0);

    await assert.rejects(
      service.completeMetaAuthorization({ code: "code-2", state, config, environment, client }),
      /STATE_INVALID/,
    );
    await service.disconnectMetaAuthorization(42);
    assert.equal((await service.getMetaAuthorizationStatus(42)).connected, false);

    const disabledUrl = await service.createMetaAuthorizationUrl({
      actor: { id: 42, email: "owner@example.com", org_id: "org-42" },
      config,
    });
    await (prisma as any).user.update({
      where: { id: 42 },
      data: { status: "DISABLED" },
    });
    const exchangesBeforeDisabledCallback = tokenExchangeCount;
    await assert.rejects(
      service.completeMetaAuthorization({
        code: "code-disabled",
        state: new URL(disabledUrl).searchParams.get("state") || "",
        config,
        environment,
        client,
      }),
      /USER_INACTIVE/,
    );
    assert.equal(tokenExchangeCount, exchangesBeforeDisabledCallback);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.chdir(originalCwd);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
