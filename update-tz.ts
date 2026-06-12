import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.store.updateMany({
    where: { name: 'romanticed' },
    data: { timezone: 'America/Los_Angeles' }
  });
  console.log("Updated timezone to America/Los_Angeles");
}

main().catch(console.error).finally(() => prisma.$disconnect());
