import { Request, Response, NextFunction } from "express";
import prisma from "../db.js";

export class StoresController {
  static async getStoresDashboardSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        res.status(400).json({ error: "Missing required query parameters: startDate, endDate" });
         return;
      }

      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);

      const stores = await prisma.store.findMany();
      const summaries: Record<string, any> = {};

      for (const store of stores) {
        const isConfigured = !!(store.shopify_token || store.shopline_token);
        
        const aggregationResult = await prisma.order.aggregate({
          where: {
            storeId: store.id,
            createdAt: {
              gte: start,
              lte: end,
            },
          },
          _sum: {
            revenue: true,
          },
          _count: {
            id: true,
          }
        });

        summaries[store.name] = {
          isConfigured,
          error: null,
          totalSales: aggregationResult._sum.revenue || 0,
          ordersCount: aggregationResult._count.id || 0,
        };
      }

      res.json(summaries);
    } catch (error) {
      next(error);
    }
  }

  static async getStoreDashboardSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: "Missing required query parameters: startDate, endDate" });
        return;
      }

      const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
      let store;
      if (isNumeric) {
        store = await prisma.store.findUnique({
          where: { id: parseInt(id, 10) },
        });
      } else {
        store = await prisma.store.findFirst({
          where: { name: { equals: id, mode: "insensitive" } },
        });
      }

      if (!store) {
        res.status(404).json({ error: "Store not found" });
        return;
      }

      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);

      const aggregateResult = await prisma.order.aggregate({
        where: {
          storeId: store.id,
          createdAt: {
            gte: start,
            lte: end,
          }
        },
        _sum: {
          revenue: true,
        },
        _count: {
          id: true,
        },
      });

      const totalSales = aggregateResult._sum.revenue || 0;
      const totalOrders = aggregateResult._count.id || 0;
      const totalVisitors = store.visitors || 0;
      const avgConversionRate = totalVisitors > 0 ? (totalOrders / totalVisitors) * 100 : 0;

      const isConfigured = !!(store.shopify_token || store.shopline_token);

      res.json({
        summary: {
          totalSales,
          totalOrders,
          totalVisitors,
          avgConversionRate,
        },
        shopline: {
          isConfigured,
          error: false,
          errorMessage: null,
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async listStores(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stores = await prisma.store.findMany({
        include: { accounts: true },
      });
      res.json(stores);
    } catch (error) {
      next(error);
    }
  }

  static async saveStore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, name, shopline_token, shopify_token, domain, visitors, timezone } = req.body;
      if (id) {
        const updatedStore = await prisma.store.update({
          where: { id: parseInt(id, 10) },
          data: { 
            name, 
            shopline_token, 
            shopify_token, 
            domain,
            timezone: timezone || undefined,
            visitors: visitors !== undefined ? parseInt(visitors, 10) : undefined
          },
        });
        res.json(updatedStore);
      } else {
        const newStore = await prisma.store.create({
          data: { 
            name, 
            shopline_token, 
            shopify_token, 
            domain,
            timezone: timezone || "GMT+8",
            visitors: visitors !== undefined ? parseInt(visitors, 10) : 0
          },
        });
        res.json(newStore);
      }
    } catch (error) {
      next(error);
    }
  }

  static async getStore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
      let store;
      if (isNumeric) {
        store = await prisma.store.findUnique({
          where: { id: parseInt(id, 10) },
          include: { accounts: true },
        });
      } else {
        store = await prisma.store.findFirst({
          where: { name: { equals: id, mode: "insensitive" } },
          include: { accounts: true },
        });
      }

      if (!store) {
        res.status(404).json({ error: "Store not found" });
        return;
      }
      res.json(store);
    } catch (error) {
      next(error);
    }
  }

  static async deleteStore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await prisma.store.delete({
        where: { id: parseInt(id, 10) },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  static async addAdAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { fb_account_id, fb_account_name, fb_access_token } = req.body;

      const account = await prisma.adAccount.upsert({
        where: { fb_account_id },
        update: {
          fb_account_name,
          fb_access_token,
          storeId: parseInt(id, 10),
        },
        create: {
          fb_account_id,
          fb_account_name,
          fb_access_token,
          storeId: parseInt(id, 10),
        },
      });

      res.json(account);
    } catch (error) {
      next(error);
    }
  }

  static async removeAdAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accountId } = req.params;
      await prisma.adAccount.delete({
        where: { fb_account_id: accountId },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
