import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst({
    where: {
      name: {
        contains: "romanticed",
        mode: "insensitive"
      }
    }
  });

  if (!store || !store.shoplazza_token) {
    console.log("Credentials missing or store not found.");
    return;
  }

  const domain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = {
    'Access-Token': store.shoplazza_token,
    'Content-Type': 'application/json'
  };

  const urls = [
    `https://${domain}/openapi/2022-01/shop`,
    `https://${domain}/openapi/2020-01/shop`,
    `https://${domain}/openapi/2022-01/shop.json`,
    `https://${domain}/openapi/2020-01/shop.json`,
  ];

  for (const url of urls) {
    try {
      console.log(`Trying ${url}`);
      const res = await axios.get(url, { headers });
      console.log(`Status: ${res.status}`);
      console.log("Data keys:", Object.keys(res.data));
      console.log("Full response shop structure component:", JSON.stringify(res.data, null, 2));
      break;
    } catch (e: any) {
      console.log(`Failed ${url}: ${e.message}`);
      if (e.response) {
        console.log(`Status: ${e.response.status}, Data:`, e.response.data);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
