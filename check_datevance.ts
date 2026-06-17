import { PrismaClient } from '@prisma/client';
import { extractMetaAssetHash } from './server/services/metaFetchPatch.service';

const prisma = new PrismaClient();

async function main() {
  const accountMapping = await prisma.accountMapping.findMany({
    where: { project: 'datevance' } // The name might be datevance? I'll check store table
  });
  console.log('Mappings:', accountMapping.map(m => m.fbAccountId));

  const store = await prisma.store.findFirst({
    where: { name: 'datevance' }
  });
  console.log('Store:', store);

  if (store) {
    const creatives = await prisma.adCreative.findMany({
      where: {
        storeId: store.id,
        type: 'VIDEO',
        landingUrl: { contains: 'facebook.com' }
      }
    });
    console.log(`Found ${creatives.length} creatives with facebook.com URLs for store ${store.name}`);
    for (const c of creatives) {
       console.log(`Creative ${c.creativeId}: ${c.landingUrl}`);
    }
  } else {
    // If not found by store name, try looking at all
    const allStores = await prisma.store.findMany();
    console.log("All stores:", allStores.map(s => s.name));
    
    // Look up creative from screenshot: 120245888356350545 is an Ad ID.
    const ad = await prisma.ad.findFirst({ where: { id: "120245888356350545" }, include: { creative: true }});
    console.log("Ad:", ad);
  }
}

main().catch(console.dir).finally(() => prisma.$disconnect());
