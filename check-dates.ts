import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: 'romanticed' }
  });

  if (!store) {
    console.log("Store not found");
    return;
  }

  const startDate = "2026-06-11";
  const endDate = "2026-06-11";
  
  const startObj = dayjs.tz(`${startDate}T00:00:00`, store.timezone).utc().toDate();
  const endObj = dayjs.tz(`${endDate}T23:59:59`, store.timezone).utc().toDate();

  console.log(`Querying from ${startObj.toISOString()} to ${endObj.toISOString()}`);

  const orders = await prisma.order.findMany({
    where: {
      storeId: store.id,
      createdAt: {
        gte: startObj,
        lte: endObj
      }
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderId: true, createdAt: true, revenue: true, orderTotal: true }
  });

  // group by orderId inside memory
  const orderMap = new Map();
  let totalRevenue = 0;
  for (const o of orders) {
    totalRevenue += o.revenue;
    if (!orderMap.has(o.orderId)) {
        orderMap.set(o.orderId, { orderId: o.orderId, createdAt_PDT: dayjs(o.createdAt).tz("America/Los_Angeles").format('YYYY-MM-DD HH:mm:ss'), total: o.orderTotal });
    }
  }

  console.log(`Found ${orders.length} line items, total orders: ${orderMap.size}, total revenue: $${totalRevenue.toFixed(2)}`);
  console.table(Array.from(orderMap.values()));
}

main().catch(console.error).finally(() => prisma.$disconnect());
