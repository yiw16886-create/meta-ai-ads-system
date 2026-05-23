import { InsightRepository } from "../../repositories/insight.repository.js";
import { MetaService } from "../meta/meta.service.js";

interface SyncDateRange {
  startDate: string;
  endDate: string;
}

export class SyncService {
  /**
   * Synchronizes data for a SINGLE Ad Account.
   * This decoupled approach allows Vercel to heavily parallelize, or a Worker (BullMQ) to process one account at a time without 504 errors.
   */
  static async syncAccountInsights(
    accountId: string,
    token: string,
    { startDate, endDate }: SyncDateRange
  ): Promise<{ accountId: string; count: number }> {
    // 1. Fetch raw insights from Meta
    const insights = await MetaService.fetchAccountInsights(accountId, token, {
      since: startDate,
      until: endDate,
    });

    const insightsToUpsert: any[] = [];

    // 2. Process and Format data per day
    for (const day of insights) {
      if (!day.date_start) continue;

      const actions = day.actions || [];
      const getActionValue = (type: string) => {
        const action = actions.find((a: any) => a.action_type === type);
        return action ? parseFloat(action.value) : 0;
      };

      const actionValues = day.action_values || [];
      const getActionVal = (type: string) => {
        const action = actionValues.find((a: any) => a.action_type === type);
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

      const cpc = clicks > 0 ? spend / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const atcRate = clicks > 0 ? (carts / clicks) * 100 : 0;
      const checkoutRate = carts > 0 ? (checkouts / carts) * 100 : 0;
      const cpp = purchases > 0 ? spend / purchases : 0;
      const roas = spend > 0 ? purchaseValue / spend : 0;

      insightsToUpsert.push({
        accountId: day.account_id || accountId,
        date: day.date_start,
        accountName: day.account_name || "Unknown",
        reach,
        impressions,
        clicks,
        spend,
        addToCart: carts,
        initiateCheckout: checkouts,
        purchases,
        purchaseValue,
        cpc,
        ctr,
        atcRate,
        checkoutRate,
        cpp,
        roas,
      });
    }

    // 3. Batch Upsert to Database via Repository
    if (insightsToUpsert.length > 0) {
      await InsightRepository.batchUpsertInsights(insightsToUpsert);
    }

    return { accountId, count: insightsToUpsert.length };
  }

  /**
   * For the `/api/sync` route directly syncing multiple accounts
   * (We batch them 3 at a time to prevent Vercel out of memory, but Vercel still limits at ~30-60s)
   */
  static async syncMultipleAccounts(
    accountsList: any[],
    token: string,
    dateRange: SyncDateRange,
  ) {
    let totalSynced = 0;
    const errors: string[] = [];
    const chunkSize = 3;

    for (let i = 0; i < accountsList.length; i += chunkSize) {
      const chunk = accountsList.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map(async (account) => {
          const accId = account.account_id || account.id;
          try {
            const res = await this.syncAccountInsights(accId, token, dateRange);
            totalSynced += res.count;
          } catch (e: any) {
            console.error(`Error syncing account ${accId}:`, e.message);
            errors.push(`Acc ${accId}: ${e.message}`);
          }
        }),
      );
    }

    return { totalSynced, errors };
  }
}
