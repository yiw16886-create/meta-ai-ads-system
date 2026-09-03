import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { encryptPageCenterToken } from "../../server/features/page-center-v2/meta-oauth/token-cipher.js";

test("Page tools isolate users and make confirmed writes idempotent and auditable", async () => {
  const originalCwd = process.cwd();
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "page-center-stage5-"));
  process.chdir(tempDirectory);
  try {
    const { default: prisma } = await import("../../db/index.js");
    const { createPageCenterToolHandlers } = await import(
      `../../server/features/page-center-v2/tools/tool-handlers.js?flow=${Date.now()}`
    );
    const environment = {
      PAGE_CENTER_V2_ENABLED: "true",
      PAGE_CENTER_V2_ALLOWLIST: "id:42,id:99",
      PAGE_CENTER_TOKEN_ENCRYPTION_KEY: "55".repeat(32),
      META_GRAPH_API_VERSION: "v20.0",
    };
    await (prisma as any).user.create({
      data: { id: 42, email: "owner@example.com", password: "unused", status: "ACTIVE", org_id: "org-42" },
    });
    await (prisma as any).user.create({
      data: { id: 99, email: "other@example.com", password: "unused", status: "ACTIVE", org_id: "org-99" },
    });
    await (prisma as any).pageCenterMetaAuthorization.create({
      data: {
        userId: 42,
        orgId: "org-42",
        facebookUserId: "fb-42",
        userTokenCiphertext: encryptPageCenterToken("user-token", environment),
        grantedScopes: "pages_read_engagement pages_manage_posts pages_manage_engagement",
        status: "ACTIVE",
      },
    });
    await (prisma as any).pageCenterAuthorizedPage.create({
      data: {
        userId: 42,
        orgId: "org-42",
        pageId: "123",
        pageName: "chicwoo-US",
        tasks: "[]",
        pageTokenCiphertext: encryptPageCenterToken("page-secret-token", environment),
        canRead: true,
        canPublish: true,
        canManageComments: true,
        status: "ACTIVE",
      },
    });

    let publishCalls = 0;
    const fakeClient = {
      listPosts: async () => ({ posts: [{ id: "123_1", message: "existing" }], nextCursor: null }),
      getPost: async (postId: string) => ({ id: postId, from: { id: "123" } }),
      listComments: async () => ({ comments: [{ id: "123_2", message: "comment" }], nextCursor: null }),
      getComment: async () => ({ id: "123_2", parent: { id: "123_1" } }),
      publishText: async (_pageId: string, body: string) => {
        publishCalls += 1;
        if (body === "force-failure") throw new Error("PAGE_CENTER_GRAPH_ERROR_190");
        return { id: "123_new" };
      },
      publishPhoto: async () => { publishCalls += 1; return { post_id: "123_photo" }; },
      replyToComment: async () => ({ id: "123_reply" }),
      setCommentHidden: async () => ({ success: true }),
      deletePost: async () => ({ success: true }),
    };
    const identity = {
      userId: 42,
      orgId: "org-42",
      clientId: "chatgpt",
      scopes: new Set(["page_center:read", "page_center:write"]),
    };
    const handlers = createPageCenterToolHandlers(identity, environment, {
      clientFactory: () => fakeClient as any,
      imageUrlValidator: async () => true,
    });

    assert.equal((await handlers.listPages()).pages[0].pageName, "chicwoo-US");
    assert.equal((await handlers.listPosts({ pageId: "123", limit: 25 })).posts[0].id, "123_1");
    assert.equal((await handlers.listComments({ pageId: "123", postId: "123_1", limit: 25 })).comments.length, 1);

    const writeInput = {
      pageId: "123",
      message: "new private post body",
      confirm: true,
      confirmationText: "PUBLISH:123",
      idempotencyKey: "publish-unique-001",
    };
    const first = await handlers.publishPost(writeInput);
    const replay = await handlers.publishPost(writeInput);
    assert.equal(first.postId, "123_new");
    assert.equal(replay.replayed, true);
    assert.equal(publishCalls, 1);

    await assert.rejects(
      handlers.publishPost({ ...writeInput, message: "different body" }),
      /IDEMPOTENCY_KEY_REUSED/,
    );
    await assert.rejects(
      handlers.publishPost({ ...writeInput, idempotencyKey: "publish-unique-002", confirmationText: "PUBLISH:999" }),
      /CONFIRMATION_REQUIRED/,
    );

    const failedInput = {
      ...writeInput,
      message: "force-failure",
      idempotencyKey: "publish-failure-001",
    };
    await assert.rejects(handlers.publishPost(failedInput), /GRAPH_ERROR_190/);
    await assert.rejects(
      handlers.publishPost(failedInput),
      /PREVIOUS_ATTEMPT_FAILED_REVIEW_BEFORE_RETRY/,
    );

    const logs = await (prisma as any).metaActionLog.findMany({ where: { userId: 42 } });
    assert.equal(logs.length, 2);
    assert.equal(JSON.stringify(logs).includes("new private post body"), false);
    assert.equal(JSON.stringify(logs).includes("page-secret-token"), false);

    const otherHandlers = createPageCenterToolHandlers(
      { userId: 99, orgId: "org-99", clientId: "chatgpt", scopes: new Set(["page_center:read"]) },
      environment,
      { clientFactory: () => fakeClient as any },
    );
    assert.equal((await otherHandlers.listPages()).pages.length, 0);
    await assert.rejects(otherHandlers.listPosts({ pageId: "123", limit: 25 }), /PAGE_NOT_AUTHORIZED/);

    const movedOrganization = createPageCenterToolHandlers(
      { userId: 42, orgId: "old-org", clientId: "chatgpt", scopes: new Set(["page_center:read"]) },
      environment,
      { clientFactory: () => fakeClient as any },
    );
    await assert.rejects(movedOrganization.listPages(), /ORGANIZATION_CHANGED/);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.chdir(originalCwd);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("write tools reject read-only MCP tokens before calling Meta", async () => {
  const { createPageCenterToolHandlers } = await import(
    `../../server/features/page-center-v2/tools/tool-handlers.js?readonly=${Date.now()}`
  );
  let clientCreated = false;
  const handlers = createPageCenterToolHandlers(
    { userId: 1, orgId: "org", clientId: "chatgpt", scopes: new Set(["page_center:read"]) },
    {},
    { clientFactory: () => { clientCreated = true; return {} as any; } },
  );
  await assert.rejects(
    handlers.publishPost({
      pageId: "123",
      message: "body",
      confirm: true,
      confirmationText: "PUBLISH:123",
      idempotencyKey: "readonly-001",
    }),
    /WRITE_SCOPE_REQUIRED/,
  );
  assert.equal(clientCreated, false);
});
