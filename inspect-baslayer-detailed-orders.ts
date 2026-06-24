import prisma from "./db/index.js";

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "baslayer", mode: "insensitive" } }
  });

  if (!store) {
    console.error("Store not found!");
    return;
  }

  const tzOffset = "-07:00"; // America/Los_Angeles
  const start = new Date(`2026-06-15T00:00:00${tzOffset}`);
  const end = new Date(`2026-06-22T23:59:59.999${tzOffset}`);

  const orders = await prisma.order.findMany({
    where: {
      storeId: store.id,
      createdAt: {
        gte: start,
        lte: end
      }
    }
  });

  console.log(`--- Detailed breakdown for America/Los_Angeles offset ${tzOffset} ---`);
  console.log(`Total order line items: ${orders.length}`);

  // Group by orderId
  const ordersMap = new Map<string, any[]>();
  for (const o of orders) {
    const key = o.orderId;
    if (!ordersMap.has(key)) {
      ordersMap.set(key, []);
    }
    ordersMap.get(key)!.push(o);
  }

  console.log(`Unique order count: ${ordersMap.size}`);

  let sumOfUniqueOrderTotal = 0;
  let sumOfLineItemRevenue = 0;
  let hasDiffOrderTotal = 0;

  console.log("\nSome orders with multiple line items:");
  let printedCount = 0;

  for (const [orderId, items] of ordersMap.entries()) {
    const firstItem = items[0];
    sumOfUniqueOrderTotal += firstItem.orderTotal || 0;
    
    let orderRevenueSum = 0;
    for (const item of items) {
      sumOfLineItemRevenue += item.revenue || 0;
      orderRevenueSum += item.revenue || 0;
    }

    if (Math.abs(orderRevenueSum - (firstItem.orderTotal || 0)) > 0.01) {
      hasDiffOrderTotal++;
      if (printedCount < 10) {
        console.log(`OrderId: ${orderId} | orderTotal: ${firstItem.orderTotal} | sumOfLineItemRevenue: ${orderRevenueSum} | Items count: ${items.length}`);
        for (const item of items) {
          console.log(`  -> ItemId: ${item.id} | revenue: ${item.revenue}`);
        }
        printedCount++;
      }
    }
  }

  console.log(`\nSum of unique orderTotal: $${sumOfUniqueOrderTotal.toFixed(2)}`);
  console.log(`Sum of line item revenues: $${sumOfLineItemRevenue.toFixed(2)}`);
  console.log(`Number of orders where sum of line items !== orderTotal: ${hasDiffOrderTotal}`);
}

main().catch(console.error);
