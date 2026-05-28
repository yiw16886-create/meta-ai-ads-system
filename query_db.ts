import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.setting.findMany();
  console.log("Settings counts", settings.length);

  const stores = await prisma.store.findMany();
  console.log("\n------------ Stores ------------");
  for (const store of stores) {
    console.log(`- ID: ${store.id}, Name: ${store.name}, Domain: ${store.domain}`);
    console.log(`  Shopify Token: ${store.shopify_token ? "Set" : "Not Set"}`);
    console.log(`  Shopline Token: ${store.shopline_token ? "Set" : "Not Set"}`);
  }

  const metaAccounts = await prisma.adAccount.findMany();
  console.log("\n------------ Meta Accounts ------------");
  console.log(metaAccounts.map(a => `ID: ${a.fb_account_id}, Store ID: ${a.storeId}`));

  const rawInsights = await prisma.adInsight.count();
  console.log("Total adInsights:", rawInsights);

  const products = await prisma.product.count();
  console.log("Total products:", products);

  const creatives = await prisma.adCreative.count();
  console.log("Total creatives:", creatives);

  const aggProducts = await prisma.productPerformanceDaily.count();
  console.log("Total productPerformanceDaily:", aggProducts);

  const aggCreatives = await prisma.creativePerformanceDaily.count();
  console.log("Total creativePerformanceDaily:", aggCreatives);
}

main().catch(console.error).finally(() => prisma.$disconnect());
