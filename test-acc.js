const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function run() {
  const acc = await prisma.metaAccountMonitoring.findFirst({where: {accountId: "756169887382639"}});
  console.log(acc);
}
run().then(()=>prisma.$disconnect());
