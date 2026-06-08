import prisma from './db/index.ts';

async function listStores() {
  const stores = await prisma.store.findMany();
  console.log('Stores in DB:');
  for (const s of stores) {
    console.log(`- ID: ${s.id}, Name: ${s.name}, Platform: ${s.platform}, Domain: ${s.domain}`);
    console.log(`  Shoplazza Token: ${s.shoplazza_token ? 'YES' : 'NO'}, Shopline Token: ${s.shopline_token ? 'YES' : 'NO'}`);
  }
}
listStores();
