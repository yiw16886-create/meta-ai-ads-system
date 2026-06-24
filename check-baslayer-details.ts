import axios from "axios";
import prisma from "./db/index.js";
import { getTimezoneOffsetStr } from "./server/utils.js";

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "baslayer", mode: "insensitive" } }
  });

  if (!store) {
    console.error("Store baslayer not found!");
    return;
  }

  console.log("Store from DB:", {
    id: store.id,
    name: store.name,
    platform: store.platform,
    domain: store.domain,
    timezoneInDB: store.timezone
  });

  // Try to query Shopline Shop API directly with the candidate endpoints
  const cleanDomain = store.domain;
  const token = store.shopline_token;

  const shoplineCandidates = [
    `https://${cleanDomain}/admin/openapi/v20240301/shop.json`,
    `https://${cleanDomain}/admin/openapi/v20220301/shop.json`,
    `https://${cleanDomain}/admin/openapi/v20201201/shop.json`,
    `https://${cleanDomain}/admin/openapi/v20220101/shop.json`,
    `https://${cleanDomain}/admin/openapi/shop.json`,
    `https://${cleanDomain}/admin/api/v20200901/shop.json`,
    `https://${cleanDomain}/admin/api/shop.json`
  ];

  console.log("\n--- Querying Shopline API Candidates ---");
  for (const url of shoplineCandidates) {
    try {
      console.log(`Trying URL: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      console.log(`SUCCESS! Response data:`, JSON.stringify(response.data).substring(0, 500));
      const shopTz = response.data?.data?.timezone || response.data?.shop?.timezone;
      console.log(`Detected timezone from payload:`, shopTz);
      break;
    } catch (e: any) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  // Now, let's analyze orders in our DB for baslayer
  console.log("\n--- Analyzing Orders in DB for baslayer ---");
  const allOrders = await prisma.order.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "asc" }
  });

  console.log(`Total orders in DB: ${allOrders.length}`);

  // Test different timezone offsets for range 2026-06-15 to 2026-06-22
  const targetTimezones = [
    "America/Los_Angeles", // -07:00 / -08:00
    "UTC",                 // +00:00
    "Asia/Shanghai",       // +08:00
    "GMT+08:00",
    "America/New_York",    // -04:00
  ];

  for (const tz of targetTimezones) {
    const tzOffset = getTimezoneOffsetStr(tz);
    const start = new Date(`2026-06-15T00:00:00${tzOffset}`);
    const end = new Date(`2026-06-22T23:59:59.999${tzOffset}`);

    const filtered = allOrders.filter(o => o.createdAt >= start && o.createdAt <= end);
    
    // Group by orderId to match totalSales/totalOrders calculation
    const seenOrderIds = new Set();
    let totalSales = 0;
    let totalOrdersCount = 0;
    for (const o of filtered) {
      const uniqueKey = o.orderId || o.createdAt.toISOString();
      if (!seenOrderIds.has(uniqueKey)) {
        seenOrderIds.add(uniqueKey);
        totalOrdersCount++;
        if (o.orderTotal != null && o.orderTotal > 0) {
          totalSales += o.orderTotal;
        } else {
          totalSales += (o.revenue || 0);
        }
      } else {
        if (o.orderTotal == null || o.orderTotal === 0) {
          totalSales += (o.revenue || 0);
        }
      }
    }

    console.log(`Timezone: ${tz} (offset ${tzOffset}) -> Orders count: ${totalOrdersCount}, Total Sales: $${totalSales.toFixed(2)}`);
  }
}

main().catch(console.error);
