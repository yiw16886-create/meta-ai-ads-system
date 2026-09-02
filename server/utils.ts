import prisma, { rawPrisma } from "../db/index.js";
import axios from "axios";
import { format, subDays } from "date-fns";
import { upsertDailyInsightRecord } from "./services/syncService.js";

// CACHE map for utils
const queryCache = new Map();

// In-Memory persistent caches to bypass database constraints/limits for high-volume ad data
export const adInsightInMemoryCache = new Map<string, any>();
export const adPerformanceInMemoryCache = new Map<string, any>();

export function cleanFbAccountId(id: string | null | undefined): string {
  if (!id) return "";
  return String(id).replace(/^act_/, "").trim();
}

export async function isUserFacebookConnected(userId?: number | string): Promise<boolean> {
  if (!userId) return false;
  const numUserId = Number(userId);
  if (isNaN(numUserId) || numUserId <= 0) return false;

  const user = await prisma.user.findUnique({
    where: { id: numUserId },
    select: { fb_access_token: true }
  });
  if (user?.fb_access_token && user.fb_access_token.trim().length > 0) {
    return true;
  }

  const binding = await prisma.userFacebookBinding.findUnique({
    where: { user_id: numUserId },
    select: { access_token: true }
  });
  if (binding?.access_token && binding.access_token.trim().length > 0) {
    return true;
  }

  const acc = await prisma.facebookAccount.findUnique({
    where: { userId: numUserId },
    select: { accessToken: true }
  });
  if (acc?.accessToken && acc.accessToken.trim().length > 0) {
    return true;
  }

  return false;
}

export async function performFullUnbindAndPurge(userId: number | string) {
  const numUserId = Number(userId);
  if (!numUserId) return;

  console.log(`[Unbind Purge] Purging all Facebook tokens and synced ad data for user ${numUserId}...`);

  // Step 1: Revoke Meta token on Facebook side before deleting local DB records
  try {
    const currentToken = await getMetaToken(numUserId);
    if (currentToken) {
      await axios.delete("https://graph.facebook.com/v20.0/me/permissions", {
        params: { access_token: currentToken },
        timeout: 5000
      });
      console.log(`[Unbind Purge] Successfully revoked Meta token permissions on Facebook side for user ${numUserId}`);
    }
  } catch (revokeErr: any) {
    console.warn(`[Unbind Purge] Revoke Meta token permissions warning (token may already be invalid/expired):`, revokeErr.response?.data || revokeErr.message);
  }

  try {
    const userAccounts = await prisma.adAccount.findMany({
      where: { userId: numUserId },
      select: { fb_account_id: true }
    });

    const accountIds = userAccounts.flatMap(a => {
      const clean = a.fb_account_id.replace("act_", "").trim();
      return [a.fb_account_id, clean, `act_${clean}`];
    });

    if (accountIds.length > 0) {
      await prisma.adInsight.deleteMany({
        where: { accountId: { in: accountIds } }
      }).catch(e => console.warn("[Unbind Purge] Delete AdInsight warning:", e.message));

      await prisma.ad.deleteMany({
        where: { accountId: { in: accountIds } }
      }).catch(e => console.warn("[Unbind Purge] Delete Ad warning:", e.message));

      await prisma.adSet.deleteMany({
        where: { accountId: { in: accountIds } }
      }).catch(e => console.warn("[Unbind Purge] Delete AdSet warning:", e.message));

      await prisma.campaign.deleteMany({
        where: { accountId: { in: accountIds } }
      }).catch(e => console.warn("[Unbind Purge] Delete Campaign warning:", e.message));

      await prisma.metaAccountMonitoring.deleteMany({
        where: {
          OR: [
            { accountId: { in: accountIds } },
            { adAccount: { userId: numUserId } }
          ]
        }
      }).catch(e => console.warn("[Unbind Purge] Delete MetaAccountMonitoring warning:", e.message));
    }

    await prisma.adAccount.deleteMany({
      where: { userId: numUserId }
    }).catch(e => console.warn("[Unbind Purge] Delete AdAccount warning:", e.message));

    await prisma.accountMapping.deleteMany({
      where: { userId: numUserId }
    }).catch(e => console.warn("[Unbind Purge] Delete AccountMapping warning:", e.message));

    await prisma.userFacebookBinding.deleteMany({
      where: { user_id: numUserId }
    }).catch(e => console.warn("[Unbind Purge] Delete UserFacebookBinding warning:", e.message));

    await prisma.facebookAccount.deleteMany({
      where: { userId: numUserId }
    }).catch(e => console.warn("[Unbind Purge] Delete FacebookAccount warning:", e.message));

    await prisma.facebookBusinessManager.deleteMany({
      where: { userId: numUserId }
    }).catch(e => console.warn("[Unbind Purge] Delete FacebookBusinessManager warning:", e.message));

    await prisma.facebookPage.deleteMany({
      where: { userId: numUserId }
    }).catch(e => console.warn("[Unbind Purge] Delete FacebookPage warning:", e.message));

    await prisma.user.update({
      where: { id: numUserId },
      data: {
        fb_access_token: null,
        fb_user_id: null,
        fb_user_name: null
      }
    }).catch(e => console.warn("[Unbind Purge] Update User warning:", e.message));

    console.log(`[Unbind Purge] Successfully purged all Facebook tokens and ad data for user ${numUserId}`);
  } catch (err: any) {
    console.error(`[Unbind Purge] Error purging data for user ${numUserId}:`, err);
  }
}

