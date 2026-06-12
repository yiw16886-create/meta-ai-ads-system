import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst({
    where: {
      name: 'romanticed'
    }
  });

  if (!store) {
    console.log("Store not found");
    process.exit(1);
  }

  console.log(`Store found: ${store.id} - ${store.name} - Platform: ${store.platform} - Timezone: ${store.timezone}`);

  const start = new Date("2026-06-11T00:00:00Z");
  const end = new Date("2026-06-11T23:59:59Z");

  const orders = await prisma.order.findMany({
    where: {
      storeId: store.id,
      createdAt: {
        gte: start,
        lte: end
      }
    }
  });

  console.log(`Found ${orders.length} orders:`);
  console.log(JSON.stringify(orders, null, 2));

  // let's also fetch orders ignoring date to see if there are any
  const allOrders = await prisma.order.findMany({
    where: {
      storeId: store.id
    }
  });
  console.log(`Total orders in DB for this store: ${allOrders.length}`);
  if (allOrders.length > 0) {
     console.log("Samples:");
     console.log(JSON.stringify(allOrders.slice(0, 5), null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
