import prisma from './server/db';

async function main() {
  const accts = ['26380439', '341040412'];
  console.log("Starting DB clean-up for dormant accounts: ", accts);

  // 1. Delete AdInsight rows
  const insightDel = await prisma.adInsight.deleteMany({
    where: { accountId: { in: accts } }
  });
  console.log(`Deleted ${insightDel.count} AdInsight records.`);

  // 2. Delete Campaign rows
  const campaignDel = await prisma.campaign.deleteMany({
    where: { accountId: { in: accts } }
  });
  console.log(`Deleted ${campaignDel.count} Campaign records.`);

  // 3. Delete AdSet rows
  const adSetDel = await prisma.adSet.deleteMany({
    where: { accountId: { in: accts } }
  });
  console.log(`Deleted ${adSetDel.count} AdSet records.`);

  // 4. Delete Ad rows
  const adDel = await prisma.ad.deleteMany({
    where: { accountId: { in: accts } }
  });
  console.log(`Deleted ${adDel.count} Ad records.`);

  // 5. Delete mapped AdAccount rows to unbind them from primary stores
  const adAccountDel = await prisma.adAccount.deleteMany({
    where: { fb_account_id: { in: accts } }
  });
  console.log(`Deleted ${adAccountDel.count} AdAccount mappings.`);

  // 6. Delete AccountMapping to clear settings
  const mappingDel = await prisma.accountMapping.deleteMany({
    where: { fbAccountId: { in: accts } }
  });
  console.log(`Deleted ${mappingDel.count} AccountMapping entries.`);

  // 7. Mark status as 2 (disabled) or delete in MetaAccountMonitoring so they are completely muted
  const monitoringDel = await prisma.metaAccountMonitoring.updateMany({
    where: { accountId: { in: accts } },
    data: { status: 2 } // Set to disabled
  });
  console.log(`Updated status of ${monitoringDel.count} accounts to disabled (status = 2) in MetaAccountMonitoring.`);
}

main().finally(() => prisma.$disconnect());





