import prisma from './db/index.js';
async function run() {
  await prisma.order.deleteMany({});
  console.log('Orders deleted!');
}
run().catch(console.error);
