import { PrismaClient } from '@prisma/client';
import { extractMetaAssetHash } from './server/services/metaFetchPatch.service';
const prisma = new PrismaClient();

async function main() {
  const creativesToFix = await prisma.adCreative.findMany({
    where: {
      OR: [
        { landingUrl: { contains: 'facebook.com/reel' } },
        { landingUrl: { contains: 'facebook.com/watch' } },
        { landingUrl: { contains: 'instagram.com/reel' } }
      ]
    }
  });

  console.log(`Found ${creativesToFix.length} creatives with fb/ig reel URLs`);

  const accountsTokens = new Map<string, string>();
  const allAccounts = await prisma.adAccount.findMany();
  allAccounts.forEach(acc => {
    if (acc.fb_access_token) {
      accountsTokens.set(`act_${acc.fb_account_id}`, acc.fb_access_token);
      accountsTokens.set(acc.fb_account_id, acc.fb_access_token);
    }
  });

  for (const creative of creativesToFix) {
    const token = accountsTokens.get(creative.fbAccountId);
    if (!token) {
        console.log(`No token for account ${creative.fbAccountId}`);
        continue;
    }
    
    console.log(`Fixing creative ${creative.creativeId}...`);
    try {
        const extracted = await extractMetaAssetHash(creative.creativeId, token, {});
        if (extracted && extracted.landingUrl && !extracted.landingUrl.includes("facebook.com")) {
            await prisma.adCreative.update({
                where: { creativeId: creative.creativeId },
                data: { landingUrl: extracted.landingUrl }
            });
            console.log(`-> Updated to ${extracted.landingUrl}`);
        } else {
            console.log(`-> Could not extract a better URL. Got: ${extracted?.landingUrl}`);
        }
    } catch (e: any) {
        console.log(`-> Error:`, e.message);
    }
  }
}

main().catch(console.dir).finally(() => prisma.$disconnect());
