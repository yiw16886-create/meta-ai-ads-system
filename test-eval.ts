import { evaluateActivityStatus } from './server/utils';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const accountId = '1352072466719315';
  
  const acc = await prisma.adAccount.findFirst({ where: { fb_account_id: accountId }});
  
  console.log("Evaluating status for account:", accountId);
  const status = await evaluateActivityStatus(accountId, 2, acc?.fb_access_token!);
  
  console.log("Evaluated status:", status);
}

run().finally(() => prisma.$disconnect());