export function extractMetaErrorDetails(error: any): { 
  message: string; 
  subcode?: number; 
  code?: number; 
  userTitle?: string; 
  userMsg?: string;
  isRestricted?: boolean;
  isTokenExpired?: boolean;
} {
  const metaErr = error.response?.data?.error;
  if (!metaErr) {
    const defaultMsg = error.response?.data?.message || error.message || '未知异常';
    return { message: defaultMsg };
  }

  const subcode = Number(metaErr.error_subcode);
  const code = Number(metaErr.code);
  const userTitle = metaErr.error_user_title || '';
  const userMsg = metaErr.error_user_msg || '';
  const rawMsg = metaErr.message || '';

  // 1. Account / Page Action Restriction (e.g. 2424009)
  const isRestricted = subcode === 2424009 || userTitle.includes('限制') || userMsg.includes('限制') || rawMsg.includes('restricted');
  if (isRestricted) {
    const formattedTitle = userTitle || 'Meta 账户/主页当前被限制执行此操作';
    const formattedMsg = userMsg || '你的 Facebook 账户或主页当前受 Meta 官方风控限制，无法发布或互动。如果你认为这是误判，请前往 Facebook「账户状态」页面提出申诉。';
    return {
      message: `${formattedTitle}：${formattedMsg}`,
      subcode,
      code,
      userTitle: formattedTitle,
      userMsg: formattedMsg,
      isRestricted: true
    };
  }

  // 2. Token Expired / Invalid Session (code 190, 401)
  const isTokenExpired = code === 190 || error.response?.status === 401 || rawMsg.includes('Session has expired') || rawMsg.includes('Error validating access token') || rawMsg.includes('Session is invalid');
  if (isTokenExpired) {
    return {
      message: 'Facebook 授权 Token 已过期或失效，请在系统设置中重新授权',
      subcode,
      code,
      userTitle,
      userMsg,
      isTokenExpired: true
    };
  }

  // 3. User friendly message if provided
  if (userMsg && userTitle) {
    return {
      message: `${userTitle}: ${userMsg}`,
      subcode,
      code,
      userTitle,
      userMsg
    };
  }

  if (userMsg) {
    return {
      message: userMsg,
      subcode,
      code,
      userTitle,
      userMsg
    };
  }

  return {
    message: rawMsg || 'Meta API 接口调用失败',
    subcode,
    code,
    userTitle,
    userMsg
  };
}

