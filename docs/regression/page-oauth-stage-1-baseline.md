# Page/OAuth Stage 1 Regression Baseline

Date: 2026-09-02

## Scope

Stage 1 is limited to the legacy MCP connection boundary, its write-operation
kill switch, test coverage, and environment documentation. It does not change
database models, existing REST response contracts, dashboard components, data
sync jobs, or business logic outside `server/mcp.ts`.

## Protected existing capabilities

- Data center and dashboard routes
- Project/category and account mappings
- Account health monitoring
- Store, order, product, and material management
- Meta ad account synchronization and ad operations
- Existing website JWT login and REST APIs

The automated route regression test verifies that the protected route mounts
remain present and that the MCP router stays separate from the `/api` router.

## Pre-change baseline

- `npm run lint`: passed
- `npm run build`: passed with the repository's existing Vite chunk-size and
  CommonJS `import.meta` warnings
- `npm ci`: failed before source changes because `package-lock.json` did not
  match `package.json`

The pre-existing lock-file mismatch is intentionally not changed in this
Page/OAuth-only stage. Local verification used the already resolved dependency
tree; no application dependency was added, removed, or upgraded.

## Stage 1 security behavior

- Legacy MCP protocol requests require `MCP_API_KEY`.
- Missing server configuration fails closed with HTTP 503.
- Missing or invalid client credentials return HTTP 401.
- Bearer and `X-API-Key` credentials are compared using fixed-length digests
  and `timingSafeEqual`.
- Streamable HTTP, SSE, and SSE message requests use the same validation.
- Browser `GET /mcp` remains a public status response and exposes no data.
- Legacy MCP write tools are disabled unless
  `MCP_LEGACY_WRITES_ENABLED=true` is deliberately configured.

## Required checks before merge or deployment

```bash
# Known baseline issue: npm ci currently fails until the repository lock file
# is reconciled in a separately reviewed dependency-maintenance change.
npm run lint
npm run test:stage1
npm run build
```

Production must receive a strong `MCP_API_KEY` through the deployment secret
manager before this branch is deployed. Keep
`MCP_LEGACY_WRITES_ENABLED=false` throughout the Page Center V2 migration.
