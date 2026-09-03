import { getMetaAuthorizationStatus } from "../meta-oauth/meta-service.js";
import { getPageCenterGraphVersion } from "../meta-oauth/config.js";
import { MetaPagesClient } from "./meta-pages-client.js";
import {
  assertCommentBelongsToPage,
  assertPostBelongsToPage,
  executeIdempotentWrite,
  requireAuthorizedPage,
  requireConfirmation,
  requireCurrentPageCenterActor,
  requireWriteScope,
  validatePublicImageUrl,
  type McpPageCenterIdentity,
} from "./tool-security.js";

type ToolEnvironment = NodeJS.ProcessEnv & {
  PAGE_CENTER_V2_ENABLED?: string;
  PAGE_CENTER_V2_ALLOWLIST?: string;
  META_GRAPH_API_VERSION?: string;
};

type ClientFactory = (pageToken: string) => MetaPagesClient;

export function createPageCenterToolHandlers(
  identity: McpPageCenterIdentity,
  environment: ToolEnvironment = process.env,
  dependencies: {
    clientFactory?: ClientFactory;
    imageUrlValidator?: (url: string) => Promise<boolean>;
  } = {},
) {
  const clientFactory = dependencies.clientFactory || ((pageToken: string) =>
    new MetaPagesClient(pageToken, getPageCenterGraphVersion(environment)));

  async function actor() {
    return requireCurrentPageCenterActor(identity, environment);
  }

  async function pageClient(
    pageId: string,
    capability: "canRead" | "canPublish" | "canManageComments",
  ) {
    await actor();
    const authorization = await requireAuthorizedPage(identity, pageId, capability, environment);
    return { ...authorization, client: clientFactory(authorization.pageToken) };
  }

  return {
    async oauthStatus() {
      await actor();
      return getMetaAuthorizationStatus(identity.userId);
    },

    async listPages() {
      await actor();
      const status = await getMetaAuthorizationStatus(identity.userId);
      return { connected: status.connected, pages: status.pages };
    },

    async pagePermissions(pageId: string) {
      await actor();
      const status = await getMetaAuthorizationStatus(identity.userId);
      const page = status.pages.find((item) => item.pageId === pageId);
      if (!page) throw new Error("PAGE_CENTER_PAGE_NOT_AUTHORIZED");
      return page;
    },

    async listPosts(input: { pageId: string; limit: number; after?: string }) {
      const { client } = await pageClient(input.pageId, "canRead");
      return client.listPosts(input.pageId, input.limit, input.after);
    },

    async listComments(input: { pageId: string; postId: string; limit: number; after?: string }) {
      const { client } = await pageClient(input.pageId, "canRead");
      assertPostBelongsToPage(await client.getPost(input.postId), input.pageId);
      return client.listComments(input.postId, input.limit, input.after);
    },

    async publishPost(input: {
      pageId: string;
      message: string;
      imageUrl?: string;
      confirm: boolean;
      confirmationText: string;
      idempotencyKey: string;
    }) {
      requireWriteScope(identity);
      requireConfirmation(input.confirm, input.confirmationText, `PUBLISH:${input.pageId}`);
      const { client } = await pageClient(input.pageId, "canPublish");
      const imageUrl = input.imageUrl
        ? await validatePublicImageUrl(input.imageUrl, dependencies.imageUrlValidator)
        : undefined;
      return executeIdempotentWrite({
        identity,
        action: "PAGE_CENTER_PUBLISH_POST",
        pageId: input.pageId,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayload: { pageId: input.pageId, message: input.message, imageUrl: imageUrl || null },
        auditRequest: {
          pageId: input.pageId,
          messageLength: input.message.length,
          imageHost: imageUrl ? new URL(imageUrl).hostname : null,
          idempotencyKey: input.idempotencyKey,
        },
        execute: async () => {
          const response = imageUrl
            ? await client.publishPhoto(input.pageId, input.message, imageUrl)
            : await client.publishText(input.pageId, input.message);
          const postId = ("post_id" in response ? response.post_id : undefined) || response.id;
          if (!postId) throw new Error("PAGE_CENTER_META_POST_ID_MISSING");
          return { success: true, pageId: input.pageId, postId };
        },
      });
    },

    async replyToComment(input: {
      pageId: string;
      commentId: string;
      message: string;
      confirm: boolean;
      confirmationText: string;
      idempotencyKey: string;
    }) {
      requireWriteScope(identity);
      requireConfirmation(input.confirm, input.confirmationText, `REPLY:${input.commentId}`);
      const { client } = await pageClient(input.pageId, "canManageComments");
      assertCommentBelongsToPage(await client.getComment(input.commentId), input.pageId);
      return executeIdempotentWrite({
        identity,
        action: "PAGE_CENTER_REPLY_COMMENT",
        pageId: input.pageId,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayload: {
          pageId: input.pageId,
          commentId: input.commentId,
          message: input.message,
        },
        auditRequest: {
          pageId: input.pageId,
          commentId: input.commentId,
          messageLength: input.message.length,
          idempotencyKey: input.idempotencyKey,
        },
        execute: async () => {
          const response = await client.replyToComment(input.commentId, input.message);
          if (!response.id) throw new Error("PAGE_CENTER_META_COMMENT_ID_MISSING");
          return { success: true, pageId: input.pageId, commentId: response.id };
        },
      });
    },

    async setCommentHidden(input: {
      pageId: string;
      commentId: string;
      isHidden: boolean;
      confirm: boolean;
      confirmationText: string;
      idempotencyKey: string;
    }) {
      requireWriteScope(identity);
      requireConfirmation(
        input.confirm,
        input.confirmationText,
        `SET_HIDDEN:${input.commentId}:${input.isHidden}`,
      );
      const { client } = await pageClient(input.pageId, "canManageComments");
      assertCommentBelongsToPage(await client.getComment(input.commentId), input.pageId);
      return executeIdempotentWrite({
        identity,
        action: "PAGE_CENTER_SET_COMMENT_HIDDEN",
        pageId: input.pageId,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayload: {
          pageId: input.pageId,
          commentId: input.commentId,
          isHidden: input.isHidden,
        },
        auditRequest: {
          pageId: input.pageId,
          commentId: input.commentId,
          isHidden: input.isHidden,
          idempotencyKey: input.idempotencyKey,
        },
        execute: async () => {
          await client.setCommentHidden(input.commentId, input.isHidden);
          return { success: true, pageId: input.pageId, commentId: input.commentId, isHidden: input.isHidden };
        },
      });
    },

    async deletePost(input: {
      pageId: string;
      postId: string;
      confirm: boolean;
      confirmationText: string;
      idempotencyKey: string;
    }) {
      requireWriteScope(identity);
      requireConfirmation(input.confirm, input.confirmationText, `DELETE:${input.postId}`);
      const { client } = await pageClient(input.pageId, "canPublish");
      assertPostBelongsToPage(await client.getPost(input.postId), input.pageId);
      return executeIdempotentWrite({
        identity,
        action: "PAGE_CENTER_DELETE_POST",
        pageId: input.pageId,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayload: { pageId: input.pageId, postId: input.postId },
        auditRequest: {
          pageId: input.pageId,
          postId: input.postId,
          idempotencyKey: input.idempotencyKey,
        },
        execute: async () => {
          const response = await client.deletePost(input.postId);
          if (response.success === false) throw new Error("PAGE_CENTER_META_DELETE_REJECTED");
          return { success: true, pageId: input.pageId, postId: input.postId, deleted: true };
        },
      });
    },
  };
}
