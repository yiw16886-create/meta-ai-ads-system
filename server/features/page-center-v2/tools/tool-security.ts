import { createHash } from "node:crypto";
import prisma from "../../../../db/index.js";
import { isSafeUrl } from "../../../ssrf.util.js";
import { evaluatePageCenterV2Access, type PageCenterV2Environment } from "../access.js";
import { decryptPageCenterToken } from "../meta-oauth/token-cipher.js";

export type McpPageCenterIdentity = {
  userId: number;
  orgId?: string | null;
  clientId: string;
  scopes: Set<string>;
};

export type PageCapability = "canRead" | "canPublish" | "canManageComments";

export async function requireCurrentPageCenterActor(
  identity: McpPageCenterIdentity,
  environment: NodeJS.ProcessEnv & PageCenterV2Environment,
) {
  const user = await (prisma as any).user.findUnique({
    where: { id: identity.userId },
    select: { id: true, email: true, status: true, org_id: true },
  });
  if (!user || user.status !== "ACTIVE") throw new Error("PAGE_CENTER_USER_INACTIVE");
  if ((identity.orgId || null) !== (user.org_id || null)) {
    throw new Error("PAGE_CENTER_ORGANIZATION_CHANGED");
  }
  if (!evaluatePageCenterV2Access(user, environment).available) {
    throw new Error("PAGE_CENTER_COHORT_REVOKED");
  }
  return user as { id: number; email: string; status: string; org_id?: string };
}

export async function requireAuthorizedPage(
  identity: McpPageCenterIdentity,
  pageId: string,
  capability: PageCapability,
  environment: NodeJS.ProcessEnv,
) {
  const page = await (prisma as any).pageCenterAuthorizedPage.findUnique({
    where: { userId_pageId: { userId: identity.userId, pageId } },
  });
  if (!page || page.userId !== identity.userId || page.pageId !== pageId || page.status !== "ACTIVE") {
    throw new Error("PAGE_CENTER_PAGE_NOT_AUTHORIZED");
  }
  if (!page[capability]) throw new Error(`PAGE_CENTER_PERMISSION_${capability.toUpperCase()}_REQUIRED`);
  if ((identity.orgId || null) !== (page.orgId || null)) {
    throw new Error("PAGE_CENTER_PAGE_ORGANIZATION_MISMATCH");
  }
  return {
    page,
    pageToken: decryptPageCenterToken(page.pageTokenCiphertext, environment),
  };
}

export function requireWriteScope(identity: McpPageCenterIdentity) {
  if (!identity.scopes.has("page_center:write")) {
    throw new Error("PAGE_CENTER_MCP_WRITE_SCOPE_REQUIRED");
  }
}

export function requireConfirmation(actual: boolean, actualText: string, expectedText: string) {
  if (!actual || actualText !== expectedText) {
    throw new Error(`PAGE_CENTER_CONFIRMATION_REQUIRED:${expectedText}`);
  }
}

export async function validatePublicImageUrl(
  rawUrl: string,
  validator: (url: string) => Promise<boolean> = isSafeUrl,
) {
  if (rawUrl.length > 2048) throw new Error("PAGE_CENTER_IMAGE_URL_INVALID");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("PAGE_CENTER_IMAGE_URL_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("PAGE_CENTER_IMAGE_URL_INVALID");
  }
  if (!(await validator(url.toString()))) throw new Error("PAGE_CENTER_IMAGE_URL_UNSAFE");
  return url.toString();
}

function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function audit(input: {
  identity: McpPageCenterIdentity;
  action: string;
  pageId: string;
  status: string;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}) {
  await (prisma as any).metaActionLog.create({
    data: {
      userId: input.identity.userId,
      orgId: input.identity.orgId || null,
      action: input.action,
      accountId: input.pageId,
      status: input.status,
      requestJson: input.request,
      resultJson: input.result || undefined,
      errorMessage: input.error || null,
    },
  });
}

