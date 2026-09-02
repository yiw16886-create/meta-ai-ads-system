CREATE TABLE "McpOAuthAuthorizationRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpOAuthAuthorizationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpOAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpOAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpOAuthAuthorizationRequest_expiresAt_idx" ON "McpOAuthAuthorizationRequest"("expiresAt");
CREATE UNIQUE INDEX "McpOAuthAuthorizationCode_codeHash_key" ON "McpOAuthAuthorizationCode"("codeHash");
CREATE INDEX "McpOAuthAuthorizationCode_expiresAt_idx" ON "McpOAuthAuthorizationCode"("expiresAt");
CREATE INDEX "McpOAuthAuthorizationCode_userId_createdAt_idx" ON "McpOAuthAuthorizationCode"("userId", "createdAt");
CREATE UNIQUE INDEX "McpOAuthToken_tokenHash_key" ON "McpOAuthToken"("tokenHash");
CREATE INDEX "McpOAuthToken_familyId_idx" ON "McpOAuthToken"("familyId");
CREATE INDEX "McpOAuthToken_userId_createdAt_idx" ON "McpOAuthToken"("userId", "createdAt");
CREATE INDEX "McpOAuthToken_expiresAt_idx" ON "McpOAuthToken"("expiresAt");
