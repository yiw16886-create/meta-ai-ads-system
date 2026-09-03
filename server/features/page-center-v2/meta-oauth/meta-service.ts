import { createHash, randomBytes } from "node:crypto";
import prisma from "../../../../db/index.js";
import type { PageCenterV2Actor, PageCenterV2Environment } from "../access.js";
import { evaluatePageCenterV2Access } from "../access.js";
import type { PageCenterMetaConfig } from "./config.js";
import { PageCenterMetaClient, type MetaPage, type MetaPermission } from "./meta-client.js";
import { decryptPageCenterToken, encryptPageCenterToken } from "./token-cipher.js";

const STATE_TTL_MS = 10 * 60 * 1000;
export const PAGE_CENTER_META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_manage_metadata",
] as const;

type MetaServiceEnvironment = NodeJS.ProcessEnv & PageCenterV2Environment;

function hashState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function grantedScopeSet(permissions: MetaPermission[]) {
  return new Set(
    permissions
      .filter((item) => item.status === "granted")
      .map((item) => item.permission),
  );
}

function pageCapabilities(page: MetaPage, scopes: Set<string>) {
  const tasks = new Set(page.tasks || []);
  const managesPage = tasks.has("MANAGE");
  return {
    canRead: scopes.has("pages_read_engagement"),
    canPublish:
      scopes.has("pages_manage_posts") &&
      (managesPage || tasks.has("CREATE_CONTENT")),
    canManageComments:
      scopes.has("pages_manage_engagement") &&
      (managesPage || tasks.has("MODERATE")),
  };
}

function pageView(page: any) {
  return {
    pageId: page.pageId,
    pageName: page.pageName,
    category: page.category || null,
    tasks: JSON.parse(page.tasks || "[]"),
    canRead: Boolean(page.canRead),
    canPublish: Boolean(page.canPublish),
    canManageComments: Boolean(page.canManageComments),
    status: page.status,
    lastVerifiedAt: page.lastVerifiedAt,
  };
}

async function saveAuthorization(input: {
  actor: PageCenterV2Actor;
  identity: { id: string; name?: string };
  token: string;
  tokenExpiresAt?: Date;
  permissions: MetaPermission[];
  pages: MetaPage[];
  environment: MetaServiceEnvironment;
}) {
  const now = new Date();
  const scopes = grantedScopeSet(input.permissions);
  const grantedScopes = [...scopes].sort().join(" ");
  const userTokenCiphertext = encryptPageCenterToken(input.token, input.environment);

  await (prisma as any).$transaction(async (transaction: any) => {
    await transaction.pageCenterMetaAuthorization.upsert({
      where: { userId: input.actor.id },
      update: {
        orgId: input.actor.org_id || null,
        facebookUserId: input.identity.id,
        facebookUserName: input.identity.name || null,
        userTokenCiphertext,
        grantedScopes,
        status: "ACTIVE",
        tokenExpiresAt: input.tokenExpiresAt || null,
        authorizedAt: now,
        lastVerifiedAt: now,
      },
      create: {
        userId: input.actor.id,
        orgId: input.actor.org_id || null,
        facebookUserId: input.identity.id,
        facebookUserName: input.identity.name || null,
        userTokenCiphertext,
        grantedScopes,
        status: "ACTIVE",
        tokenExpiresAt: input.tokenExpiresAt || null,
        authorizedAt: now,
        lastVerifiedAt: now,
      },
    });

    await transaction.pageCenterAuthorizedPage.updateMany({
      where: { userId: input.actor.id },
      data: { status: "REVOKED", lastVerifiedAt: now },
    });

    for (const page of input.pages) {
      if (!page.id || !page.name || !page.access_token) continue;
      const capabilities = pageCapabilities(page, scopes);
      await transaction.pageCenterAuthorizedPage.upsert({
        where: { userId_pageId: { userId: input.actor.id, pageId: page.id } },
        update: {
          orgId: input.actor.org_id || null,
          pageName: page.name,
          category: page.category || null,
          tasks: JSON.stringify(page.tasks || []),
          pageTokenCiphertext: encryptPageCenterToken(page.access_token, input.environment),
          ...capabilities,
          status: "ACTIVE",
          lastVerifiedAt: now,
        },
        create: {
          userId: input.actor.id,
          orgId: input.actor.org_id || null,
          pageId: page.id,
          pageName: page.name,
          category: page.category || null,
          tasks: JSON.stringify(page.tasks || []),
          pageTokenCiphertext: encryptPageCenterToken(page.access_token, input.environment),
          ...capabilities,
          status: "ACTIVE",
          authorizedAt: now,
          lastVerifiedAt: now,
        },
      });
    }
  });
}

