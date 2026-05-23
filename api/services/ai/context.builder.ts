import { InsightRepository } from "../../repositories/insight.repository.js";
import { AdAccountRepository } from "../../repositories/ad-account.repository.js";

export class AiContextBuilder {
  /**
   * Build a time-series context for AI analysis
   * Retrieves the last 14 days of data to provide trend capabilities
   */
  static async buildDiagnosticContext(accountId: string) {
    const today = new Date();
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(today.getDate() - 14);

    const startDate = fourteenDaysAgo.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    // Read via Repository
    const insights = await InsightRepository.findByAccountAndDateRange(
      accountId,
      startDate,
      endDate,
    );
    const accountInfo = await AdAccountRepository.findByFbId(accountId);

    // Build tabular context for LLM to easily parse
    let dataTable =
      "Date | Spend | Impressions | Clicks | CTR | CPC | CPM | ATC | Checkouts | Purchases | ROAS | CPP | ATC Rate\n";
    dataTable += "---|---|---|---|---|---|---|---|---|---|---|---|---\n";

    insights.reverse().forEach((row) => {
      dataTable += `${row.date.toISOString().split("T")[0]} | $${row.spend.toFixed(2)} | ${row.impressions} | ${row.clicks} | ${row.ctr.toFixed(2)}% | $${row.cpc.toFixed(2)} | $${((row.spend / (row.impressions || 1)) * 1000).toFixed(2)} | ${row.addToCart} | ${row.initiateCheckout} | ${row.purchases} | ${row.roas.toFixed(2)} | $${row.cpp.toFixed(2)} | ${row.atcRate.toFixed(2)}%\n`;
    });

    return {
      accountName: accountInfo?.fb_account_name || "Unknown Account",
      currency: "USD",
      historyTable: dataTable,
      daysAnalyzed: insights.length,
    };
  }
}
