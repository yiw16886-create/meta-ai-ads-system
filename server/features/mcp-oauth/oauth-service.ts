import prisma from "../../../db/index.js";
import { hashSecret, randomToken, validPkceValue, verifyS256 } from "./security.js";

const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type AuthorizationRequestInput = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  resource: string;
  scope: string;
  state?: string;
  codeChallenge: string;
};

type WebsiteActor = { id: number; org_id?: string };

function oauthError(code: string) {
  return Object.assign(new Error(code), { code });
}

export async function createAuthorizationRequest(input: AuthorizationRequestInput) {
  return (prisma as any).mcpOAuthAuthorizationRequest.create({
    data: {
      ...input,
      consumedAt: null,
      expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS),
    },
  });
}

export async function getAuthorizationRequest(id: string) {
  const request = await (prisma as any).mcpOAuthAuthorizationRequest.findUnique({ where: { id } });
  if (!request || request.consumedAt || request.expiresAt <= new Date()) {
    throw oauthError("invalid_authorization_request");
  }
  return request;
}

function callbackUrl(request: any, parameters: Record<string, string>) {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

export async function decideAuthorizationRequest(
  id: string,
  actor: WebsiteActor,
  approved: boolean,
  issuer: string,
) {
  const request = await getAuthorizationRequest(id);
  const consumed = await (prisma as any).mcpOAuthAuthorizationRequest.updateMany({
    where: { id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw oauthError("invalid_authorization_request");

  if (!approved) {
    return callbackUrl(request, { error: "access_denied", iss: issuer });
  }

  const code = randomToken();
  await (prisma as any).mcpOAuthAuthorizationCode.create({
    data: {
      codeHash: hashSecret(code),
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      resource: request.resource,
      scope: request.scope,
      codeChallenge: request.codeChallenge,
      userId: actor.id,
      orgId: actor.org_id || null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });

  return callbackUrl(request, { code, iss: issuer });
}

async function createTokenPair(subject: {
  clientId: string;
  resource: string;
  scope: string;
  userId: number;
  orgId?: string | null;
}, familyId = randomToken(18)) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();
  const tokenSubject = {
    clientId: subject.clientId,
    resource: subject.resource,
    scope: subject.scope,
    userId: subject.userId,
    orgId: subject.orgId || null,
  };

  await (prisma as any).$transaction([
    (prisma as any).mcpOAuthToken.create({
      data: {
        tokenHash: hashSecret(accessToken),
        tokenType: "ACCESS",
        familyId,
        ...tokenSubject,
        revokedAt: null,
        replacedAt: null,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
    }),
    (prisma as any).mcpOAuthToken.create({
      data: {
        tokenHash: hashSecret(refreshToken),
        tokenType: "REFRESH",
        familyId,
        ...tokenSubject,
        revokedAt: null,
        replacedAt: null,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
      },
    }),
  ]);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: subject.scope,
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeVerifier: string;
}) {
  if (!validPkceValue(input.codeVerifier)) throw oauthError("invalid_grant");
  const code = await (prisma as any).mcpOAuthAuthorizationCode.findUnique({
    where: { codeHash: hashSecret(input.code) },
  });
  if (
    !code ||
    code.consumedAt ||
    code.expiresAt <= new Date() ||
    code.clientId !== input.clientId ||
    code.redirectUri !== input.redirectUri ||
    code.resource !== input.resource ||
    !verifyS256(input.codeVerifier, code.codeChallenge)
  ) {
    throw oauthError("invalid_grant");
  }

  const consumed = await (prisma as any).mcpOAuthAuthorizationCode.updateMany({
    where: { id: code.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw oauthError("invalid_grant");

  return createTokenPair(code);
}

export async function exchangeRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource: string;
}) {
  const token = await (prisma as any).mcpOAuthToken.findUnique({
    where: { tokenHash: hashSecret(input.refreshToken) },
  });
  if (!token || token.tokenType !== "REFRESH" || token.clientId !== input.clientId || token.resource !== input.resource) {
    throw oauthError("invalid_grant");
  }
  if (token.revokedAt || token.replacedAt || token.expiresAt <= new Date()) {
    await (prisma as any).mcpOAuthToken.updateMany({
      where: { familyId: token.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw oauthError("invalid_grant");
  }

  const now = new Date();
  const rotated = await (prisma as any).mcpOAuthToken.updateMany({
    where: { id: token.id, revokedAt: null, replacedAt: null },
    data: { replacedAt: now, revokedAt: now },
  });
  if (rotated.count !== 1) throw oauthError("invalid_grant");
  await (prisma as any).mcpOAuthToken.updateMany({
    where: { familyId: token.familyId, revokedAt: null },
    data: { revokedAt: now },
  });

  return createTokenPair(token, token.familyId);
}

export async function revokeToken(rawToken: string) {
  const token = await (prisma as any).mcpOAuthToken.findUnique({
    where: { tokenHash: hashSecret(rawToken) },
  });
  if (token) {
    await (prisma as any).mcpOAuthToken.updateMany({
      where: { familyId: token.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function validateAccessToken(rawToken: string, resource: string, requiredScope?: string) {
  const token = await (prisma as any).mcpOAuthToken.findUnique({
    where: { tokenHash: hashSecret(rawToken) },
  });
  const scopes = new Set(String(token?.scope || "").split(/\s+/).filter(Boolean));
  if (
    !token ||
    token.tokenType !== "ACCESS" ||
    token.revokedAt ||
    token.expiresAt <= new Date() ||
    token.resource !== resource ||
    (requiredScope && !scopes.has(requiredScope))
  ) {
    return null;
  }
  return { userId: token.userId, orgId: token.orgId, clientId: token.clientId, scopes };
}
