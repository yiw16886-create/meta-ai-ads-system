import prisma from "./db/index.js";

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "baslayer", mode: "insensitive" } }
  });

  if (!store) {
    console.error("Store not found!");
    return;
  }

  const orders = await prisma.order.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "asc" }
  });

  console.log(`Analyzing timezone offsets for range 2026-06-15 to 2026-06-22...`);

  // Sweep offsets from -12 to +14 hours
  for (let h = -12; h <= 14; h++) {
    const sign = h < 0 ? "-" : "+";
    const absH = Math.abs(h);
    const offsetStr = `${sign}${String(absH).padStart(2, '0')}:00`;

    const start = new Date(`2026-06-15T00:00:00${offsetStr}`);
    const end = new Date(`2026-06-22T23:59:59.999${offsetStr}`);

    const filtered = orders.filter(o => o.createdAt >= start && o.createdAt <= end);

    // 1. Deduplicated orderTotal
    const seenOrderIds = new Set();
    let totalSalesUniqueTotal = 0;
    let totalOrdersCount = 0;
    for (const o of filtered) {
      const uniqueKey = o.orderId || o.createdAt.toISOString();
      if (!seenOrderIds.has(uniqueKey)) {
        seenOrderIds.add(uniqueKey);
        totalOrdersCount++;
        totalSalesUniqueTotal += o.orderTotal || 0;
      }
    }

    // 2. Sum of line item revenues
    let totalLineItemRevenue = filtered.reduce((sum, o) => sum + (o.revenue || 0), 0);

    // 3. Shoplazza style
    // (o.orderTotal != null && o.orderTotal > 0) ? o.orderTotal : o.revenue
    let shoplazzaSales = 0;
    const seenShoplazza = new Set();
    for (const o of filtered) {
      const uniqueKey = o.orderId || o.createdAt.toISOString();
      if (!seenShoplazza.has(uniqueKey)) {
        seenShoplazza.add(uniqueKey);
        shoplazzaSales += (o.orderTotal != null && o.orderTotal > 0) ? o.orderTotal : (o.revenue || 0);
      }
    }

    // 4. Filter out refunded
    const activeLineItems = filtered.filter(o => !o.refunded);
    let activeLineItemRevenue = activeLineItems.reduce((sum, o) => sum + (o.revenue || 0), 0);

    const activeSeen = new Set();
    let activeOrdersCount = 0;
    let activeSalesUniqueTotal = 0;
    for (const o of activeLineItems) {
      const uniqueKey = o.orderId || o.createdAt.toISOString();
      if (!activeSeen.has(uniqueKey)) {
        activeSeen.add(uniqueKey);
        activeOrdersCount++;
        activeSalesUniqueTotal += o.orderTotal || 0;
      }
    }

    console.log(`Offset ${offsetStr} | ` +
                `Unique Orders: ${totalOrdersCount}, Deduplicated Sales: $${totalSalesUniqueTotal.toFixed(2)} | ` +
                `Line Revenue: $${totalLineItemRevenue.toFixed(2)} | ` +
                `Active Orders: ${activeOrdersCount}, Active Deduplicated Sales: $${activeSalesUniqueTotal.toFixed(2)} | ` +
                `Active Line Revenue: $${activeLineItemRevenue.toFixed(2)}`);
  }
}

main().catch(console.error);
