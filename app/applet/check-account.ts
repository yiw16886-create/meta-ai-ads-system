import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const account = await prisma.adAccount.findFirst({
    where: { fb_account_id: { contains: "1352072466719315" } }
  });
  console.log("Account", account);
  const mappings = await prisma.accountMapping.findMany({
    where: { fbAccountId: { contains: "1352072466719315" } }
  });
  console.log("Mappings", mappings);
}
main().finally(() => prisma.$disconnect());
