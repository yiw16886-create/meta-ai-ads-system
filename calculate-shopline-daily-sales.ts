import axios from "axios";
import prisma from "./db/index.js";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "baslayer", mode: "insensitive" } }
  });

  if (!store) return;

  const domain = store.domain;
  const token = store.shopline_token;
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const startDate = "2026-06-15";
  const endDate = "2026-06-22";

  console.log("=== Timezone Sweep for Daily Sales on 2026-06-15 ===");

  const targetOffsets = [
    "-12:00", "-11:00", "-10:00", "-09:00", "-08:00", "-07:00", "-06:00", "-05:00", "-04:00", "-03:00", "-02:00", "-01:00",
    "+00:00", "+01:00", "+02:00", "+03:00", "+04:00", "+05:00", "+06:00", "+07:00", "+08:00", "+09:00", "+10:00", "+11:00",
    "+12:00", "+13:00", "+14:00"
  ];

  for (const offsetStr of targetOffsets) {
    const encodedOffset = offsetStr.replace("+", "%2B");
    const ordersUrl = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=${startDate}T00:00:00${encodedOffset}&created_at_max=${endDate}T23:59:59${encodedOffset}&limit=100`;

    try {
      const res = await axios.get(ordersUrl, { headers });
      const apiOrders = res.data.data || res.data.orders || [];

      // We will group by date under this offset/timezone
      // Let's approximate offset hours
      const hours = parseInt(offsetStr.split(":")[0], 10);

      let count15 = 0;
      let subtotal15 = 0;
      let linePrice15 = 0;
      let currentPrice15 = 0;
      let linePriceMinusDiscounts15 = 0;

      for (const o of apiOrders) {
        // Adjust o.created_at (which is ISO string) by offset hours
        // For example, if o.created_at is '2026-06-15T10:55:27.000Z', 
        // local time is UTC + hours.
        const d = dayjs(o.created_at).utc().add(hours, "hour");
        const dateStr = d.format("YYYY-MM-DD");

        if (dateStr === "2026-06-15") {
          count15++;
          subtotal15 += parseFloat(o.subtotal_price || 0);
          linePrice15 += parseFloat(o.total_line_items_price || 0);
          currentPrice15 += parseFloat(o.current_total_price || o.total_price || 0);

          let itemDiscounts = 0;
          let lineTotal = 0;
          for (const item of o.line_items) {
            const itemTitle = (item.title || "").toLowerCase();
            if (itemTitle.includes("shipping protection") || itemTitle.includes("protection")) {
              continue;
            }
            lineTotal += parseFloat(item.price || 0) * (item.quantity || 1);
            if (item.discount_allocations) {
              for (const da of item.discount_allocations) {
                itemDiscounts += parseFloat(da.amount || 0);
              }
            }
          }
          linePriceMinusDiscounts15 += (lineTotal - itemDiscounts);
        }
      }

      console.log(`Offset ${offsetStr} | Count: ${count15} | ` +
                  `Subtotal: $${subtotal15.toFixed(2)} | ` +
                  `LinePrice: $${linePrice15.toFixed(2)} | ` +
                  `CurrentPrice: $${currentPrice15.toFixed(2)} | ` +
                  `ProductSales: $${linePriceMinusDiscounts15.toFixed(2)}`);
    } catch (e: any) {
      // ignore
    }
  }
}

main().catch(console.error);
