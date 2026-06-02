import { Request, Response, NextFunction } from "express";
import prisma from "../db.js";
import { getProductIntelligence } from "../services/product-intelligence.service.js";
import { getCreativeIntelligence } from "../services/creative-intelligence.service.js";
import { attributePurchases } from "../services/attribution.service.js";
import { aggregateData } from "../services/aggregation.service.js";

export class IntelligenceController {
  static async getProductIntelligence(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: "Missing dates" });
      return;
    }
    try {
      const data = await getProductIntelligence(startDate as string, endDate as string);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  static async getCreativeIntelligence(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { startDate, endDate, storeFilter } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: "Missing dates" });
      return;
    }
    try {
      const data = await getCreativeIntelligence(startDate as string, endDate as string, storeFilter as string);
      
      // Set headers for chunked streaming response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      res.write('[\n');
      for (let i = 0; i < data.length; i++) {
        res.write(JSON.stringify(data[i]));
        if (i < data.length - 1) {
          res.write(',\n');
        }
      }
      res.write('\n]');
      res.end();
    } catch (error: any) {
      if (!res.headersSent) {
        next(error);
      } else {
        res.end();
      }
    }
  }

  static async getDailyCreativePerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { startDate, endDate, storeFilter } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: "Missing dates" });
      return;
    }
    try {
      let creativeIds: string[] | undefined = undefined;

      if (storeFilter && storeFilter !== 'all') {
        const isNum = !isNaN(Number(storeFilter));
        const store = await prisma.store.findFirst({
          where: isNum 
            ? { id: Number(storeFilter) } 
            : { name: { equals: storeFilter as string, mode: 'insensitive' } }
        });
        if (store) {
          const mappings = await prisma.accountMapping.findMany({
            where: { storeId: store.id },
            select: { fbAccountId: true }
          });
          const fbAccountIds = mappings.map(m => m.fbAccountId);
          const creatives = await prisma.adCreative.findMany({
            where: { fbAccountId: { in: fbAccountIds } },
            select: { creativeId: true }
          });
          creativeIds = creatives.map(c => c.creativeId);
        }
      }

      const data = await prisma.creativePerformanceDaily.findMany({
        where: {
          date: {
            gte: startDate as string,
            lte: endDate as string
          },
          ...(creativeIds ? { creativeId: { in: creativeIds } } : {})
        },
        orderBy: {
          date: "asc"
        }
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  static async aggregate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      res.status(400).json({ error: "Missing dates" });
      return;
    }
    try {
      await attributePurchases();
      const result = await aggregateData(startDate, endDate);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
