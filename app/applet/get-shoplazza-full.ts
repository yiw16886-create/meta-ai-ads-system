import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
async function main() {
  const store = await prisma.store.findFirst({ where: { name: 'romanticed' } });
  if (!store || !store.shoplazza_token) return;
  const domain = "lachry.myshoplaza.com";
  const headers = { 'Access-Token': store.shoplazza_token, 'Content-Type': 'application/json' };
  const res = await axios.get(`https://${domain}/openapi/2022-01/orders?limit=50&page=1`, { headers });
  const orders = res.data.orders;
  console.log(`Fetched ${orders ? orders.length : 0} orders.`);
  if (orders && orders.length > 0) {
    console.log("First order ID:", orders[0].id, "Created at:", orders[0].created_at);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
