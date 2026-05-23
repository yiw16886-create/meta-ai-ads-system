import axios, { AxiosInstance, AxiosError } from "axios";
import { AppError } from "../../utils/AppError.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

class MetaApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://graph.facebook.com/v22.0",
      timeout: 15000,
    });

    // Response Interceptor for Rate Limiting and Error Handling
    this.client.interceptors.response.use(
      (response) => {
        const usageHeader = response.headers["x-business-use-case-usage"];
        if (usageHeader) {
          try {
            const usageData = JSON.parse(usageHeader);
            this.checkRateLimitWarning(usageData);
          } catch (e) {
            // ignore JSON parse error for headers
          }
        }
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as any;
        if (!config || !config.retryCount) {
          if (config) config.retryCount = 0;
        }

        const isRateLimit = error.response?.status === 429;
        const isNetworkError = !error.response;

        if (
          (isRateLimit || isNetworkError) &&
          config.retryCount < MAX_RETRIES
        ) {
          config.retryCount += 1;
          // Exponential backoff
          const delay = isRateLimit
            ? RETRY_DELAY_MS * Math.pow(2, config.retryCount)
            : RETRY_DELAY_MS;
          console.warn(
            `[Meta API] Retry ${config.retryCount}/${MAX_RETRIES} after ${delay}ms... (RateLimit: ${isRateLimit})`,
          );
          await new Promise((res) => setTimeout(res, delay));
          return this.client.request(config);
        }

        const metaError =
          (error.response?.data as any)?.error?.message || error.message;
        throw new AppError(
          `Meta API Error: ${metaError}`,
          error.response?.status || 500,
        );
      },
    );
  }

  private checkRateLimitWarning(usageData: any) {
    // Example: {"111053000": [{"type": "ads_management", "call_count": 8, "total_cputime": 1, "total_time": 1}]}
    for (const fbId in usageData) {
      if (Array.isArray(usageData[fbId])) {
        for (const usage of usageData[fbId]) {
          const maxUsage = Math.max(
            usage.call_count || 0,
            usage.total_cputime || 0,
            usage.total_time || 0,
          );
          if (maxUsage > 80) {
            console.warn(
              `[⚠️ Meta Rate Limit Warning] Account/App ${fbId} usage exceeded 80%: ${maxUsage}%`,
            );
            // Future: Set Redis key to throttle requests across Serverless instances temporarily
          }
        }
      }
    }
  }

  public async get<T = any>(url: string, params: any = {}): Promise<T> {
    const response = await this.client.get(url, { params });
    return response.data;
  }
}

export const metaClient = new MetaApiClient();
