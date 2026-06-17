import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const insights = await prisma.adInsight.findMany({
    where: { accountId: { contains: "1352072466719315" } }
  });
  console.log("Insights count:", insights.length);
  if(insights.length > 0) {
    console.log("Sample insight:", insights[0]);
    console.log("Total spend:", insights.reduce((sum, item) => sum + item.spend, 0));
  }
}
main().finally(() => prisma.$disconnect());
