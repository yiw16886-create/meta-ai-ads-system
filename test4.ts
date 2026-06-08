import prisma from './db/index.js';
import axios from 'axios';

async function run() {
  const store = await prisma.store.findFirst({where:{name:'baslayer'}});
  const domain = store.domain.replace(/^https?:\/\//, '');
  const tz = '-08:00';
  const url = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=2026-06-03T00:00:00${tz}&created_at_max=2026-06-03T23:59:59${tz}&limit=100`;
  const res = await axios.get(url, {headers:{'Authorization': 'Bearer '+store.shopline_token}});
  
  let salesWithCancel = 0; let cWithCancel = 0;
  let salesNoCancel = 0; let cNoCancel = 0;
  
  for (const o of res.data.data||[]) {
    // Only paid/refunded
    if (o.financial_status === 'paid' || o.financial_status === 'refunded' || o.financial_status === 'partially_refunded') {
      salesWithCancel += parseFloat(o.current_total_price || 0);
      cWithCancel++;
      
      if (!o.cancelled_at && !o.cancel_reason) {
        salesNoCancel += parseFloat(o.current_total_price || 0);
        cNoCancel++;
      }
    }
  }
  console.log(`With Cancel: c=${cWithCancel}, s=${salesWithCancel}`);
  console.log(`No Cancel: c=${cNoCancel}, s=${salesNoCancel}`);
}
run().catch(console.error);
