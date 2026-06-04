import { aggregateData } from "./server/services/aggregation.service.js";
import { attributePurchases } from "./server/services/attribution.service.js";
import prisma from "./db/index.js";

async function main() {
  const startDate = '2024-04-01';
  const endDate = '2024-05-25';

  console.log("4. Attribute Purchases");
  await attributePurchases();

  console.log("5. Aggregate Data");
  await aggregateData(startDate, endDate);
}

main().catch(console.error).finally(() => prisma.$disconnect());
