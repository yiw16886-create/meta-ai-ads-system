import prisma from './db/index.ts';
import axios from 'axios';

async function fetchShopline() {
  const store = await prisma.store.findFirst({
    where: { name: 'kolaich' }
  });
  if (!store || !store.shopline_token) return console.log('No token');
  const domain = store.domain.replace(/^https?:\/\//, "");
  const headers = { 'Authorization': `Bearer ${store.shopline_token}` };
  const url = `https://${domain}/admin/openapi/v20240301/orders.json?limit=1`;
  const res = await axios.get(url, { headers });
  console.log(JSON.stringify(res.data.data?.[0] || res.data.orders?.[0], null, 2));
}
fetchShopline();
