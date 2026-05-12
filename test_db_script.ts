import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  try {
    const mappings = await prisma.accountMapping.findMany();
    console.log("Mappings:", mappings);
  } catch(e) {
    console.error("Error:", e.message, e.code);
  }
}
main();
