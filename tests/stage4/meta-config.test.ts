import assert from "node:assert/strict";
import test from "node:test";
import { getPageCenterMetaRedirectUri } from "../../server/features/page-center-v2/meta-oauth/config.js";

const request = { protocol: "http", get: (name: string) => name === "host" ? "localhost:3000" : undefined } as any;

test("Page Center Meta OAuth uses its own exact callback", () => {
  assert.equal(
    getPageCenterMetaRedirectUri(request, { APP_URL: "https://pages.example.com/anything" }),
    "https://pages.example.com/api/page-center-v2/meta/callback",
  );
  assert.equal(
    getPageCenterMetaRedirectUri(request, { PAGE_CENTER_META_REDIRECT_URI: "https://preview.example.com/api/page-center-v2/meta/callback" }),
    "https://preview.example.com/api/page-center-v2/meta/callback",
  );
  assert.throws(
    () => getPageCenterMetaRedirectUri(request, { PAGE_CENTER_META_REDIRECT_URI: "https://preview.example.com/custom/callback?ignored=1" }),
    /REDIRECT_URI_INVALID/,
  );
});
