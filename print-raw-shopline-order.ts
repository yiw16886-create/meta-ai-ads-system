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

  const ordersUrl = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&limit=1`;

  try {
    const res = await axios.get(ordersUrl, { headers });
    const orders = res.data.data || res.data.orders || [];
    console.log("Full order object from Shopline API:");
    console.log(JSON.stringify(orders[0], null, 2));
  } catch (e: any) {
    console.error(e.message);
  }
}

main().catch(console.error);
