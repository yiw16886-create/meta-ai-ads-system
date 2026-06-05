import prisma from './db/index.ts';

async function checkOrders() {
  const store = await prisma.store.findFirst({
    where: { name: 'kolaich' }
  });
  if (!store) {
    console.log('Store not found');
    return;
  }
  const o = await prisma.order.findMany({
    where: { storeId: store.id },
    take: 5
  });
  console.log(o);
}
checkOrders();
