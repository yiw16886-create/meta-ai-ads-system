import { metaClient } from "./meta.client.js";

export class MetaService {
  /**
   * Fetch Ad Accounts for a User/Token.
   */
  static async fetchAdAccounts(token: string): Promise<any[]> {
    const res = await metaClient.get(`/me/adaccounts`, {
      access_token: token,
      fields:
        "account_id,name,account_status,currency,spend_cap,amount_spent,balance,business",
      limit: 100, // increased pagination
    });
    return res.data || [];
  }

  /**
   * Fetch paginated ad insights for a given account.
   * Uses cursor pagination to safely retrieve large datasets without Vercel timeouts.
   */
  static async fetchAccountInsights(
    accountId: string,
    token: string,
    timeRange: { since: string; until: string },
    level: string = "campaign",
  ): Promise<any[]> {
    let allData: any[] = [];
    let url = `/act_${accountId}/insights`;

    // Determine the Graph API fields to request
    const fields =
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,cpm,cpc,ctr,actions,action_values,impressions,clicks,purchase_roas,frequency";

    let params: any = {
      access_token: token,
      level,
      time_range: JSON.stringify(timeRange),
      time_increment: 1, // Crucial for getting daily arrays
      fields,
      limit: 50, // Safe limit to prevent 504 on large accounts
    };

    while (url) {
      const response = await metaClient.get(url, params);

      if (response && response.data) {
        allData = allData.concat(response.data);
      }

      if (response.paging && response.paging.next) {
        // Facebook's next URL already contains the full path including token and params
        url = response.paging.next;
        params = {}; // clear params to prevent appending twice
      } else {
        url = ""; // Break out of loop when no more pages
      }
    }

    return allData;
  }
}
