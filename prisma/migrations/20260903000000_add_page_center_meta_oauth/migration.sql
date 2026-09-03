CREATE TABLE "PageCenterMetaOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageCenterMetaOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageCenterMetaAuthorization" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" TEXT,
    "facebookUserId" TEXT NOT NULL,
    "facebookUserName" TEXT,
    "userTokenCiphertext" TEXT NOT NULL,
    "grantedScopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tokenExpiresAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageCenterMetaAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageCenterAuthorizedPage" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" TEXT,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "category" TEXT,
    "tasks" TEXT NOT NULL,
    "pageTokenCiphertext" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "canManageComments" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tokenExpiresAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageCenterAuthorizedPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageCenterMetaOAuthState_stateHash_key" ON "PageCenterMetaOAuthState"("stateHash");
CREATE INDEX "PageCenterMetaOAuthState_userId_createdAt_idx" ON "PageCenterMetaOAuthState"("userId", "createdAt");
CREATE INDEX "PageCenterMetaOAuthState_expiresAt_idx" ON "PageCenterMetaOAuthState"("expiresAt");
CREATE UNIQUE INDEX "PageCenterMetaAuthorization_userId_key" ON "PageCenterMetaAuthorization"("userId");
CREATE INDEX "PageCenterMetaAuthorization_orgId_idx" ON "PageCenterMetaAuthorization"("orgId");
CREATE INDEX "PageCenterMetaAuthorization_status_idx" ON "PageCenterMetaAuthorization"("status");
CREATE UNIQUE INDEX "PageCenterAuthorizedPage_userId_pageId_key" ON "PageCenterAuthorizedPage"("userId", "pageId");
CREATE INDEX "PageCenterAuthorizedPage_userId_status_idx" ON "PageCenterAuthorizedPage"("userId", "status");
CREATE INDEX "PageCenterAuthorizedPage_orgId_idx" ON "PageCenterAuthorizedPage"("orgId");
