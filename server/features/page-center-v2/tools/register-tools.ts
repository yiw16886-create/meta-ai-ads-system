import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createPageCenterToolHandlers } from "./tool-handlers.js";
import type { McpPageCenterIdentity } from "./tool-security.js";

const objectId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_:-]+$/);
const cursor = z.string().min(1).max(1024).optional();
const limit = z.number().int().min(1).max(50).default(25);
const message = z.string().trim().min(1).max(10000);
const idempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const confirmation = {
  confirm: z.boolean().describe("必须由用户明确确认后设为 true"),
  confirmationText: z.string().max(300).describe("工具说明中指定的精确确认短语"),
  idempotencyKey: idempotencyKey.describe("本次写操作的唯一键；重试必须使用同一个值"),
};

function success(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, data }, null, 2) }] };
}

async function result(operation: () => Promise<unknown>) {
  try {
    return success(await operation());
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : "";
    const code = rawCode.startsWith("PAGE_CENTER_")
      ? rawCode
      : "PAGE_CENTER_TOOL_FAILED";
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ success: false, code, message: "Page Center 操作未执行或未完成。" }),
      }],
      isError: true,
    };
  }
}

export function createPageCenterMcpServer(
  identity: McpPageCenterIdentity,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const server = new McpServer({ name: "page-center-v2", version: "5.0.0" });
  const handlers = createPageCenterToolHandlers(identity, environment);
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

  server.registerTool("page_center_oauth_status", {
    title: "查询 Meta OAuth 状态",
    description: "查询当前 MCP 用户自己的 Meta OAuth 连接、授权作用域和主页数量，不返回 Token。",
    inputSchema: z.object({}),
    annotations: readAnnotations,
  }, async () => result(() => handlers.oauthStatus()));

  server.registerTool("list_authorized_pages", {
    title: "列出已授权公共主页",
    description: "列出当前 MCP 用户通过 Page Center V2 授权的 Facebook 公共主页。",
    inputSchema: z.object({}),
    annotations: readAnnotations,
  }, async () => result(() => handlers.listPages()));

  server.registerTool("get_page_permissions", {
    title: "查询主页权限",
    description: "查询当前用户对指定主页的读取、发帖和评论管理能力。",
    inputSchema: z.object({ pageId: objectId.describe("Facebook Page ID") }),
    annotations: readAnnotations,
  }, async ({ pageId }) => result(() => handlers.pagePermissions(pageId)));

  server.registerTool("list_page_posts", {
    title: "读取主页帖子",
    description: "从 Meta 读取指定已授权主页的帖子；使用游标分页，不接受任意分页 URL。",
    inputSchema: z.object({ pageId: objectId, limit, after: cursor }),
    annotations: readAnnotations,
  }, async (input) => result(() => handlers.listPosts(input)));

  server.registerTool("list_post_comments", {
    title: "读取帖子评论",
    description: "确认帖子属于指定已授权主页后，从 Meta 读取评论。",
    inputSchema: z.object({ pageId: objectId, postId: objectId, limit, after: cursor }),
    annotations: readAnnotations,
  }, async (input) => result(() => handlers.listComments(input)));

  server.registerTool("publish_page_post", {
    title: "发布主页帖子",
    description: "发布纯文本或图片帖子。执行前必须明确确认，并填写精确短语 PUBLISH:<pageId>。",
    inputSchema: z.object({
      pageId: objectId,
      message,
      imageUrl: z.string().url().max(2048).optional(),
      ...confirmation,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input) => result(() => handlers.publishPost(input)));

  server.registerTool("reply_to_page_comment", {
    title: "回复主页评论",
    description: "确认评论属于指定主页后回复。执行前填写精确短语 REPLY:<commentId>。",
    inputSchema: z.object({ pageId: objectId, commentId: objectId, message, ...confirmation }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input) => result(() => handlers.replyToComment(input)));

  server.registerTool("set_page_comment_hidden", {
    title: "隐藏或显示主页评论",
    description: "隐藏或恢复指定主页评论。执行前填写精确短语 SET_HIDDEN:<commentId>:<true|false>。",
    inputSchema: z.object({ pageId: objectId, commentId: objectId, isHidden: z.boolean(), ...confirmation }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async (input) => result(() => handlers.setCommentHidden(input)));

  server.registerTool("delete_page_post", {
    title: "删除主页帖子",
    description: "删除指定主页帖子。执行前必须明确确认，并填写精确短语 DELETE:<postId>。",
    inputSchema: z.object({ pageId: objectId, postId: objectId, ...confirmation }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async (input) => result(() => handlers.deletePost(input)));

  return server;
}
