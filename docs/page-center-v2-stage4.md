# Page Center V2 — Stage 4

Stage 4 adds a user-scoped Meta OAuth connection to the isolated Page Center V2 B channel. It does not call the legacy Facebook callback, legacy page manager, ad synchronization, or store synchronization.

## Runtime boundaries

- `POST /api/page-center-v2/meta/connect` creates a ten-minute, one-time OAuth state.
- `GET /api/page-center-v2/meta/callback` is the only new public API path.
- `GET /api/page-center-v2/meta/status` returns the current user's pages without tokens.
- `POST /api/page-center-v2/meta/verify` rechecks Meta permissions and Page tasks.
- `POST /api/page-center-v2/meta/disconnect` removes only the current user's V2 authorization records.

Every route except the callback requires the website JWT and the existing `PAGE_CENTER_V2_ENABLED` plus `PAGE_CENTER_V2_ALLOWLIST` B-cohort checks. The callback consumes a hashed state, reloads the website user, rejects inactive users, and rechecks the B cohort before contacting Meta.

## Token storage

User and Page access tokens are encrypted with AES-256-GCM and a random nonce. Configure `PAGE_CENTER_TOKEN_ENCRYPTION_KEY` as exactly 32 random bytes encoded as 64 hexadecimal characters or base64. Keep separate values in Vercel Preview and Production. Missing, invalid, or mismatched keys fail closed.

Tokens and the Meta app secret are sent in POST bodies or authorization headers, never in Graph request URLs. API status responses never include token ciphertext.

## Deployment order

1. Review the isolated migration; it creates only three `PageCenter*` tables.
2. Apply the migration in the target environment.
3. Set `PAGE_CENTER_TOKEN_ENCRYPTION_KEY` and `PAGE_CENTER_META_REDIRECT_URI` as server-only environment variables.
4. Register the exact redirect URI in the Meta app.
5. Keep `PAGE_CENTER_V2_ENABLED=false` until the preview deployment is healthy.
6. Enable the module for a single B-cohort user and complete OAuth.
7. Verify the expected Page appears and inspect read/publish/comment capability badges.

Turning off `PAGE_CENTER_V2_ENABLED` immediately hides the B route and rejects its protected APIs without changing the legacy modules. Stage 4 stores permission capability only; it does not execute publishing or comment mutations.
