import { prisma } from '../db/prisma.js';
import { Prisma } from '@prisma/client';

export class InsightRepository {
  /**
   * Batch upsert Ad Insights using an interactive transaction.
   * This is optimal for Vercel/Neon connection pooling because it 
   * executes a chunk of promises within a single logical transaction,
   * avoiding "too many open connections" errors.
   */
  static async batchUpsertInsights(insightsData: Prisma.AdInsightCreateInput[]) {
    return prisma.$transaction(
      insightsData.map((data) =>
        prisma.adInsight.upsert({
          where: {
            accountId_date: {
              accountId: data.accountId,
              date: data.date,
            },
          },
          update: data,
          create: data,
        })
      )
    );
  }

  /**
   * Find insights for a specific account over a date range
   */
  static async findByAccountAndDateRange(accountId: string, startDate: string, endDate: string) {
    return prisma.adInsight.findMany({
      where: {
        accountId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }
}
