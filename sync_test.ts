import { syncStoreData } from "./api/services/store-sync.service.js";
import { syncMetaHierarchy, ensureAdAccounts } from "./api/services/meta-hierarchy-sync.service.js";
import { aggregateData } from "./api/services/aggregation.service.js";
import { attributePurchases } from "./api/services/attribution.service.js";
import prisma from "./api/db.js";

async function main() {
  const startDate = '2024-04-01';
  const endDate = '2024-05-25';

  const setting = await prisma.setting.findUnique({ where: { key: "META_ACCESS_TOKEN" }});
  const token = setting?.value || process.env.META_ACCESS_TOKEN;

  if (!token) {
    console.log("No META_ACCESS_TOKEN found.");
    return;
  }

  console.log("1. Ensure AdAccounts");
  await ensureAdAccounts(token);

  console.log("2. Sync Meta Hierarchy");
  await syncMetaHierarchy(token);

  console.log("3. Sync Store Data");
  await syncStoreData(startDate, endDate);

  console.log("4. Attribute Purchases");
  await attributePurchases();

  console.log("5. Aggregate Data");
  await aggregateData(startDate, endDate);
}

main().catch(console.error).finally(() => prisma.$disconnect());
