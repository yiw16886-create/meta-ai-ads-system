import { Request, Response, NextFunction } from "express";
import prisma from "../db.js";

export class SettingsController {
  static async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await prisma.setting.findMany();
      const configObj: Record<string, string> = {};
      settings.forEach((s) => {
        configObj[s.key] = s.value;
      });
      res.json(configObj);
    } catch (err) {
      next(err);
    }
  }

  static async updateSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key, value } = req.body;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Save Token Error]:", err);
      if (
        err.name === "PrismaClientInitializationError" ||
        err.message?.includes("Authentication failed")
      ) {
        res.status(500).json({
          error: "数据库连接失败，请检查环境变量 DATABASE_URL 是否正确或密码是否已过期。",
        });
      } else {
        res.status(500).json({
          error: "Failed to save setting",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
