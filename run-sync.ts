import { syncStoreData } from './server/services/store-sync.service';

async function main() {
  console.log("Triggering Shoplazza Sync with correct Store Timezone...");
  // Sync for jun 11 specifically
  await syncStoreData("2026-06-11", "2026-06-11", "romanticed");
}

main().catch(console.error).then(() => {
    console.log("Done");
    process.exit(0);
});
