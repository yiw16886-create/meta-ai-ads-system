import prisma from "../db/index.js";
import axios from "axios";
import { format, subDays } from "date-fns";

// CACHE map for utils
const queryCache = new Map();

export async function getMetaToken(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: "META_ACCESS_TOKEN" }
  });
  return setting ? setting.value : null;
}

export function getTimezoneOffsetStr(timezone: string | null | undefined): string {
  if (!timezone) return "-08:00";
  const match = timezone.match(/GMT([+-]?\d+)/i); // Handle GMT-8, GMT+8, GMT8 etc
  if (match) {
    const val = parseInt(match[1], 10);
    const sign = val < 0 ? "-" : "+";
    const hrs = Math.abs(val);
    return `${sign}${String(hrs).padStart(2, '0')}:00`;
  }
  return "-08:00";
}

export function extractMetaError(error: any): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error?.message || error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function evaluateActivityStatus(accountId: string, fbAccountStatus: number, token?: string): Promise<number> {
  const cleanAccountId = accountId.replace("act_", "");

  // Helper helper to update both tables
  const saveActivityStatus = async (statusVal: number) => {
    try {
      await prisma.adAccount.update({
        where: { fb_account_id: cleanAccountId },
        data: { activityStatus: statusVal }
      });
    } catch (e) {}
    try {
      await prisma.metaAccountMonitoring.update({
        where: { accountId: cleanAccountId },
        data: { 
          activityStatus: statusVal,
          status: statusVal
        }
      });
    } catch (e) {}
    
    if (statusVal > 2) {
      try {
         await prisma.adInsight.deleteMany({ where: { accountId: cleanAccountId } });
         await prisma.campaign.deleteMany({ where: { accountId: cleanAccountId } });
         await prisma.adCreative.deleteMany({ 
           where: { 
             OR: [
               { fbAccountId: cleanAccountId },
               { fbAccountId: `act_${cleanAccountId}` }
             ]
           } 
         });
         console.log(`[evaluateActivityStatus] Cleaned up dormant data for account: ${cleanAccountId}`);
      } catch (cleanErr) {
         console.error(`[evaluateActivityStatus] Cleanup Error for ${cleanAccountId}:`, cleanErr);
      }
    }
  };

  // Priority 1: Meta-level Disabled status (2) -> return 3 (Disabled/Red)
  if (fbAccountStatus === 2) {
    await saveActivityStatus(3);
    return 3;
  }

  // Priority 2: Closed/Dormant statuses
  if (fbAccountStatus === 101 || fbAccountStatus === 102 || fbAccountStatus === 201) {
    await saveActivityStatus(4);
    return 4;
  }

  // Priority 3: Evaluate based on database AdInsight spend records if available
  try {
    const lastSpendRecord = await prisma.adInsight.findFirst({
      where: {
        accountId: cleanAccountId,
        spend: { gt: 0 }
      },
      orderBy: {
        date: 'desc'
      }
    });

    if (lastSpendRecord) {
      const today = new Date();
      const lastSpendDate = new Date(lastSpendRecord.date);
      
      // Calculate diff in calendar days
      today.setHours(0,0,0,0);
      lastSpendDate.setHours(0,0,0,0);
      const diffTime = today.getTime() - lastSpendDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let resStatus = 2; // Default
      if (diffDays <= 7) {
        resStatus = 1; // Highly active (Green)
      } else if (diffDays <= 30) {
        resStatus = 2; // Normal active (Blue)
      } else if (diffDays <= 60) {
        resStatus = 5; // Inactive / Warning (Orange: exceeded 30 days)
      } else {
        resStatus = 4; // Dormant (Gray: exceeded 60 days)
      }

      await saveActivityStatus(resStatus);
      return resStatus;
    }
  } catch (dbErr) {
    console.error(`[evaluateActivityStatus] DB Error:`, dbErr);
  }

  // Fallback: Check Meta API for latest spend as a backup if token is provided
  if (token) {
    try {
      const today = new Date();
      const startDate = format(subDays(today, 7), "yyyy-MM-dd");
      const endDate = format(today, "yyyy-MM-dd");

      const res = await axios.get(`https://graph.facebook.com/v19.0/act_${cleanAccountId}/insights`, {
        params: {
          level: "account",
          time_range: JSON.stringify({ since: startDate, until: endDate }),
          fields: "spend",
          access_token: token,
        },
        timeout: 5000
      });

      const insights = res.data?.data || [];
      const totalSpend = insights.reduce((sum: number, item: any) => sum + parseFloat(item.spend || "0"), 0);

      const resStatus = totalSpend > 0 ? 1 : 4;

      await saveActivityStatus(resStatus);
      return resStatus;
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        await saveActivityStatus(3);
        return 3; // Red: unauthorized / locked
      }
    }
  }

  // Default fallback/no-spend
  await saveActivityStatus(4);
  return 4;
}

