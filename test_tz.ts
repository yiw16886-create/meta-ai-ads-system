import prisma from './db/index.ts';
import axios from 'axios';

async function testFetch() {
  const store = await prisma.store.findFirst({ where: { name: 'kolaich' } });
  if (!store || !store.shopline_token) return;

  const domain = store.domain.replace(/^https?:\/\//, "");
  const headers = { 'Authorization': `Bearer ${store.shopline_token}` };
  
  let url = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=2026-06-05T00:00:00+08:00&created_at_max=2026-06-05T23:59:59+08:00&limit=100`;
  let res = await axios.get(url, { headers });
  let openSales = 0;
  for (const o of (res.data.data || res.data.orders || [])) {
    if (o.financial_status === 'paid' && o.status === 'open') {
       openSales += parseFloat(o.current_total_price || 0);
    }
  }
  console.log('Total Open Sales:', openSales);
}

testFetch().catch(console.error);
