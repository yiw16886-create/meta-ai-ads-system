import { aggregateData } from "./api_server/services/aggregation.service.js";
import { attributePurchases } from "./api_server/services/attribution.service.js";
import prisma from "./api_server/db.js";

async function main() {
  const startDate = '2024-04-01';
  const endDate = '2024-05-25';

  console.log("4. Attribute Purchases");
  await attributePurchases();

  console.log("5. Aggregate Data");
  await aggregateData(startDate, endDate);
}

main().catch(console.error).finally(() => prisma.$disconnect());
