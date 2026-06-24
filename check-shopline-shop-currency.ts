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

  const shopUrl = `https://${domain}/admin/api/v20200901/shop.json`;

  try {
    const res = await axios.get(shopUrl, { headers });
    console.log("Shop API full response:");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.error(e.response?.data || e.message);
  }
}

main().catch(console.error);
