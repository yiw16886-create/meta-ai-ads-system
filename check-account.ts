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

  // Check valid accounts mapping limit in server format
  const validAccounts = await prisma.accountMapping.findMany({
    where: { fbAccountId: "1352072466719315" },
    select: { fbAccountId: true, storeId: true }
  });
  console.log("Valid accounts mapped:", validAccounts);
}
main().finally(() => prisma.$disconnect());
