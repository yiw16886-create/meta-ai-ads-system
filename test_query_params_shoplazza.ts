import prisma from './db/index.ts';
import axios from 'axios';

async function main() {
  const storeId = 129;
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return;
  const domain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = { 'Access-Token': store.shoplazza_token, 'Content-Type': 'application/json' };

  // Date range
  const startDate = '2026-06-03';
  const endDate = '2026-06-05';
  
  // Option A: Original query format (Raw timezone offset)
  const tzOffset = '-08:00';
  const urlOriginal = `https://${domain}/openapi/2022-01/orders?status=any&created_at_min=${startDate}T00:00:00${tzOffset}&created_at_max=${endDate}T23:59:59${tzOffset}&limit=50`;
  
  // Option B: Query with URL encoded offset
  const tzOffsetEncoded = encodeURIComponent(tzOffset);
  const urlEncoded = `https://${domain}/openapi/2022-01/orders?status=any&created_at_min=${startDate}T00:00:00${tzOffsetEncoded}&created_at_max=${endDate}T23:59:59${tzOffsetEncoded}&limit=50`;

  // Option C: Query with UTC representation
  const urlUtc = `https://${domain}/openapi/2022-01/orders?status=any&created_at_min=2026-06-03T00:00:00Z&created_at_max=2026-06-05T23:59:59Z&limit=50`;

  // Option D: Query without status=any
  const urlNoStatus = `https://${domain}/openapi/2022-01/orders?created_at_min=2026-06-03T00:00:00Z&created_at_max=2026-06-05T23:59:59Z&limit=50`;

  // Option E: Query using simple date-only format
  const urlSimpleDates = `https://${domain}/openapi/2022-01/orders?created_at_min=2026-06-03&created_at_max=2026-06-05&limit=50`;

  const runs = [
    { name: 'Original (Raw Offset)', url: urlOriginal },
    { name: 'UrlEncoded Offset', url: urlEncoded },
    { name: 'UTC Z Format', url: urlUtc },
    { name: 'UTC Z Format (No status=any)', url: urlNoStatus },
    { name: 'Simple Dates (YYYY-MM-DD)', url: urlSimpleDates }
  ];

  for (const run of runs) {
    try {
      const res = await axios.get(run.url, { headers });
      const orders = res.data.orders || [];
      console.log(`[${run.name}] -> Success! Returns ${orders.length} orders. Url: ${run.url}`);
    } catch (err: any) {
      console.log(`[${run.name}] -> FAILED: ${err.message}. Url: ${run.url}`);
    }
  }
}

main().catch(console.error);
