import prisma from './api_server/db';
import { syncStoreData } from './api_server/services/store-sync.service';

async function main() {
  console.log("Triggering Store Data Sync...");
  await syncStoreData('2024-04-01', '2024-05-25');
  console.log("Done");
}

main().catch(console.error).finally(()=>prisma.$disconnect());
