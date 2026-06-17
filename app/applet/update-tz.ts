import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.store.updateMany({
    data: { timezone: 'America/Los_Angeles' }
  });
  console.log("Updated", res.count, "stores");
}
main().finally(() => prisma.$disconnect());
