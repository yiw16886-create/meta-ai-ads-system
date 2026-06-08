import prisma from './server/db/index.js';
import axios from 'axios';

async function run() { 
  const store = await prisma.store.findFirst({where:{name:'baslayer'}});
  const domain = store!.domain.replace(/^https?:\/\//, ''); 
  
  for (const tz of ["-04:00", "-08:00", "+00:00", "+08:00", "Z"]) {
    const res = await axios.get('https://' + domain + '/admin/openapi/v20240301/orders.json?status=any&created_at_min=2026-06-03T00:00:00'+tz+'&created_at_max=2026-06-03T23:59:59'+tz+'&limit=100', {headers:{'Authorization': 'Bearer '+store!.shopline_token}}); 
    const orders = res.data.data; 
    let sales=0; let c=0; 
    for (const o of orders) { 
        if (o.financial_status === 'paid' || o.financial_status === 'partially_refunded' || o.financial_status === 'refunded') {
            sales += parseFloat(o.current_total_price||0); c++; 
        } 
    } 
    console.log(`TZ ${tz}: baslayer`, c, sales);
  }
} 
run().catch(console.error);
