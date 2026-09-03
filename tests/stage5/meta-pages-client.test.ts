import assert from "node:assert/strict";
import test from "node:test";
import { MetaPagesClient } from "../../server/features/page-center-v2/tools/meta-pages-client.js";

test("Meta Page client keeps tokens out of URLs and uses bounded cursor pagination", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({
      data: [{ id: "123_456", message: "hello" }],
      paging: { cursors: { after: "next-cursor" }, next: "present" },
    });
  };
  const client = new MetaPagesClient("page-secret-token", "v20.0", request);
  const result = await client.listPosts("123", 25, "cursor-1");

  assert.equal(result.nextCursor, "next-cursor");
  assert.equal(calls[0].url.includes("page-secret-token"), false);
  assert.equal(calls[0].url.includes("/123/posts"), true);
  assert.equal(new URL(calls[0].url).searchParams.get("limit"), "25");
  assert.equal(new URL(calls[0].url).searchParams.get("after"), "cursor-1");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer page-secret-token");
});

test("Meta Page mutations put content in form bodies rather than request URLs", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ id: "123_789" });
  };
  const client = new MetaPagesClient("token", "v20.0", request);
  await client.publishText("123", "private draft text");

  assert.equal(calls[0].url.includes("private"), false);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(String(calls[0].init?.body).includes("private+draft+text"), true);
});
