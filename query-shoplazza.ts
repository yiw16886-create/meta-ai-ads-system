import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: 'romanticed' }
  });

  if (!store || !store.shoplazza_token) {
    console.log("Store not found or missing token");
    return;
  }

  const domain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = {
    'Access-Token': store.shoplazza_token,
    'Content-Type': 'application/json'
  };

  const ordersUrl = `https://${domain}/openapi/2022-01/orders.json?limit=50&page=1`;
  console.log(`Fetching from ${ordersUrl}`);

  try {
    const res = await axios.get(ordersUrl, { headers });
    const orders = res.data.orders || [];
    console.log(`Fetched ${orders.length} orders from API`);
    
    // Let's print the relevant fields of these missing orders if they exist
    const targetOrderIds = ["254906204445092470545", "254906204426037806689", "254906204421115111217"];
    for (const o of orders) {
      if (targetOrderIds.includes(o.id.toString()) || targetOrderIds.includes(o.number?.toString())) {
        console.log(`--- Order ${o.id} ---`);
        console.log(`financial_status: ${o.financial_status}`);
        console.log(`created_at: ${o.created_at}`);
        console.log(`updated_at: ${o.updated_at}`);
        console.log(`processed_at: ${o.processed_at}`);
        console.log(`cancelled_at: ${o.cancelled_at}`);
        console.log(`cancel_reason: ${o.cancel_reason}`);
      }
    }

    // Also just list top 10 from API regardless
    console.log("Top 10 from API:");
    orders.slice(0, 10).forEach(o => {
      console.log(`ID: ${o.id}, financial_status: ${o.financial_status}, created_at: ${o.created_at}`);
    });

  } catch (err: any) {
    console.error("API Error", err?.response?.data || err?.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
