import prisma from './db/index.js';
import { syncStoreData } from './server/services/store-sync.service.js';

async function main() {
  console.log("Triggering Store Data Sync...");
  await syncStoreData('2024-04-01', '2024-05-25');
  console.log("Done");
}

main().catch(console.error).finally(()=>prisma.$disconnect());
