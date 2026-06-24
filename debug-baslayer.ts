import prisma from "./db/index.js";

async function main() {
  console.log("=== DB Query for store: baslayer ===");
  const store = await prisma.store.findFirst({
    where: {
      name: {
        contains: "baslayer",
        mode: "insensitive"
      }
    }
  });
  console.log("Store details in DB:", store);

  if (store) {
    const orders = await prisma.order.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    console.log("Recent 5 orders in DB:", orders);

    const ordersCount = await prisma.order.count({
      where: { storeId: store.id }
    });
    console.log("Total orders in DB:", ordersCount);
  }
}

main().catch(console.error);