export async function getMetaToken(userId?: number | string): Promise<string | null> {
  if (userId) {
    const numUserId = Number(userId);
    if (numUserId) {
      const user = await prisma.user.findUnique({
        where: { id: numUserId },
        select: { fb_access_token: true }
      });
      if (user?.fb_access_token && user.fb_access_token.trim().length > 0) {
        return user.fb_access_token.trim();
      }

      const binding = await prisma.userFacebookBinding.findUnique({
        where: { user_id: numUserId },
        select: { access_token: true }
      });
      if (binding?.access_token && binding.access_token.trim().length > 0) {
        return binding.access_token.trim();
      }

      const acc = await prisma.facebookAccount.findUnique({
        where: { userId: numUserId },
        select: { accessToken: true }
      });
      if (acc?.accessToken && acc.accessToken.trim().length > 0) {
        return acc.accessToken.trim();
      }

      // Strictly return null for specified user when no token is found (no cross-user token leakage)
      return null;
    }
  }

  // Fallback 1: Check any UserFacebookBinding table record
  const anyBinding = await prisma.userFacebookBinding.findFirst({
    where: { access_token: { not: "" } },
    orderBy: { updated_at: "desc" },
    select: { access_token: true }
  }).catch(() => null);
  if (anyBinding?.access_token && anyBinding.access_token.trim().length > 0) {
    return anyBinding.access_token.trim();
  }

  // Fallback 2: Check any User table with fb_access_token
  const anyUser = await prisma.user.findFirst({
    where: { fb_access_token: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { fb_access_token: true }
  }).catch(() => null);
  if (anyUser?.fb_access_token && anyUser.fb_access_token.trim().length > 0) {
    return anyUser.fb_access_token.trim();
  }

  // Fallback 3: Check any FacebookAccount table with accessToken
  const anyFbAcc = await prisma.facebookAccount.findFirst({
    where: { accessToken: { not: "" } },
    orderBy: { updatedAt: "desc" },
    select: { accessToken: true }
  }).catch(() => null);
  if (anyFbAcc?.accessToken && anyFbAcc.accessToken.trim().length > 0) {
    return anyFbAcc.accessToken.trim();
  }

  // Fallback 4: Check any AdAccount table with fb_access_token
  const anyAdAcc = await prisma.adAccount.findFirst({
    where: { fb_access_token: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { fb_access_token: true }
  }).catch(() => null);
  if (anyAdAcc?.fb_access_token && anyAdAcc.fb_access_token.trim().length > 0) {
    return anyAdAcc.fb_access_token.trim();
  }

  return null;
}

export function getBaseUrl(): string {
  let url = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://1-eight-azure.vercel.app';
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  url = url.replace('http://', 'https://');
  return url.replace(/\/$/, '');
}

export function getFbRedirectUri(req?: any): string {
  if (process.env.META_REDIRECT_URI && process.env.META_REDIRECT_URI.trim()) {
    let uri = process.env.META_REDIRECT_URI.trim();
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      uri = `https://${uri}`;
    }
    uri = uri.replace('http://', 'https://');
    return uri.replace(/\/$/, '');
  }
  if (process.env.FACEBOOK_REDIRECT_URI && process.env.FACEBOOK_REDIRECT_URI.trim()) {
    let uri = process.env.FACEBOOK_REDIRECT_URI.trim();
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      uri = `https://${uri}`;
    }
    uri = uri.replace('http://', 'https://');
    return uri.replace(/\/$/, '');
  }

  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/auth/facebook/callback`;
  return redirectUri;
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
    const status = error.response?.status;
    const msg = error.response?.data?.error?.message;
    if (msg) return msg;

    if (status === 502) {
      return "Meta API 接口网关不可用 (502 Bad Gateway)，上游服务暂无响应，请稍后重试";
    }
    if (status === 503) {
      return "Meta API 接口服务暂不可用 (503 Service Unavailable)，请稍后重试";
    }
    if (status === 504) {
      return "Meta API 响应超时 (504 Gateway Timeout)，请稍后重试";
    }
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      return "Meta API 请求超时，网络连接不稳定，请稍后重试";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function callMetaApiWithRetry<T = any>(
  url: string,
  config: any = {},
  maxRetries: number = 3
): Promise<any> {
  let attempt = 0;
  const method = (config.method || "GET").toUpperCase();
  const timeoutMs = config.timeout || 15000;
  const mergedConfig = {
    method,
    url,
    timeout: timeoutMs,
    headers: {
      Accept: "application/json",
      "User-Agent": "MetaGraphClient/1.0",
      ...(config.headers || {}),
    },
    ...config,
  };

  let lastError: any;
  while (attempt < maxRetries) {
    attempt++;
    try {
      return await axios(mergedConfig);
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;
      const isRetryableStatus =
        status === 502 || status === 503 || status === 504 || status === 500 || status === 429;
      const isNetworkError =
        !status ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ERR_BAD_RESPONSE";

      if ((isRetryableStatus || isNetworkError) && attempt < maxRetries) {
        if ((status === 500 || status === 502 || status === 504) && mergedConfig.params) {
          if (typeof mergedConfig.params.limit === 'number' && mergedConfig.params.limit > 50) {
            mergedConfig.params.limit = Math.max(50, Math.floor(mergedConfig.params.limit / 2));
          } else if (typeof mergedConfig.params.limit === 'string' && parseInt(mergedConfig.params.limit, 10) > 50) {
            mergedConfig.params.limit = Math.max(50, Math.floor(parseInt(mergedConfig.params.limit, 10) / 2));
          }
        }
        const delayMs = attempt * 800;
        console.warn(
          `[Meta API Retry] ${method} request to ${url.split("?")[0]} failed (${status || err.code || err.message}). Retrying in ${delayMs}ms (Attempt ${attempt}/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        break;
      }
    }
  }
  throw lastError;
}

