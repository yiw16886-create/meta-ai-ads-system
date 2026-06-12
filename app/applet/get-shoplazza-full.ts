import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
async function main() {
  const store = await prisma.store.findFirst({ where: { name: 'romanticed' } });
  if (!store || !store.shoplazza_token) return;
  const domain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = { 'Access-Token': store.shoplazza_token, 'Content-Type': 'application/json' };
  const res = await axios.get(`https://${domain}/openapi/2022-01/orders?limit=50&page=1`, { headers });
  const orders = res.data.orders;
  for (const o of orders) {
    if (["254906204410702276292", "254906204376559788467", "254906204394663134326", "254906204421115111217"].includes(o.id.toString())) {
       console.log(`Order ${o.id}: Status: ${o.status}, Financial: ${o.financial_status}, Note: ${o.note?.substring(0, 50)}, cancelled_at: ${o.cancelled_at}`);
       console.log(`   is_deleted: ${o.is_deleted}, source_name: ${o.source_name}, tags: ${o.tags}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
