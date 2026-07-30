import prisma from "../../db/index.js";

let schemaReadyPromise: Promise<void> | null = null;

/**
 * Ensure the ad-level daily performance table exists in legacy databases.
 *
 * This project has an existing production database that is not baselined for
 * Prisma migrations (P3005). The statements are intentionally idempotent so
 * application startup and concurrent requests remain safe while the schema is
 * brought in line with prisma/schema.prisma.
 */
export function ensureAdPerformanceDailyTable(): Promise<void> {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdPerformanceDaily" (
        "id" SERIAL PRIMARY KEY,
        "date" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "adId" TEXT NOT NULL,
        "creativeId" TEXT,
        "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "impressions" INTEGER NOT NULL DEFAULT 0,
        "reach" INTEGER NOT NULL DEFAULT 0,
        "clicks" INTEGER NOT NULL DEFAULT 0,
        "linkClicks" INTEGER NOT NULL DEFAULT 0,
        "purchases" INTEGER NOT NULL DEFAULT 0,
        "purchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "addToCart" INTEGER NOT NULL DEFAULT 0,
        "initiateCheckout" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "AdPerformanceDaily_adId_date_key"
      ON "AdPerformanceDaily"("adId", "date")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS
      "AdPerformanceDaily_accountId_date_idx"
      ON "AdPerformanceDaily"("accountId", "date")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS
      "AdPerformanceDaily_creativeId_date_idx"
      ON "AdPerformanceDaily"("creativeId", "date")
    `);
  })().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });

  return schemaReadyPromise;
}