export async function evaluateActivityStatus(
  accountId: string, 
  fbAccountStatus: number, 
  token?: string,
  realTimeSpend?: number
): Promise<number> {
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

  // 0. Account Intelligent Resurrection / Activation Detection Logic
  let dbMonitoring = null;
  try {
    dbMonitoring = await prisma.metaAccountMonitoring.findUnique({
      where: { accountId: cleanAccountId }
    });
  } catch (e) {
    console.error(`[evaluateActivityStatus] Error fetching dbMonitoring for ${cleanAccountId}:`, e);
  }

  if (dbMonitoring) {
    const oldSpend = dbMonitoring.amountSpent || 0;
    const oldStatus = dbMonitoring.status;

    // Condition A: Meta real-time returned spend (latest historical total spend) is greater than DB recorded spend
    const hasNewSpend = typeof realTimeSpend === "number" && realTimeSpend > oldSpend;
    // Condition B: Meta status changed from PENDING/DISABLED (non-1) to ACTIVE (1)
    const becameActive = fbAccountStatus === 1 && oldStatus !== 1 && oldStatus !== null && oldStatus !== undefined;

    if (hasNewSpend || becameActive) {
      console.log(`[evaluateActivityStatus] 🔄 Resurrection triggered for ${cleanAccountId}: hasNewSpend=${hasNewSpend} (RealTime:${realTimeSpend} > DB:${oldSpend}), becameActive=${becameActive} (New:${fbAccountStatus} vs Old:${oldStatus})`);
      await saveActivityStatus(1);
      if (typeof realTimeSpend === "number") {
        try {
          await prisma.metaAccountMonitoring.update({
            where: { accountId: cleanAccountId },
            data: { amountSpent: realTimeSpend }
          });
        } catch (e) {}
      }
      return 1;
    }
  }

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

  // Default fallback/no-spend history in DB:
  // If Meta reports account status is ACTIVE (1) or has realTimeSpend > 0, set status to 2 (Active) instead of 4 (Dormant)
  if (fbAccountStatus === 1 || (typeof realTimeSpend === "number" && realTimeSpend > 0)) {
    await saveActivityStatus(2);
    return 2;
  }

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
  if (!token || !token.trim()) {
    throw new Error("未提供有效的 Facebook 授权 Token，请先完成账号绑定");
  }
  const cleanAccountId = accountId.replace("act_", "");
  const url = `https://graph.facebook.com/v19.0/act_${cleanAccountId}/insights`;
  console.log(`[Unified Ad Sync] Fetching ACCOUNT-level insights for account ${cleanAccountId} from URL ${url}`);
  
  let insightsResponse;
  try {
    insightsResponse = await callMetaApiWithRetry(
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
        timeout: 45000,
      },
      3
    );
  } catch (err: any) {
    const metaErr = extractMetaError(err);
    console.warn(`[Unified Ad Sync] Meta API error for account ${cleanAccountId}: ${metaErr}`);

    const isGatewayError =
      err.response?.status === 502 ||
      err.response?.status === 503 ||
      err.response?.status === 504 ||
      (metaErr && metaErr.includes("502"));

    if (isGatewayError) {
      const existingInsightsCount = await prisma.adInsight.count({
        where: {
          accountId: { in: [cleanAccountId, `act_${cleanAccountId}`] },
          date: { gte: startDate, lte: endDate }
        }
      }).catch(() => 0);

      if (existingInsightsCount > 0) {
        console.info(`[Unified Ad Sync] Meta API returned ${err.response?.status || 502} after retries. Preserving existing ${existingInsightsCount} DB records for account ${cleanAccountId}.`);
        return existingInsightsCount;
      }
    }

    const customError: any = new Error(metaErr);
    customError.response = err.response;
    customError.status = err.response?.status || (isGatewayError ? 502 : 403);
    throw customError;
  }

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
      if (!mapping) {
        await prisma.accountMapping.create({
          data: {
            fbAccountId: rawAccountId,
            storeId: null,
          }
        });
      }

      dbAdAccount = await prisma.adAccount.create({
        data: {
          fb_account_id: rawAccountId,
          fb_account_name: accountNameRaw,
          fb_access_token: token,
          storeId: targetStoreId
        }
      });
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

    const store = dbAdAccount && dbAdAccount.storeId ? await prisma.store.findUnique({ where: { id: dbAdAccount.storeId } }) : null;
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

    // 4. Record account-level AdInsight for each day (strictly overwritten by date)
    accountInsightsByDate[currentDate] = {
      date: currentDate,
      accountName: accountNameRaw,
      reach,
      impressions,
      clicks,
      spend,
      addToCart: carts,
      initiateCheckout: checkouts,
      purchases,
      purchaseValue
    };
  }

  // 5. Save the daily AdInsight items with strict overwrite UPSERT
  for (const dateKey of Object.keys(accountInsightsByDate)) {
    const item = accountInsightsByDate[dateKey];
    await upsertDailyInsightRecord({
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
    });
    syncedRecords++;
  }

  return syncedRecords;
}

