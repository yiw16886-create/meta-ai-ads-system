import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPageCenterMcpServer } from "../../server/features/page-center-v2/tools/register-tools.js";

test("Page Center MCP advertises all Stage 5 tools and destructive hints", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPageCenterMcpServer({
    userId: 42,
    orgId: "org-42",
    clientId: "chatgpt",
    scopes: new Set(["page_center:read", "page_center:write"]),
  });
  const client = new Client({ name: "stage5-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "delete_page_post",
      "get_page_permissions",
      "list_authorized_pages",
      "list_page_posts",
      "list_post_comments",
      "page_center_oauth_status",
      "publish_page_post",
      "reply_to_page_comment",
      "set_page_comment_hidden",
    ]);
    assert.equal(tools.tools.find((tool) => tool.name === "delete_page_post")?.annotations?.destructiveHint, true);
    assert.equal(tools.tools.find((tool) => tool.name === "list_page_posts")?.annotations?.readOnlyHint, true);
  } finally {
    await client.close();
    await server.close();
  }
});
