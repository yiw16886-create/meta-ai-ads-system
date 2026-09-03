# Page Center V2 — Stage 6 Preview acceptance

Stage 6 prepares the isolated B channel for a real Preview OAuth and MCP acceptance run. It adds a protected `/api/page-center-v2/readiness` endpoint that reports only ready/not-ready status. It never returns environment values, App credentials, database URLs, encryption keys, Page tokens, or allowlist members.

## Required Vercel Preview variables

Configure these as server-side Preview variables. Use a separate Preview database and encryption key; do not reuse Production secrets.

| Variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Preview PostgreSQL connection. Apply the Stage 3–5 migrations before enabling the B cohort. |
| `META_APP_ID` | Meta app ID. The existing database-backed admin setting remains supported, but an environment value is preferred for Preview. |
| `META_APP_SECRET` | Meta app secret. Mark sensitive and never expose it with a browser-prefixed variable. |
| `META_GRAPH_API_VERSION` | Explicit version in `vNN.N` form that is currently supported by the selected Meta app. Stage 6 intentionally has no default. |
| `PAGE_CENTER_TOKEN_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as 64 hexadecimal characters or standard base64. |
| `PAGE_CENTER_META_REDIRECT_URI` | Exact HTTPS URI: `<STABLE_PREVIEW_ORIGIN>/api/page-center-v2/meta/callback`. |
| `MCP_OAUTH_ISSUER` | Exact stable HTTPS Preview origin with no path or trailing slash. |
| `MCP_OAUTH_CLIENT_METADATA_ORIGINS` | Must include `https://chatgpt.com`. |
| `PAGE_CENTER_V2_ENABLED` | Set to `true` only after database and secrets are ready. |
| `PAGE_CENTER_V2_ALLOWLIST` | Only the acceptance user's website ID or email, such as `id:<id>` or `email:<email>`. |

`FACEBOOK_CONFIG_ID` is optional. Configure it only when the Meta app uses Facebook Login for Business configuration IDs.

Keep `MCP_LEGACY_WRITES_ENABLED=false`. The legacy Page, ads, stores, dashboard, monitoring, and synchronization routes are not part of this rollout.

## Meta app dashboard

Add the exact `PAGE_CENTER_META_REDIRECT_URI` value to Valid OAuth Redirect URIs. The Page Center flow requests:

- `pages_show_list`
- `pages_read_engagement`
- `pages_read_user_content`
- `pages_manage_posts`
- `pages_manage_engagement`
- `pages_manage_metadata`

For an app administrator testing a private app, keep the acceptance user assigned to the app and confirm that `chicwoo-US` appears in `/me/accounts` with the required Page tasks. Wider use by people without an app role requires the applicable Meta access level and review.

## External gates

Vercel Deployment Protection currently redirects the Preview API, OAuth discovery, and MCP resource to SSO. ChatGPT cannot complete the standard MCP OAuth discovery flow while those public protocol endpoints return `302`. Use a dedicated public staging origin or change Preview protection for the controlled acceptance window. A temporary browser share URL is not a stable OAuth issuer.

Run the migrations in order with `prisma migrate deploy` against the Preview database:

1. `20260902000000_add_mcp_oauth`
2. `20260903000000_add_page_center_meta_oauth`
3. `20260903010000_add_page_center_action_receipts`

## Acceptance order

1. Confirm the readiness endpoint reports all server checks ready.
2. Fetch OAuth authorization-server and protected-resource metadata without a Vercel SSO redirect.
3. Sign in as the single B-cohort website user and complete Meta OAuth.
4. Verify `chicwoo-US`, Page tasks, and read permissions.
5. List posts and comments.
6. With explicit operator confirmation, publish one labeled test post and replay the same idempotency key.
7. Reply, hide, unhide, and delete only the labeled test content.
8. Inspect sanitized audit logs and action receipts, then disable the B flag if any gate fails.
