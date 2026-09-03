CREATE TABLE "PageCenterActionReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" TEXT,
    "action" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageCenterActionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageCenterActionReceipt_userId_action_idempotencyKey_key"
ON "PageCenterActionReceipt"("userId", "action", "idempotencyKey");

CREATE INDEX "PageCenterActionReceipt_userId_createdAt_idx"
ON "PageCenterActionReceipt"("userId", "createdAt");

CREATE INDEX "PageCenterActionReceipt_orgId_createdAt_idx"
ON "PageCenterActionReceipt"("orgId", "createdAt");
