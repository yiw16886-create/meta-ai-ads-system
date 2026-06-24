import prisma from "./db/index.js";

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "baslayer", mode: "insensitive" } }
  });

  if (!store) {
    console.error("Store baslayer not found!");
    return;
  }

  // Fetch all orders for this store
  const orders = await prisma.order.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "asc" }
  });

  console.log(`\n=== Total Orders: ${orders.length} ===`);

  // Let's analyze orders with different interpretations
  const tzOffset = "-07:00"; // America/Los_Angeles
  const start = new Date(`2026-06-15T00:00:00${tzOffset}`);
  const end = new Date(`2026-06-22T23:59:59.999${tzOffset}`);

  const filtered = orders.filter(o => o.createdAt >= start && o.createdAt <= end);
  console.log(`Orders falling strictly within 2026-06-15 to 2026-06-22 (America/Los_Angeles): ${filtered.length}`);

  // Let's print each unique orderId and its values
  const seenOrderIds = new Set<string>();
  const orderDetails: any[] = [];
  let totalSalesWithDeduplication = 0;
  let totalSalesWithoutDeduplication = 0;

  for (const o of filtered) {
    const key = o.orderId || o.createdAt.toISOString();
    totalSalesWithoutDeduplication += o.revenue || 0;
    if (!seenOrderIds.has(key)) {
      seenOrderIds.add(key);
      totalSalesWithDeduplication += o.orderTotal || 0;
      orderDetails.push({
        orderId: o.orderId,
        orderTotal: o.orderTotal,
        revenue: o.revenue,
        createdAt: o.createdAt.toISOString()
      });
    }
  }

  console.log(`Unique Orders: ${seenOrderIds.size}`);
  console.log(`Sum of unique orderTotal (deduplicated): $${totalSalesWithDeduplication.toFixed(2)}`);
  console.log(`Sum of revenue (non-deduplicated): $${totalSalesWithoutDeduplication.toFixed(2)}`);

  console.log("\nFirst 10 filtered unique orders:");
  console.log(orderDetails.slice(0, 10));

  console.log("\nLast 10 filtered unique orders:");
  console.log(orderDetails.slice(-10));
}

main().catch(console.error);
