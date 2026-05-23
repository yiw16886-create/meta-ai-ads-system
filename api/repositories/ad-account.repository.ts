import { prisma } from '../db/prisma.js';
import { Prisma } from '@prisma/client';

export class AdAccountRepository {
  /**
   * Find an active Meta ad account by its Meta-assigned string ID
   */
  static async findByFbId(fbAccountId: string) {
    return prisma.adAccount.findUnique({
      where: { fb_account_id: fbAccountId },
      include: { store: true }
    });
  }

  /**
   * Get all tracked accounts associated with stores
   */
  static async findAll() {
    return prisma.adAccount.findMany({
      include: { store: true }
    });
  }

  /**
   * Create or update ad account
   */
  static async upsertAccount(data: {
    fb_account_id: string;
    fb_account_name?: string;
    storeId: number;
    fb_access_token?: string;
  }) {
    return prisma.adAccount.upsert({
      where: { fb_account_id: data.fb_account_id },
      update: data,
      create: data,
    });
  }
}
