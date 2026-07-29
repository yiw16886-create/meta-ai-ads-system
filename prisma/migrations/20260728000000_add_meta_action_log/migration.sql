CREATE TABLE "MetaActionLog" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "orgId" TEXT,
  "action" TEXT NOT NULL,
  "accountId" TEXT,
  "status" TEXT NOT NULL,
  "requestJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetaActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaActionLog_userId_createdAt_idx" ON "MetaActionLog"("userId", "createdAt");
CREATE INDEX "MetaActionLog_orgId_createdAt_idx" ON "MetaActionLog"("orgId", "createdAt");
