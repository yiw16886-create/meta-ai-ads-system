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

    console.log(`Total orders returned: ${apiOrders.length}`);

    let totalSubtotal = 0;
    let totalLineItemsPrice = 0;
    let totalCurrentPrice = 0;
    let totalTax = 0;
    let totalShipping = 0;
    let totalDiscounts = 0;
    let totalPaidFromPaymentDetails = 0;

    for (const o of apiOrders) {
      const subtotal = parseFloat(o.subtotal_price || 0);
      const lineItemsPrice = parseFloat(o.total_line_items_price || 0);
      const currentPrice = parseFloat(o.current_total_price || o.total_price || 0);
      const tax = parseFloat(o.total_tax || 0);
      
      let shipping = 0;
      if (o.shipping_lines && o.shipping_lines.length > 0) {
        shipping = parseFloat(o.shipping_lines[0].price || 0);
      }

      const discounts = parseFloat(o.total_discounts || 0);

      totalSubtotal += subtotal;
      totalLineItemsPrice += lineItemsPrice;
      totalCurrentPrice += currentPrice;
      totalTax += tax;
      totalShipping += shipping;
      totalDiscounts += discounts;

      if (o.payment_details && o.payment_details.length > 0) {
        for (const pd of o.payment_details) {
          totalPaidFromPaymentDetails += parseFloat(pd.pay_amount || pd.settle_pay_amount || 0);
        }
      }
    }

    console.log(`Total Subtotal: $${totalSubtotal.toFixed(2)}`);
    console.log(`Total Line Items Price: $${totalLineItemsPrice.toFixed(2)}`);
    console.log(`Total Current Price: $${totalCurrentPrice.toFixed(2)}`);
    console.log(`Total Tax: $${totalTax.toFixed(2)}`);
    console.log(`Total Shipping: $${totalShipping.toFixed(2)}`);
    console.log(`Total Discounts: $${totalDiscounts.toFixed(2)}`);
    console.log(`Total Paid from payment_details: $${totalPaidFromPaymentDetails.toFixed(2)}`);

  } catch (e: any) {
    console.error(e.message);
  }
}

main().catch(console.error);