export async function executeIdempotentWrite<T extends Record<string, unknown>>(input: {
  identity: McpPageCenterIdentity;
  action: string;
  pageId: string;
  idempotencyKey: string;
  idempotencyPayload: Record<string, unknown>;
  auditRequest: Record<string, unknown>;
  execute: () => Promise<T>;
}): Promise<T & { replayed?: boolean }> {
  const hash = requestHash(input.idempotencyPayload);
  const receiptFilter = {
    userId: input.identity.userId,
    action: input.action,
    idempotencyKey: input.idempotencyKey,
  };
  let receipt = await (prisma as any).pageCenterActionReceipt.findFirst({
    where: receiptFilter,
  });
  if (
    receipt &&
    (receipt.userId !== input.identity.userId ||
      receipt.action !== input.action ||
      receipt.idempotencyKey !== input.idempotencyKey)
  ) {
    receipt = null;
  }
  if (receipt) {
    if (receipt.requestHash !== hash) throw new Error("PAGE_CENTER_IDEMPOTENCY_KEY_REUSED");
    if (receipt.status === "SUCCEEDED") return { ...(receipt.resultJson || {}), replayed: true } as T & { replayed: true };
    throw new Error(
      receipt.status === "FAILED"
        ? "PAGE_CENTER_PREVIOUS_ATTEMPT_FAILED_REVIEW_BEFORE_RETRY"
        : "PAGE_CENTER_WRITE_IN_PROGRESS",
    );
  }

  try {
    receipt = await (prisma as any).pageCenterActionReceipt.create({
      data: {
        userId: input.identity.userId,
        orgId: input.identity.orgId || null,
        action: input.action,
        pageId: input.pageId,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        status: "PENDING",
      },
    });
  } catch {
    const raced = await (prisma as any).pageCenterActionReceipt.findFirst({
      where: receiptFilter,
    });
    if (
      raced?.userId === input.identity.userId &&
      raced.action === input.action &&
      raced.idempotencyKey === input.idempotencyKey &&
      raced.requestHash === hash &&
      raced.status === "SUCCEEDED"
    ) {
      return { ...(raced.resultJson || {}), replayed: true } as T & { replayed: true };
    }
    throw new Error("PAGE_CENTER_WRITE_IN_PROGRESS");
  }

  let result: T;
  try {
    result = await input.execute();
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAGE_CENTER_WRITE_FAILED";
    await Promise.allSettled([
      (prisma as any).pageCenterActionReceipt.update({
        where: { id: receipt.id },
        data: { status: "FAILED", errorMessage: code },
      }),
      audit({
        identity: input.identity,
        action: input.action,
        pageId: input.pageId,
        status: "FAILED",
        request: input.auditRequest,
        error: code,
      }),
    ]);
    throw error;
  }

  try {
    await (prisma as any).$transaction([
      (prisma as any).pageCenterActionReceipt.update({
        where: { id: receipt.id },
        data: { status: "SUCCEEDED", resultJson: result, errorMessage: null },
      }),
      (prisma as any).metaActionLog.create({ data: {
        userId: input.identity.userId,
        orgId: input.identity.orgId || null,
        action: input.action,
        accountId: input.pageId,
        status: "SUCCEEDED",
        requestJson: input.auditRequest,
        resultJson: result,
        errorMessage: null,
      } }),
    ]);
    return result;
  } catch {
    throw new Error("PAGE_CENTER_WRITE_SUCCEEDED_AUDIT_PERSISTENCE_UNKNOWN");
  }
}

export function assertPostBelongsToPage(post: { id?: string; from?: { id?: string } }, pageId: string) {
  if (!post.id || (post.from?.id !== pageId && !post.id.startsWith(`${pageId}_`))) {
    throw new Error("PAGE_CENTER_POST_OWNERSHIP_MISMATCH");
  }
}

export function assertCommentBelongsToPage(comment: { parent?: { id?: string } }, pageId: string) {
  if (!comment.parent?.id?.startsWith(`${pageId}_`)) {
    throw new Error("PAGE_CENTER_COMMENT_OWNERSHIP_MISMATCH");
  }
}
