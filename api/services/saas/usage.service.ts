import { prisma } from "../../db/prisma.js";

export class SaaSContextService {
  /**
   * Usage Metering Middleware Logic
   */
  static async checkAiAnalysisQuota(organizationId: string): Promise<boolean> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org) return false;

    // Hardcode limits based on plan tier
    const monthlyLimit =
      org.plan === "FREE" ? 10 : org.plan === "PRO" ? 500 : 999999;

    // Check usage in Redis or DB (Pseudo check here)
    // const usage = await redisClient.get(`usage:ai:${organizationId}:${currentMonth}`);
    const currentUsage = 5; // Placeholder

    if (currentUsage >= monthlyLimit) {
      return false; // Reached Quota Limit
    }

    // Increment Usage logic...
    // await redisClient.incr(`usage:ai:${organizationId}:${currentMonth}`);
    return true;
  }

  /**
   * Simple Feature Flag check based on Plan Tier
   */
  static async isFeatureEnabled(
    organizationId: string,
    featureKey: "ADVANCED_REPORTING" | "AI_AUTO_EXECUTION",
  ): Promise<boolean> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org) return false;

    if (featureKey === "ADVANCED_REPORTING") {
      return org.plan === "PRO" || org.plan === "ENTERPRISE";
    }

    if (featureKey === "AI_AUTO_EXECUTION") {
      return org.plan === "ENTERPRISE";
    }

    return false;
  }
}
