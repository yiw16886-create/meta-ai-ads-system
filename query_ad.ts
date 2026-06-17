import { PrismaClient } from '@prisma/client';
import { extractMetaAssetHash } from './server/services/metaFetchPatch.service';
const prisma = new PrismaClient();

async function main() {
  const adAccount = await prisma.adAccount.findFirst({
    where: { fb_account_id: '944648198051143' }
  });
  
  if (!adAccount || !adAccount.fb_access_token) {
    console.log("No token");
    return;
  }
  
  const token = adAccount.fb_access_token;
  console.log("Testing extraction for creative 1698238938297504...");
  const extracted = await extractMetaAssetHash("1698238938297504", token, {});
  console.log("Extracted:", extracted);
  
  if (extracted && extracted.landingUrl) {
    console.log("Saving new URL:", extracted.landingUrl);
  }
}
main().catch(console.dir).finally(() => prisma.$disconnect());
