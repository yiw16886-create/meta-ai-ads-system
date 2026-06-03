import { Request, Response, NextFunction } from "express";
import prisma from "../db";

export class InsightsController {
  static async getInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { startDate, endDate } = req.query;
    try {
      const data = await prisma.adInsight.findMany({
        where: {
          date: {
            gte: startDate as string,
            lte: endDate as string,
          }
        },
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
}
