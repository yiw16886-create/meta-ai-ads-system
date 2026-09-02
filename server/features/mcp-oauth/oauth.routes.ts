import { Router, type Request, type Response } from "express";
import { validateClientMetadata } from "./client-metadata.js";
import { getMcpOAuthIssuer, getMcpResource, MCP_OAUTH_SCOPES } from "./config.js";
import {
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  revokeToken,
} from "./oauth-service.js";
import { validPkceValue } from "./security.js";

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function oauthJsonError(res: Response, status: number, error: string, description: string) {
  noStore(res);
  return res.status(status).json({ error, error_description: description });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function validScope(scope: string) {
  const requested = scope.split(/\s+/).filter(Boolean);
  return requested.length > 0 && requested.every((item) => MCP_OAUTH_SCOPES.includes(item as any));
}

export function createMcpOAuthRouter(environment = process.env) {
  const router = Router();

  router.get("/.well-known/oauth-authorization-server", (req, res) => {
    const issuer = getMcpOAuthIssuer(req, environment);
    noStore(res);
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: MCP_OAUTH_SCOPES,
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  router.get("/oauth/authorize", async (req, res) => {
    noStore(res);
    try {
      const responseType = stringValue(req.query.response_type);
      const clientId = stringValue(req.query.client_id);
      const redirectUri = stringValue(req.query.redirect_uri);
      const resource = stringValue(req.query.resource);
      const scope = stringValue(req.query.scope);
      const state = stringValue(req.query.state) || undefined;
      const codeChallenge = stringValue(req.query.code_challenge);
      const codeChallengeMethod = stringValue(req.query.code_challenge_method);

      if (responseType !== "code") return oauthJsonError(res, 400, "unsupported_response_type", "Only code is supported");
      if (!clientId || !redirectUri) return oauthJsonError(res, 400, "invalid_request", "client_id and redirect_uri are required");
      if (resource !== getMcpResource(req, environment)) return oauthJsonError(res, 400, "invalid_target", "resource must match the MCP resource identifier");
      if (!validScope(scope)) return oauthJsonError(res, 400, "invalid_scope", "The requested scope is not supported");
      if (codeChallengeMethod !== "S256" || !validPkceValue(codeChallenge)) {
        return oauthJsonError(res, 400, "invalid_request", "PKCE S256 is required");
      }

      const client = await validateClientMetadata(clientId, environment);
      if (!client.redirectUris.includes(redirectUri)) {
        return oauthJsonError(res, 400, "invalid_request", "redirect_uri is not registered by the client");
      }

      const authorizationRequest = await createAuthorizationRequest({
        clientId,
        clientName: client.clientName,
        redirectUri,
        resource,
        scope,
        state,
        codeChallenge,
      });
      res.redirect(302, `/mcp/authorize?request_id=${encodeURIComponent(authorizationRequest.id)}`);
    } catch (error) {
      console.error("MCP OAuth authorization request rejected:", error instanceof Error ? error.message : error);
      oauthJsonError(res, 400, "invalid_client", "The OAuth client metadata could not be validated");
    }
  });

  router.post("/oauth/token", async (req, res) => {
    noStore(res);
    const grantType = stringValue(req.body?.grant_type);
    const clientId = stringValue(req.body?.client_id);
    const resource = stringValue(req.body?.resource);
    if (!clientId || resource !== getMcpResource(req, environment)) {
      return oauthJsonError(res, 400, "invalid_request", "client_id and the exact resource are required");
    }

    try {
      if (grantType === "authorization_code") {
        const result = await exchangeAuthorizationCode({
          code: stringValue(req.body?.code),
          clientId,
          redirectUri: stringValue(req.body?.redirect_uri),
          resource,
          codeVerifier: stringValue(req.body?.code_verifier),
        });
        return res.json(result);
      }
      if (grantType === "refresh_token") {
        const result = await exchangeRefreshToken({
          refreshToken: stringValue(req.body?.refresh_token),
          clientId,
          resource,
        });
        return res.json(result);
      }
      return oauthJsonError(res, 400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported");
    } catch (error: any) {
      return oauthJsonError(res, 400, error?.code || "invalid_grant", "The supplied grant is invalid, expired, or already used");
    }
  });

  router.post("/oauth/revoke", async (req, res) => {
    noStore(res);
    const token = stringValue(req.body?.token);
    if (token) await revokeToken(token);
    res.status(200).send();
  });

  return router;
}

export default createMcpOAuthRouter();
