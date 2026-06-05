import prisma from './db/index.ts';
async function test() {
  const store = await prisma.store.findFirst({ where: { name: 'kolaich' } });
  const orders = await prisma.order.findMany({
    where: { 
      storeId: store.id,
      createdAt: {
        gte: new Date('2026-06-04T00:00:00.000Z'),
        lte: new Date('2026-06-04T23:59:59.999Z')
      }
    }
  });
  console.log(`Orders: ${orders.length}`);
  let totalSales = 0;
  let totalOrders = 0;
  const seenOrderIds = new Set();
  
  for (const o of orders) {
    const uniqueKey = o.orderId || o.createdAt.toISOString();
    if (!seenOrderIds.has(uniqueKey)) {
      seenOrderIds.add(uniqueKey);
      totalOrders++;
      if (o.orderTotal != null) {
        totalSales += o.orderTotal;
      } else {
        totalSales += (o.revenue || 0);
      }
    } else {
      if (o.orderTotal == null) {
        totalSales += (o.revenue || 0);
      }
    }
  }
  console.log({ totalSales, totalOrders });
}
test();
