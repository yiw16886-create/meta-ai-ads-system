CREATE TABLE "DataDeletionRequest" (
    "confirmationCode" TEXT NOT NULL,
    "fbUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("confirmationCode")
);

CREATE INDEX "DataDeletionRequest_fbUserId_requestedAt_idx"
ON "DataDeletionRequest"("fbUserId", "requestedAt");
