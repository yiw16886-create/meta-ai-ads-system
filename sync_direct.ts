import { syncStoreData } from './server/services/store-sync.service.ts';
async function testSync() {
  const today = new Date().toISOString().split('T')[0];
  const past = new Date(Date.now() - 4 * 86400 * 1000).toISOString().split('T')[0];
  console.log(`Syncing from ${past} to ${today}...`);
  await syncStoreData(past, today, "kolaich");
  console.log('done');
}
testSync();
