#!/usr/bin/env bun
import prisma from './server/db/index.ts';
import axios from 'axios';

async function run() {
  const store = await prisma.store.findFirst({where:{name:'baslayer'}});
  const domain = store!.domain.replace(/^https?:\/\//, '');
  const tz = '-08:00';
  const url = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=2026-06-03T00:00:00${tz}&created_at_max=2026-06-03T23:59:59${tz}&limit=100`;
  const res = await axios.get(url, {headers:{'Authorization': 'Bearer '+store!.shopline_token}});
  let sales = 0; let c = 0;
  for (const o of res.data.data||[]) {
    if (o.financial_status === 'paid' || o.financial_status === 'refunded' || o.financial_status === 'partially_refunded') {
      sales += parseFloat(o.current_total_price || 0); c++;
      console.log(`Order ${o.id}: current_total=${o.current_total_price}, financial_status=${o.financial_status}, created_at=${o.created_at}, refunds=${o.refunds?.length}`);
    }
  }
  console.log(`Baslayer 06-03 total orders=${c}, sales=${sales}`);
}
run().catch(console.error);
