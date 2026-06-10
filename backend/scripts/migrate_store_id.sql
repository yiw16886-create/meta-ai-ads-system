-- =====================================================================
-- 1. 强行修复 Campaign 表：顺着账户ID（accountId），把 AdAccount 的 storeId 刷过去
-- =====================================================================
UPDATE "Campaign" c
SET "storeId" = a."storeId"
FROM "AdAccount" a
WHERE c."accountId" = a."fb_account_id" AND c."storeId" IS NULL;

-- =====================================================================
-- 2. 强行修复 AdSet 表：顺着账户ID（accountId），把 AdAccount 的 storeId 刷过去
-- =====================================================================
UPDATE "AdSet" s
SET "storeId" = a."storeId"
FROM "AdAccount" a
WHERE s."accountId" = a."fb_account_id" AND s."storeId" IS NULL;

-- =====================================================================
-- 3. 强行修复 Ad 表：顺着账户ID（accountId），把 AdAccount 的 storeId 刷过去
-- =====================================================================
UPDATE "Ad" d
SET "storeId" = a."storeId"
FROM "AdAccount" a
WHERE d."accountId" = a."fb_account_id" AND d."storeId" IS NULL;
