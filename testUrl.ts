import { PrismaClient } from "@prisma/client";
try {
  new PrismaClient({ datasources: { db: { url: "postgresql://user:pass@host/db?sslmode=require&channel_binding=require" } } });
  console.log("OK");
} catch(e) {
  console.log("Error during parse:", e.message);
}
