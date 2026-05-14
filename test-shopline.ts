import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function test() {
  const store = await prisma.store.findFirst({ orderBy: { id: 'desc' } });
  if (!store) {
    console.log("No store found.");
    return;
  }
  console.log("Testing with store:", store.name, store.domain);
  
  const cleanDomain = (store.domain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\/admin\/.*$/, "")
    .replace(/\/admin$/, "");
  
  if (!cleanDomain) {
      console.log("No domain saved");
      return;
  }
  const url = `https://${cleanDomain}/admin/openapi/v20240301/orders.json?limit=1`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        "Authorization": `Bearer ${store.shopline_token}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
      }
    });
    console.log("Success:", res.status, res.headers['x-shopline-request-id']);
  } catch (err) {
    if (err.response) {
      console.log("Failed. Status:", err.response.status);
      console.log("Headers:", err.response.headers);
      let data = err.response.data;
      if (typeof data === 'string' && data.length > 500) { data = data.substring(0, 500) + '...'; }
      console.log("Data:", data);
    } else {
      console.log("Error:", err.message);
    }
  }
}
test();
