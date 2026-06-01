import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const accountIds = ["1352072466719315", "1633720264379170"];
  for (const accId of accountIds) {
    console.log(`\n=== Account: ${accId} ===`);
    const mapping = await prisma.accountMapping.findUnique({ where: { accountId: accId } });
    console.log("AccountMapping:", mapping);

    const monitoring = await prisma.metaAccountMonitoring.findUnique({ where: { accountId: accId } });
    console.log("MetaAccountMonitoring:", monitoring);

    const adAccount = await prisma.adAccount.findUnique({ where: { fb_account_id: accId } });
    console.log("AdAccount:", adAccount);

    const campaigns = await prisma.campaign.findMany({ where: { accountId: accId } });
    console.log(`Campaigns count: ${campaigns.length}`);

    const adSets = await prisma.adSet.findMany({ where: { accountId: accId } });
    console.log(`AdSets count: ${adSets.length}`);

    const ads = await prisma.ad.findMany({ where: { accountId: accId } });
    console.log(`Ads count: ${ads.length}`);

    const insights = await prisma.adInsight.findMany({ where: { accountId: accId } });
    console.log(`AdInsights count: ${insights.length}`, insights);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
