import { PrismaClient } from "@prisma/client";

async function main() {
  const url = "postgresql://neondb_owner:npg_WsojQ8G9Hxag@ep-steep-surf-amc6q8wv.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    console.log("Connected!");
  } catch (e) {
    console.error("Connect failed:", e);
  }
}
main();
