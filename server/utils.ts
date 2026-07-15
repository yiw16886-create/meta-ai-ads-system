import prisma from "../db/index.js";
import axios from "axios";
import { format, subDays } from "date-fns";

// CACHE map for utils
const queryCache = new Map();

export async function getMetaToken(userId?: number): Promise<string | null> {
  if (userId) {
    const acc = await prisma.facebookAccount.findUnique({
      where: { userId }
    });
    if (acc && acc.accessToken) return acc.accessToken;
  }
  const setting = await prisma.setting.findUnique({
    where: { key: "META_ACCESS_TOKEN" }
  });
  return setting ? setting.value : null;
}

export function mapOffsetToIana(tzStr: string): string {
  if (!tzStr) return "America/Los_Angeles";
  
  if (tzStr.includes("/")) {
    return tzStr;
  }

  let normalizedStr = tzStr.trim();
  normalizedStr = normalizedStr.replace(/^(GMT|UTC)/i, "");

  let isNegative = false;
  if (normalizedStr.startsWith("-")) {
    isNegative = true;
    normalizedStr = normalizedStr.substring(1);
  } else if (normalizedStr.startsWith("+")) {
    normalizedStr = normalizedStr.substring(1);
  }

  let hours = 0;
  let minutes = 0;

  const colonMatch = normalizedStr.match(/^(\d{1,2}):(\d{2})/);
  if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
    minutes = parseInt(colonMatch[2], 10);
  } else {
    const digitsOnly = normalizedStr.replace(/\D/g, "");
    if (digitsOnly.length >= 4) {
      hours = parseInt(digitsOnly.substring(0, 2), 10);
      minutes = parseInt(digitsOnly.substring(2, 4), 10);
    } else if (digitsOnly.length > 0) {
      hours = parseInt(digitsOnly, 10);
    }
  }

  const offsetValueInMinutes = (isNegative ? -1 : 1) * (hours * 60 + minutes);

  switch (offsetValueInMinutes) {
    case 480:  // +08:00
      return "Asia/Shanghai";
    case -420: // -07:00
      return "America/Los_Angeles";
    case -480: // -08:00
      return "America/Los_Angeles";
    case -300: // -05:00
      return "America/New_York";
    case -240: // -04:00
      return "America/New_York";
    case -360: // -06:00
      return "America/Chicago";
    case 0:    // +00:00
      return "UTC";
    case 60:   // +01:00
      return "Europe/Paris";
    case 120:  // +02:00
      return "Europe/Berlin";
    case 180:  // +03:00
      return "Europe/Moscow";
    case 330:  // +05:30
      return "Asia/Kolkata";
    case 420:  // +07:00
      return "Asia/Bangkok";
    case 540:  // +09:00
      return "Asia/Tokyo";
    case 600:  // +10:00
      return "Australia/Sydney";
    case 660:  // +11:00
      return "Pacific/Guadalcanal";
    case 720:  // +12:00
      return "Pacific/Auckland";
    case -600: // -10:00
      return "Pacific/Honolulu";
    case -540: // -09:00
      return "America/Anchorage";
    case -180: // -03:00
      return "America/Sao_Paulo";
    default:
      if (offsetValueInMinutes === -420 || offsetValueInMinutes === -480) {
        return "America/Los_Angeles";
      }
      if (offsetValueInMinutes >= 420 && offsetValueInMinutes <= 540) {
        return "Asia/Shanghai";
      }
      if (offsetValueInMinutes <= -240 && offsetValueInMinutes >= -300) {
        return "America/New_York";
      }
      return "America/Los_Angeles";
  }
}

