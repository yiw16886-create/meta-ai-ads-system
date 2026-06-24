import axios from "axios";
import prisma from "./db/index.js";

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "baslayer", mode: "insensitive" } }
  });

  if (!store) {
    console.error("Store baslayer not found!");
    return;
  }

  const domain = store.domain;
  const token = store.shopline_token;
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Date range 2026-06-15 to 2026-06-22
  const startDate = "2026-06-15";
  const endDate = "2026-06-22";
  const tzOffset = "-07:00"; // America/Los_Angeles

  const ordersUrl = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=${startDate}T00:00:00${tzOffset}&created_at_max=${endDate}T23:59:59${tzOffset}&limit=100`;

  console.log(`Fetching from Shopline: ${ordersUrl}`);
  try {
    const res = await axios.get(ordersUrl, { headers });
    const orders = res.data.data || res.data.orders || [];
    console.log(`Total orders returned from API: ${orders.length}`);

    // Let's summarize and inspect statuses of each returned order
    let cancelledCount = 0;
    let allowedStatusCount = 0;
    let disallowedStatusCount = 0;
    let cancelledButNotReason = 0;
    let financialStatusCounts: Record<string, number> = {};

    const list: any[] = [];

    for (const o of orders) {
      const allowedStatuses = ['paid', 'pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded'];
      const currentStatus = String(o.financial_status || "").toLowerCase();
      financialStatusCounts[currentStatus] = (financialStatusCounts[currentStatus] || 0) + 1;

      const isAllowedStatus = allowedStatuses.includes(currentStatus);
      const isCancelled = o.cancelled_at || o.cancel_reason;

      if (isCancelled) {
        cancelledCount++;
      }
      if (isAllowedStatus) {
        allowedStatusCount++;
      } else {
        disallowedStatusCount++;
      }

      list.push({
        id: o.id,
        financial_status: o.financial_status,
        cancelled_at: o.cancelled_at,
        cancel_reason: o.cancel_reason,
        total_price: o.total_price,
        created_at: o.created_at
      });
    }

    console.log(`Financial statuses counts:`, financialStatusCounts);
    console.log(`Cancelled orders count: ${cancelledCount}`);
    console.log(`Allowed financial status orders count: ${allowedStatusCount}`);
    console.log(`Disallowed financial status orders count: ${disallowedStatusCount}`);

    console.log("\nFirst 10 orders from Shopline API:");
    console.log(list.slice(0, 10));

    // Calculate sum of total_price for ALL returned orders VS filtered orders
    const totalSalesAll = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const totalSalesFiltered = orders
      .filter(o => {
        const allowedStatuses = ['paid', 'pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded'];
        const currentStatus = String(o.financial_status || "").toLowerCase();
        if (!allowedStatuses.includes(currentStatus)) return false;
        if (o.cancelled_at || o.cancel_reason) return false;
        return true;
      })
      .reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

    const filteredOrders = orders.filter(o => {
      const allowedStatuses = ['paid', 'pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded'];
      const currentStatus = String(o.financial_status || "").toLowerCase();
      if (!allowedStatuses.includes(currentStatus)) return false;
      if (o.cancelled_at || o.cancel_reason) return false;
      return true;
    });

    console.log(`\nTotal sales of ALL ${orders.length} orders in API response: $${totalSalesAll.toFixed(2)}`);
    console.log(`Total sales of FILTERED ${filteredOrders.length} orders (status allowed & not cancelled): $${totalSalesFiltered.toFixed(2)}`);

  } catch (e: any) {
    console.error("API Call Error:", e.response?.data || e.message || e);
  }
}

main().catch(console.error);
