-- CreateTable
CREATE TABLE "AdInsight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" REAL NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "initiateCheckout" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValue" REAL NOT NULL DEFAULT 0,
    "cpc" REAL NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "atcRate" REAL NOT NULL DEFAULT 0,
    "checkoutRate" REAL NOT NULL DEFAULT 0,
    "cpp" REAL NOT NULL DEFAULT 0,
    "roas" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AdInsight_accountId_date_key" ON "AdInsight"("accountId", "date");
