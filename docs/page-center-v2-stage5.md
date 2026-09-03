# Page Center V2 — Stage 5

Stage 5 registers nine MCP tools on the OAuth-protected `/page-center-v2/mcp` resource. Every tool is bound to the MCP token's website `userId` and current organization, and uses only the encrypted Page tokens introduced in Stage 4.

## Tools

Read-only tools:

- `page_center_oauth_status`
- `list_authorized_pages`
- `get_page_permissions`
- `list_page_posts`
- `list_post_comments`

Write tools:

- `publish_page_post`
- `reply_to_page_comment`
- `set_page_comment_hidden`
- `delete_page_post`

## Write controls

All write tools require the MCP `page_center:write` scope, an exact confirmation phrase, and a caller-provided idempotency key. The server also verifies the current website user and B cohort, Page ownership, Page capability, and post or comment ownership before the Meta mutation.

Successful and failed attempts create a sanitized `MetaActionLog`. Message bodies, Page tokens, Meta app secrets, and encrypted token values are not written to the action log. A separate `PageCenterActionReceipt` prevents repeat execution. An ambiguous failed attempt blocks reuse of the same idempotency key so an operator can inspect Meta before retrying.

Image publishing accepts only HTTPS URLs without embedded credentials or fragments, rejects private/reserved hosts after DNS resolution, and sends the URL to Meta only after validation.

## Confirmation phrases

- Publish: `PUBLISH:<pageId>`
- Reply: `REPLY:<commentId>`
- Hide/show: `SET_HIDDEN:<commentId>:<true|false>`
- Delete: `DELETE:<postId>`

Stage 5 does not change the legacy `/mcp`, `/pages`, ad, store, dashboard, monitoring, or synchronization implementations. Disable `PAGE_CENTER_V2_ENABLED` to fail closed for the entire B channel.
