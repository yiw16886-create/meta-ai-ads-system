import prisma from './api/db.js';
import { syncStoreData } from './api/services/store-sync.service.js';

async function main() {
  console.log("Triggering Store Data Sync...");
  await syncStoreData('2024-04-01', '2024-05-25');
  console.log("Done");
}

main().catch(console.error).finally(()=>prisma.$disconnect());