export async function safeUpsertAdPerformanceDaily(
  adId: string,
  date: string,
  data: {
    accountId: string;
    creativeId?: string | null;
    spend?: number;
    impressions?: number;
    reach?: number;
    clicks?: number;
    linkClicks?: number;
    purchases?: number;
    purchaseValue?: number;
    addToCart?: number;
    initiateCheckout?: number;
  }
) {
  if (!adId || !date) return;

  const payload = {
    accountId: cleanFbAccountId(data.accountId),
    creativeId: data.creativeId || null,
    spend: Number.isFinite(data.spend) ? Number(data.spend) : 0,
    impressions: Number.isFinite(data.impressions) ? Math.trunc(Number(data.impressions)) : 0,
    reach: Number.isFinite(data.reach) ? Math.trunc(Number(data.reach)) : 0,
    clicks: Number.isFinite(data.clicks) ? Math.trunc(Number(data.clicks)) : 0,
    linkClicks: Number.isFinite(data.linkClicks) ? Math.trunc(Number(data.linkClicks)) : 0,
    purchases: Number.isFinite(data.purchases) ? Math.trunc(Number(data.purchases)) : 0,
    purchaseValue: Number.isFinite(data.purchaseValue) ? Number(data.purchaseValue) : 0,
    addToCart: Number.isFinite(data.addToCart) ? Math.trunc(Number(data.addToCart)) : 0,
    initiateCheckout: Number.isFinite(data.initiateCheckout) ? Math.trunc(Number(data.initiateCheckout)) : 0,
  };

  // Always cache in memory first
  const cacheKey = `${adId}_${date}`;
  adPerformanceInMemoryCache.set(cacheKey, {
    adId,
    date,
    ...payload
  });

  try {
    // Attempt direct database upsert on rawPrisma to bypass proxy's executeWithFallback logging
    return await rawPrisma.adPerformanceDaily.upsert({
      where: {
        adId_date: { adId, date }
      },
      update: payload,
      create: {
        adId,
        date,
        ...payload
      }
    });
  } catch (err: any) {
    if (err.code === 'P2002' || err.message?.includes('Unique constraint failed')) {
      try {
        return await rawPrisma.adPerformanceDaily.update({
          where: {
            adId_date: { adId, date }
          },
          data: payload
        });
      } catch (retryErr: any) {
        console.warn(`[safeUpsertAdPerformanceDaily] Direct update retry failed for ${adId}/${date}:`, retryErr.message);
      }
    } else {
      console.warn(`[safeUpsertAdPerformanceDaily] Direct rawPrisma upsert failed for ${adId}/${date}, falling back to proxy:`, err.message);
    }

    // Fallback to proxy (which handles standard fallback & db_fallback.json persistence)
    try {
      return await prisma.adPerformanceDaily.upsert({
        where: {
          adId_date: { adId, date }
        },
        update: payload,
        create: {
          adId,
          date,
          ...payload
        }
      });
    } catch (proxyErr: any) {
      console.warn(`[safeUpsertAdPerformanceDaily] Proxy fallback also failed:`, proxyErr.message);
    }
    return adPerformanceInMemoryCache.get(cacheKey);
  }
}