export async function createMetaAuthorizationUrl(input: {
  actor: PageCenterV2Actor;
  config: PageCenterMetaConfig;
}) {
  const state = randomBytes(32).toString("base64url");
  await (prisma as any).pageCenterMetaOAuthState.create({
    data: {
      stateHash: hashState(state),
      userId: input.actor.id,
      orgId: input.actor.org_id || null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
      consumedAt: null,
    },
  });

  const url = new URL(`https://www.facebook.com/${input.config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PAGE_CENTER_META_SCOPES.join(","));
  url.searchParams.set("state", state);
  if (input.config.configId) url.searchParams.set("config_id", input.config.configId);
  return url.toString();
}

export async function completeMetaAuthorization(input: {
  code: string;
  state: string;
  config: PageCenterMetaConfig;
  environment: MetaServiceEnvironment;
  client?: PageCenterMetaClient;
}) {
  const stored = await (prisma as any).pageCenterMetaOAuthState.findUnique({
    where: { stateHash: hashState(input.state) },
  });
  if (!stored || stored.consumedAt || stored.expiresAt <= new Date()) {
    throw new Error("PAGE_CENTER_META_STATE_INVALID");
  }

  const websiteUser = await (prisma as any).user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, status: true, org_id: true },
  });
  if (!websiteUser || websiteUser.status !== "ACTIVE") {
    throw new Error("PAGE_CENTER_META_USER_INACTIVE");
  }
  const actor: PageCenterV2Actor = {
    id: websiteUser.id,
    email: websiteUser.email,
    org_id: websiteUser.org_id || undefined,
  };
  if (!evaluatePageCenterV2Access(actor, input.environment).available) {
    throw new Error("PAGE_CENTER_META_COHORT_REVOKED");
  }

  const consumed = await (prisma as any).pageCenterMetaOAuthState.updateMany({
    where: { id: stored.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new Error("PAGE_CENTER_META_STATE_INVALID");

  const client = input.client || new PageCenterMetaClient(input.config);
  const token = await client.exchangeCode(input.code);
  const [identity, permissions, pages] = await Promise.all([
    client.identity(token.access_token),
    client.permissions(token.access_token),
    client.pages(token.access_token),
  ]);
  if (!identity.id) throw new Error("PAGE_CENTER_META_IDENTITY_INVALID");

  await saveAuthorization({
    actor,
    identity,
    token: token.access_token,
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : undefined,
    permissions,
    pages,
    environment: input.environment,
  });
  return { actor, pageCount: pages.length };
}

export async function getMetaAuthorizationStatus(userId: number) {
  const [authorization, pages] = await Promise.all([
    (prisma as any).pageCenterMetaAuthorization.findUnique({ where: { userId } }),
    (prisma as any).pageCenterAuthorizedPage.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { pageName: "asc" },
    }),
  ]);

  return {
    connected: authorization?.status === "ACTIVE",
    facebookUserName: authorization?.facebookUserName || null,
    grantedScopes: String(authorization?.grantedScopes || "").split(/\s+/).filter(Boolean),
    tokenExpiresAt: authorization?.tokenExpiresAt || null,
    lastVerifiedAt: authorization?.lastVerifiedAt || null,
    pages: pages.map(pageView),
  };
}

export async function verifyMetaAuthorization(input: {
  actor: PageCenterV2Actor;
  config: PageCenterMetaConfig;
  environment: MetaServiceEnvironment;
  client?: PageCenterMetaClient;
}) {
  const authorization = await (prisma as any).pageCenterMetaAuthorization.findUnique({
    where: { userId: input.actor.id },
  });
  if (!authorization || authorization.status !== "ACTIVE") {
    throw new Error("PAGE_CENTER_META_NOT_CONNECTED");
  }
  const token = decryptPageCenterToken(authorization.userTokenCiphertext, input.environment);
  const client = input.client || new PageCenterMetaClient(input.config);
  const [identity, permissions, pages] = await Promise.all([
    client.identity(token),
    client.permissions(token),
    client.pages(token),
  ]);
  if (identity.id !== authorization.facebookUserId) {
    throw new Error("PAGE_CENTER_META_IDENTITY_CHANGED");
  }
  await saveAuthorization({
    actor: input.actor,
    identity,
    token,
    tokenExpiresAt: authorization.tokenExpiresAt || undefined,
    permissions,
    pages,
    environment: input.environment,
  });
  return getMetaAuthorizationStatus(input.actor.id);
}

export async function disconnectMetaAuthorization(userId: number) {
  await (prisma as any).$transaction([
    (prisma as any).pageCenterAuthorizedPage.deleteMany({ where: { userId } }),
    (prisma as any).pageCenterMetaAuthorization.deleteMany({ where: { userId } }),
    (prisma as any).pageCenterMetaOAuthState.deleteMany({ where: { userId } }),
  ]);
}
