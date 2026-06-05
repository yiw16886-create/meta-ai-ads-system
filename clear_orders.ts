import prisma from './db/index.ts';
async function run() {
  await prisma.order.deleteMany({});
  console.log('Orders deleted!');
}
run().catch(console.error);
