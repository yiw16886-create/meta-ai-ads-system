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
  
  const targetOrderIds = [
    "254906204445092470545", 
    "254906204426037806689", 
    "254906204421115111217", 
    "254906204410702276292", 
    "254906204394663134326", 
    "254906204376559788467"
  ];
  
  console.log("Finding all 6 target orders in recent 50:");
  for (const o of orders) {
    if (targetOrderIds.includes(o.id.toString())) {
       console.log(`\nOrder: ${o.id}`);
       console.log(`  created_at: ${o.created_at}`);
       console.log(`  updated_at: ${o.updated_at}`);
       console.log(`  paid_at: ${o.paid_at || o.processed_at}`);
       console.log(`  total_price: ${o.total_price}`);
       console.log(`  financial_status: ${o.financial_status}`);
       console.log(`  status: ${o.status}`);
       console.log(`  test: ${o.test}`);
       console.log(`  app_id: ${o.app_id}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
