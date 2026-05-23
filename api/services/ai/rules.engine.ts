export interface RuleAnomaly {
  metric: string;
  level: "INFO" | "WARNING" | "CRITICAL";
  message: string;
}

export class RulesEngine {
  /**
   * Fast, deterministic rule-based anomaly detection.
   * Runs before the AI to save compute and catch absolute limits.
   */
  static analyzeTrends(recentDays: any[]): {
    score: number;
    anomalies: RuleAnomaly[];
  } {
    let score = 100;
    const anomalies: RuleAnomaly[] = [];

    if (!recentDays || recentDays.length < 2) {
      return {
        score: 100,
        anomalies: [
          {
            metric: "DATA",
            level: "INFO",
            message: "Insufficient data for trend analysis",
          },
        ],
      };
    }

    const today = recentDays[recentDays.length - 1];
    const yesterday = recentDays[recentDays.length - 2];

    // 1. ROAS Checks (Base Score: 40)
    if (today.roas < 1.0) {
      score -= 20;
      anomalies.push({
        metric: "ROAS",
        level: "CRITICAL",
        message: `ROAS is critically low: ${today.roas.toFixed(2)}`,
      });
    } else if (today.roas < 2.0) {
      score -= 5;
    }

    // 2. CTR Checks
    if (today.ctr < 1.0) {
      score -= 10;
      anomalies.push({
        metric: "CTR",
        level: "WARNING",
        message: `Low Click-Through-Rate (${today.ctr.toFixed(2)}%) indicates creative fatigue or mismatch.`,
      });
    }

    // 3. CPM Spike (Cost increases suddenly)
    // Avoid division by zero
    const todayCpm = (today.spend / (today.impressions || 1)) * 1000;
    const yesterdayCpm =
      (yesterday.spend / (yesterday.impressions || 1)) * 1000;
    if (yesterdayCpm > 0 && todayCpm > yesterdayCpm * 1.5) {
      score -= 15;
      anomalies.push({
        metric: "CPM",
        level: "WARNING",
        message: `CPM spiked by >50% compared to yesterday ($${yesterdayCpm.toFixed(2)} -> $${todayCpm.toFixed(2)}). Audience might be exhausted.`,
      });
    }

    // 4. Funnel Dropoff (Checkout to Purchase)
    if (today.initiateCheckout > 0 && today.purchases === 0) {
      score -= 10;
      anomalies.push({
        metric: "FUNNEL",
        level: "CRITICAL",
        message: `Users are initiating checkout but not purchasing. Check Pixel or payment gateway.`,
      });
    }

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    return { score, anomalies };
  }
}