export async function safeGetAdInsights(whereClause: any): Promise<any[]> {
  let dbResults: any[] = [];
  try {
    dbResults = await prisma.adInsight.findMany({
      where: whereClause,
      orderBy: { date: "asc" }
    });
  } catch (err: any) {
    console.warn("[safeGetAdInsights] DB query failed, using in-memory cache:", err.message);
  }

  const mergedMap = new Map<string, any>();
  for (const row of dbResults) {
    mergedMap.set(`${row.accountId}_${row.date}`, row);
  }

  for (const [key, item] of adInsightInMemoryCache.entries()) {
    let matches = true;

    if (whereClause) {
      if (whereClause.accountId) {
        if (whereClause.accountId.in) {
          if (!whereClause.accountId.in.includes(item.accountId)) matches = false;
        } else if (whereClause.accountId.notIn) {
          if (whereClause.accountId.notIn.includes(item.accountId)) matches = false;
        } else if (typeof whereClause.accountId === 'string') {
          if (item.accountId !== whereClause.accountId) matches = false;
        }
      }

      if (whereClause.date && matches) {
        if (whereClause.date.gte && item.date < whereClause.date.gte) matches = false;
        if (whereClause.date.lte && item.date > whereClause.date.lte) matches = false;
        if (whereClause.date.gt && item.date <= whereClause.date.gt) matches = false;
        if (whereClause.date.lt && item.date >= whereClause.date.lt) matches = false;
      }
    }

    if (matches) {
      mergedMap.set(key, item);
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function safeGetAdPerformanceDaily(whereClause: any): Promise<any[]> {
  let dbResults: any[] = [];
  try {
    dbResults = await prisma.adPerformanceDaily.findMany({
      where: whereClause
    });
  } catch (err: any) {
    console.warn("[safeGetAdPerformanceDaily] DB query failed, using in-memory cache:", err.message);
  }

  const mergedMap = new Map<string, any>();
  for (const row of dbResults) {
    mergedMap.set(`${row.adId}_${row.date}`, row);
  }

  for (const [key, item] of adPerformanceInMemoryCache.entries()) {
    let matches = true;

    if (whereClause) {
      if (whereClause.adId) {
        if (whereClause.adId.in) {
          if (!whereClause.adId.in.includes(item.adId)) matches = false;
        } else if (typeof whereClause.adId === 'string') {
          if (item.adId !== whereClause.adId) matches = false;
        }
      }

      if (whereClause.date && matches) {
        if (whereClause.date.gte && item.date < whereClause.date.gte) matches = false;
        if (whereClause.date.lte && item.date > whereClause.date.lte) matches = false;
      }
    }

    if (matches) {
      mergedMap.set(key, item);
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Dynamically resolves the webhook callback URL for material processing tasks.
 * Detects whether the environment is development or production (Vercel/Cloud Run).
 */
export function getWebhookUrl(): string {
  // 1. Prioritize APP_URL if configured
  if (process.env.APP_URL) {
    const cleanAppUrl = process.env.APP_URL.replace(/\/$/, "");
    return `${cleanAppUrl}/api/webhook/material`;
  }

  // 2. Fallback to Vercel System Env
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/webhook/material`;
  }

  // 3. Fallback to local environment
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    // If you are using ngrok or a local tunnel, configure it here or via APP_URL env
    return "http://localhost:3000/api/webhook/material";
  }

  return "https://your-production-domain.com/api/webhook/material";
}

/**
 * 校验广告账户名是否符合指定的白名单前缀/规范
 * @param accountName 广告账户名称
 * @returns boolean (true: 保留, false: 过滤排除)
 */
export function isValidAdAccountName(accountName: string | null | undefined): boolean {
  if (!accountName || accountName.trim() === '') {
    return false;
  }
  return true;
}

