# Stage 3: MCP OAuth and website identity

This stage adds an OAuth 2.1 boundary for the isolated Page Center V2 channel. It does not replace the legacy `/mcp` API-key channel or change existing Meta, dashboard, monitoring, store, or synchronization routes.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource/page-center-v2/mcp` | RFC 9728 protected-resource metadata |
| `/.well-known/oauth-authorization-server` | RFC 8414 authorization-server metadata |
| `/oauth/authorize` | Authorization-code request with PKCE S256 and `resource` |
| `/oauth/token` | Authorization-code exchange and refresh-token rotation |
| `/oauth/revoke` | Token-family revocation |
| `/mcp/authorize` | Website-user consent screen |
| `/page-center-v2/mcp` | OAuth-protected MCP B channel skeleton |

## Isolation and security properties

- The website JWT authenticates the consent screen; the issued MCP identity stores the website `userId` and `orgId`.
- Authorization codes, access tokens, and refresh tokens are opaque random values. Only SHA-256 hashes are stored.
- Authorization codes are single-use and expire after five minutes.
- Access tokens are bound to the exact Page Center V2 MCP resource and requested scopes.
- Refresh tokens rotate on every exchange. Reuse revokes the entire token family.
- Client ID Metadata Documents are restricted to configured HTTPS origins. ChatGPT is the default allowed origin.
- The authorization response always includes the configured issuer (`iss`).
- There are no Page Center tools in this stage. Read, publish, and comment tools remain scheduled for Stage 5.

## Deployment configuration

Set `MCP_OAUTH_ISSUER` to the stable public origin, for example `https://example.com`. Preview deployments can use Vercel's automatically supplied `VERCEL_URL`. Keep `PAGE_CENTER_V2_ENABLED=false` until the migration has been applied and the B-cohort allowlist is ready.

Apply `prisma/migrations/20260902000000_add_mcp_oauth/migration.sql` before enabling OAuth consent in an environment. The migration only creates new OAuth tables and indexes; it does not alter existing tables.
