import prisma from './server/db/index.js';
import axios from 'axios';

async function testFetch() {
  const store = await prisma.store.findFirst({ where: { name: 'baslayer' } });
  if (!store || !store.shopline_token) return;

  const domain = store.domain.replace(/^https?:\/\//, "");
  const headers = { 'Authorization': `Bearer ${store.shopline_token}` };
  
  let url = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=2026-06-03T00:00:00-08:00&created_at_max=2026-06-03T23:59:59-08:00&limit=100`;
  let res = await axios.get(url, { headers });
  
  const orders = res.data.data || res.data.orders || [];
  let s1 = 0; let s2 = 0;
  for (const o of orders) {
    if (o.financial_status === "paid" || o.financial_status === "refunded" || o.financial_status === "partially_refunded") {
      s1 += parseFloat(o.current_total_price || 0);
      s2 += parseFloat(o.total_price || 0);
    }
    if (o.financial_status === "paid") {
       console.log(`Paid Order ${o.id}: current_total=${o.current_total_price}, total=${o.total_price}`);
    }
  }
  console.log(`Total Sales: ${s1}, ${s2}`);
}

testFetch().catch(console.error);
