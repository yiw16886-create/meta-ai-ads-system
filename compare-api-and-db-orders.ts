import axios from "axios";
import prisma from "./db/index.js";

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
  const tzOffset = "-07:00"; // America/Los_Angeles

  const ordersUrl = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=${startDate}T00:00:00${tzOffset}&created_at_max=${endDate}T23:59:59${tzOffset}&limit=100`;

  try {
    const res = await axios.get(ordersUrl, { headers });
    const apiOrders = res.data.data || res.data.orders || [];

    console.log(`=== COMPARISON: API vs DB ===`);
    console.log(`API returned ${apiOrders.length} orders in total`);

    const dbOrders = await prisma.order.findMany({
      where: { storeId: store.id }
    });

    const dbOrderIds = new Set(dbOrders.map(o => o.orderId));
    console.log(`DB has ${dbOrderIds.size} unique order IDs in total`);

    let missingInDB: any[] = [];
    let inDBCnt = 0;

    let apiTotalSubtotal = 0;
    let apiTotalCurrentPrice = 0;

    for (const o of apiOrders) {
      const subtotal = parseFloat(o.subtotal_price || o.total_line_items_price || 0);
      const currentPrice = parseFloat(o.current_total_price || 0);
      apiTotalSubtotal += subtotal;
      apiTotalCurrentPrice += currentPrice;

      if (dbOrderIds.has(o.id.toString())) {
        inDBCnt++;
      } else {
        missingInDB.push({
          id: o.id,
          name: o.name,
          financial_status: o.financial_status,
          created_at: o.created_at,
          subtotal,
          currentPrice
        });
      }
    }

    console.log(`Found in DB: ${inDBCnt}`);
    console.log(`Missing in DB: ${missingInDB.length}`);
    if (missingInDB.length > 0) {
      console.log("Missing orders:", missingInDB);
    }

    console.log(`\nShopline API Total Subtotal: $${apiTotalSubtotal.toFixed(2)}`);
    console.log(`Shopline API Total Current Price (with shipping/tax): $${apiTotalCurrentPrice.toFixed(2)}`);

  } catch (e: any) {
    console.error(e.message);
  }
}

main().catch(console.error);
