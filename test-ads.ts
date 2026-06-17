import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ads = await prisma.ad.findMany({
    where: { accountId: { in: ["1352072466719315", "act_1352072466719315"] } }
  });
  console.log("Ads count:", ads.length);
  if(ads.length > 0) {
    console.log("Sample ad:", ads[0]);
  }
}
main().finally(() => prisma.$disconnect());