export function getCachedData(key: string) {
  const cached = queryCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiry) {
    queryCache.delete(key);
    return null;
  }
  return cached.data;
}

export function setCachedData(key: string, data: any, ttlMs: number = 300000) {
  queryCache.set(key, {
    data,
    expiry: Date.now() + ttlMs
  });
}



export async function syncSingleAccountAdData(accountId: string, startDate: string, endDate: string, token: string) {
  const cleanAccountId = accountId.replace("act_", "");
  const url = `https://graph.facebook.com/v19.0/act_${cleanAccountId}/insights`;
  console.log(`[Unified Ad Sync] Fetching ACCOUNT-level insights for account ${cleanAccountId} from URL ${url}`);
  
  const insightsResponse = await axios.get(
    url,
    {
      params: {
        level: "account",
        time_range: JSON.stringify({
          since: startDate,
          until: endDate,
        }),
        time_increment: 1,
        fields:
          "account_id,account_name,date_start,reach,impressions,clicks,spend,actions,purchase_roas,action_values",
        limit: 1000,
        access_token: token,
      },
    },
  );

  const insights = insightsResponse.data.data || [];
  console.log(`[Unified Ad Sync] Received ${insights.length} account-level insight items for account ${cleanAccountId}`);

  const accountInsightsByDate: Record<string, {
    date: string;
    accountName: string;
    reach: number;
    impressions: number;
    clicks: number;
    spend: number;
    addToCart: number;
    initiateCheckout: number;
    purchases: number;
    purchaseValue: number;
  }> = {};

  let syncedRecords = 0;

  for (const day of insights) {
    const currentDate = day.date_start;
    
    const rawAccountId = (day.account_id || cleanAccountId).replace("act_", "");
    const accountNameRaw = day.account_name || "Default Meta Account";

    const actions = day.actions || [];
    const getActionValue = (type: string) => {
      const action = actions.find((a: any) => a.action_type === type);
      return action ? parseFloat(action.value) : 0;
    };

    const actionValues = day.action_values || [];
    const getActionVal = (type: string) => {
      const action = actionValues.find(
        (a: any) => a.action_type === type,
      );
      return action ? parseFloat(action.value) : 0;
    };

    const carts = getActionValue("add_to_cart");
    const checkouts = getActionValue("initiate_checkout");
    const purchases = getActionValue("purchase");
    const purchaseValue =
      getActionVal("purchase") || getActionVal("omni_purchase");

    const spend = parseFloat(day.spend || "0");
    const clicks = parseInt(day.clicks || "0");
    const impressions = parseInt(day.impressions || "0");
    const reach = parseInt(day.reach || "0");

    // 1. Ensure/Sync AdAccount
    let dbAdAccount = await prisma.adAccount.findUnique({
      where: { fb_account_id: rawAccountId }
    });

    // Look up AccountMapping first to see if this account is mapped to a specific store
    const mapping = await prisma.accountMapping.findFirst({
      where: { fbAccountId: rawAccountId }
    });

    if (mapping && mapping.storeId === null) {
      if (dbAdAccount) {
        try {
          await prisma.adAccount.delete({
            where: { fb_account_id: rawAccountId }
          });
        } catch (e) {}
      }
      return; // Skip syncing this ad account since it is explicitly unmapped
    }

    let targetStoreId: number | null = mapping ? mapping.storeId : null;

    if (!dbAdAccount) {
      // Fallback to defaultStore if no mapping or mapped store does not exist
      if (!targetStoreId) {
        const defaultStore = await prisma.store.findFirst();
        if (defaultStore) {
          targetStoreId = defaultStore.id;
        }
      }

      if (targetStoreId) {
        dbAdAccount = await prisma.adAccount.create({
          data: {
            fb_account_id: rawAccountId,
            fb_account_name: accountNameRaw,
            fb_access_token: token,
            storeId: targetStoreId
          }
        });
      }
    } else {
      // If dbAdAccount exists, update name/token and also realign storeId if mapping dictates a valid store
      const updateData: any = {
        fb_account_name: accountNameRaw,
        fb_access_token: token
      };
      if (targetStoreId) {
        updateData.storeId = targetStoreId;
      }
      dbAdAccount = await prisma.adAccount.update({
        where: { fb_account_id: rawAccountId },
        data: updateData
      });
    }

    const store = dbAdAccount ? await prisma.store.findUnique({ where: { id: dbAdAccount.storeId } }) : null;
    const storeName = store ? store.name : null;

    // 2. Ensure/Sync AccountMapping
    if (dbAdAccount) {
      await prisma.accountMapping.upsert({
        where: {
          fbAccountId: rawAccountId
        },
        update: {
          // Keep storeId unchanged as the mapping table is the single source of truth.
        },
        create: {
          storeId: mapping ? mapping.storeId : null,
          fbAccountId: rawAccountId
        }
      });
    }

    // 3. (REMOVED) Ensure/Sync Campaign, AdSet, Ad
    // This is now purely handled by syncMetaHierarchy directly avoiding dummy empty string IDs

    // 4. Group metrics for account-level AdInsight upsert
    if (!accountInsightsByDate[currentDate]) {
      accountInsightsByDate[currentDate] = {
        date: currentDate,
        accountName: accountNameRaw,
        reach: 0,
        impressions: 0,
        clicks: 0,
        spend: 0,
        addToCart: 0,
        initiateCheckout: 0,
        purchases: 0,
        purchaseValue: 0
      };
    }

    const entry = accountInsightsByDate[currentDate];
    entry.reach += reach;
    entry.impressions += impressions;
    entry.clicks += clicks;
    entry.spend += spend;
    entry.addToCart += carts;
    entry.initiateCheckout += checkouts;
    entry.purchases += purchases;
    entry.purchaseValue += purchaseValue;
  }

  // 5. Save the aggregated AdInsight items corresponding exactly to the same date/data
  for (const dateKey of Object.keys(accountInsightsByDate)) {
    const item = accountInsightsByDate[dateKey];
    const cpc = item.clicks > 0 ? item.spend / item.clicks : 0;
    const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
    const atcRate = item.clicks > 0 ? (item.addToCart / item.clicks) * 100 : 0;
    const checkoutRate = item.clicks > 0 ? (item.initiateCheckout / item.clicks) * 100 : 0;
    const cpp = item.purchases > 0 ? item.spend / item.purchases : 0;
    const roas = item.spend > 0 ? item.purchaseValue / item.spend : 0;

    // Optimization to avoid duplicate database writes if exact data already exists
    const existing = await prisma.adInsight.findUnique({
      where: {
        accountId_date: {
          accountId: cleanAccountId,
          date: dateKey,
        },
      },
    });

    if (existing) {
      const isIdentical =
        existing.accountName === item.accountName &&
        existing.reach === item.reach &&
        existing.impressions === item.impressions &&
        existing.clicks === item.clicks &&
        Math.abs(existing.spend - item.spend) < 0.001 &&
        existing.addToCart === item.addToCart &&
        existing.initiateCheckout === item.initiateCheckout &&
        existing.purchases === item.purchases &&
        Math.abs(existing.purchaseValue - item.purchaseValue) < 0.001;

      if (isIdentical) {
        // Data is identical, skip updating to optimize database and sync performance
        syncedRecords++;
        continue;
      }
    }

    await prisma.adInsight.upsert({
      where: {
        accountId_date: {
          accountId: cleanAccountId,
          date: dateKey,
        },
      },
      update: {
        accountName: item.accountName,
        reach: item.reach,
        impressions: item.impressions,
        clicks: item.clicks,
        spend: item.spend,
        addToCart: item.addToCart,
        initiateCheckout: item.initiateCheckout,
        purchases: item.purchases,
        purchaseValue: item.purchaseValue,
        cpc,
        ctr,
        atcRate,
        checkoutRate,
        cpp,
        roas,
      },
      create: {
        accountId: cleanAccountId,
        date: dateKey,
        accountName: item.accountName,
        reach: item.reach,
        impressions: item.impressions,
        clicks: item.clicks,
        spend: item.spend,
        addToCart: item.addToCart,
        initiateCheckout: item.initiateCheckout,
        purchases: item.purchases,
        purchaseValue: item.purchaseValue,
        cpc,
        ctr,
        atcRate,
        checkoutRate,
        cpp,
        roas,
      },
    });
    syncedRecords++;
  }

  return syncedRecords;
}