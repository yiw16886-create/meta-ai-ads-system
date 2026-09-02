# Page Center Stage 2 Regression Baseline

Date: 2026-09-02

## Scope

Stage 2 adds an isolated, read-only Page Center V2 skeleton for a controlled B
cohort. It does not connect OAuth, call Meta APIs, read or write Page data, or
enable any publishing and comment actions.

## Isolation boundaries

- Legacy Page Management remains mounted at `/api/pages` and keeps its existing
  frontend component and response contracts.
- Page Center V2 is mounted separately at `/api/page-center-v2`.
- The new backend module has no Prisma, legacy Page controller, or legacy Meta
  Page service dependency.
- The new frontend module calls only the Page Center V2 API prefix.
- Data center, category dashboard, monitoring, store management, ad operations,
  and all synchronization routes remain outside this module.

## A/B rollout behavior

Page Center V2 is fail-closed and uses two server-only variables:

```dotenv
PAGE_CENTER_V2_ENABLED=false
PAGE_CENTER_V2_ALLOWLIST=id:123,email:user@example.com
```

- Cohort A is the default when the flag is absent, false, or the authenticated
  user is not explicitly allowlisted.
- Cohort B requires both an enabled global flag and an exact JWT user ID or
  email match.
- Wildcards and user roles do not grant access.
- The browser receives only its own cohort decision; the allowlist is never
  included in the client bundle or API response.
- Turning `PAGE_CENTER_V2_ENABLED` off removes the navigation entry and makes
  the protected overview endpoint unavailable.

## Stage 2 API contract

- `GET /api/page-center-v2/access` returns the current authenticated user's
  availability and A/B cohort.
- `GET /api/page-center-v2/overview` is B-only and returns a read-only skeleton
  describing the future OAuth, Page authorization, and Page tool sections.
- Every operational capability is `false` in Stage 2.

## Required verification

```bash
npm run lint
npm run test:stage1
npm run test:stage2
npm run build
```

Before preview validation, scope both Stage 2 variables to the preview branch.
Do not enable the production flag during this stage.