export function getTimezoneOffsetStr(timezone: string | null | undefined): string {
  if (!timezone) return "-07:00";

  if (timezone.includes("/")) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
      });
      const parts = formatter.formatToParts(new Date());
      const offsetPart = parts.find(p => p.type === 'timeZoneName');
      if (offsetPart) {
        const val = offsetPart.value;
        if (val === "GMT") return "+00:00";
        if (val.startsWith("GMT")) {
          let off = val.replace("GMT", "");
          if (!off.includes(":")) {
            const sign = off.startsWith("-") ? "-" : "+";
            const digits = off.replace(/[+-]/g, "");
            off = `${sign}${digits.padStart(2, '0')}:00`;
          }
          return off;
        }
      }
    } catch (e: any) {
      console.error(`[utils] Error getting offset for IANA timezone ${timezone}:`, e.message);
    }
  }

  const match = timezone.match(/GMT([+-]?\d+)/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const sign = val < 0 ? "-" : "+";
    const hrs = Math.abs(val);
    return `${sign}${String(hrs).padStart(2, '0')}:00`;
  }

  return "-07:00";
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
          status: fbAccountStatus
        }
      });
    } catch (e) {}
    
    // Do not delete historical data for dormant accounts to prevent accidental loss
    if (statusVal === 4) {
      console.log(`[evaluateActivityStatus] Account ${cleanAccountId} is classified as dormant (no deletion of history)`);
    }
  };

  let diffDays = -1;

  // 1. Evaluate based on database AdInsight spend records if available
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
      today.setHours(0,0,0,0);
      lastSpendDate.setHours(0,0,0,0);
      diffDays = Math.round((today.getTime() - lastSpendDate.getTime()) / (1000 * 60 * 60 * 24));
    }
  } catch (dbErr) {
    console.error(`[evaluateActivityStatus] DB Error:`, dbErr);
  }

  // 2. Fallback: Check Meta API for latest spend as a backup if token is provided and no DB record
  if (diffDays === -1 && token) {
    try {
      // Check last 90 days
      const res = await axios.get(`https://graph.facebook.com/v21.0/act_${cleanAccountId}/insights`, {
        params: {
          level: "account",
          date_preset: "last_90d",
          time_increment: 1, // break down daily
          fields: "date_start,spend",
          access_token: token,
        },
        timeout: 8000
      });

      const insights = res.data?.data || [];
      const validInsights = insights.filter((i: any) => parseFloat(i.spend || "0") > 0);
      
      if (validInsights.length > 0) {
        validInsights.sort((a: any, b: any) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());
        const lastSpendDateStr = validInsights[0].date_start;
        const today = new Date();
        const lastSpendDate = new Date(lastSpendDateStr);
        today.setHours(0,0,0,0);
        lastSpendDate.setHours(0,0,0,0);
        diffDays = Math.round((today.getTime() - lastSpendDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        await saveActivityStatus(3);
        return 3; // Red: unauthorized / locked
      }
    }
  }

  // 3. Priority based on Spend Days
  if (diffDays !== -1) {
    let resStatus = 4; // Default to dormant
    if (diffDays <= 30) {
      resStatus = 1; // Highly active (Green)
    } else if (diffDays <= 60) {
      resStatus = 2; // Normal active (Blue)
    } else if (diffDays <= 90) {
      resStatus = 3; // Warning (Orange)
    } else {
      resStatus = 4; // Dormant (Gray)
    }

    await saveActivityStatus(resStatus);
    return resStatus;
  }

  // Default fallback/no-spend
  await saveActivityStatus(4);
  return 4;
}

// Active requests map for Request Collapsing (Single Flight Pattern)
const activeRequests = new Map<string, Promise<any>>();

export function getCachedData(key: string, forceRefresh: boolean = false) {
  if (forceRefresh) {
    queryCache.delete(key);
    return null;
  }
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

/**
 * Request Collapsing (Single Flight) wrapper to collapse concurrent identical Meta API queries.
 */
export async function collapseRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existingPromise = activeRequests.get(key);
  if (existingPromise) {
    console.log(`[Request Collapsing] Joined existing in-flight request for key: ${key}`);
    return existingPromise;
  }

  const promise = (async () => {
    try {
      return await fetcher();
    } finally {
      activeRequests.delete(key);
    }
  })();

  activeRequests.set(key, promise);
  return promise;
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

    let targetStoreId: number | null = mapping ? mapping.storeId : null;

    if (!dbAdAccount) {
      // If there's no mapping or mapped store does not exist, use system-wide "未分配" store
      if (!targetStoreId) {
        let unassignedStore = await prisma.store.findUnique({
          where: { name: "未分配" }
        });
        if (!unassignedStore) {
          unassignedStore = await prisma.store.create({
            data: {
              name: "未分配",
              platform: "shopline",
              timezone: "America/Los_Angeles"
            }
          });
        }
        targetStoreId = unassignedStore.id;
        
        // Also ensure mapping exists
        if (!mapping) {
          await prisma.accountMapping.create({
            data: {
              fbAccountId: rawAccountId,
              storeId: targetStoreId,
              project: "未分配",
              owner: "未分配"
            }
          });
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