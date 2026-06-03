import { Request, Response, NextFunction } from "express";
import prisma from "../db";
import fs from "fs";
import path from "path";

const SETTINGS_FILE = path.resolve(process.cwd(), "settings.json");

const readLocalSettings = (): Record<string, string> => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(content) || {};
    }
  } catch (err) {
    console.error("Failed to read local settings file:", err);
  }
  return {};
};

const writeLocalSettings = (settings: Record<string, string>) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write local settings file:", err);
  }
};

export class SettingsController {
  static async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    const localSettings = readLocalSettings();
    try {
      const settings = await prisma.setting.findMany();
      const configObj: Record<string, string> = { ...localSettings };
      settings.forEach((s) => {
        configObj[s.key] = s.value;
      });
      res.json(configObj);
    } catch (err: any) {
      console.warn("⚠️ [getSettings warning] Setting table might not exist or DB connection failed:", err.message);
      res.json({
        ...localSettings,
        _dbError: err.message || String(err),
        _dbTableMissing: err.message?.includes("does not exist") || err.message?.includes("relation") || err.message?.includes("not found")
      });
    }
  }

  static async updateSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key, value } = req.body;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }

      // Always save to local settings file first
      const currentLocal = readLocalSettings();
      currentLocal[key] = value;
      writeLocalSettings(currentLocal);
      
      // Attempt to save to database, but don't crash if database is down
      try {
        await prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });
      } catch (dbErr: any) {
        console.warn(`⚠️ [updateSetting warning] Failed to save setting "${key}" to DB, saved to local fallback file instead:`, dbErr.message);
      }

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

  static async dbDiagnose(req: Request, res: Response, next: NextFunction): Promise<void> {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
    if (!url) {
      res.json({
        connected: false,
        error: "DATABASE_URL or POSTGRES_URL is not set inside environment variables.",
        hasTables: false
      });
      return;
    }

    try {
      await prisma.$connect();
      
      let hasTables = false;
      try {
        await prisma.setting.findMany({ take: 1 });
        hasTables = true;
      } catch (tableErr: any) {
        console.warn("Table count/mapping check result:", tableErr.message);
      }

      res.json({
        connected: true,
        provider: url.split("@")[1] ? "PostgreSQL (" + url.split("@")[1].split("/")[0] + ")" : "PostgreSQL",
        hasTables,
        details: "Connection established successfully."
      });
    } catch (err: any) {
      res.json({
        connected: false,
        error: err.message || String(err),
        hasTables: false
      });
    }
  }

  static async dbPush(req: Request, res: Response, next: NextFunction): Promise<void> {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
    if (!url) {
      res.status(400).json({ error: "DATABASE_URL 环境变量未设置，请在部署面板配置数据库链接" });
      return;
    }

    if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
      process.env.DATABASE_URL = process.env.POSTGRES_URL;
    }

    const { exec } = await import("child_process");
    const path = await import("path");

    console.log("⚡ [dbPush API] Spawning programmatic prisma db push...");
    
    const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
    const command = `npx prisma db push --schema="${schemaPath}" --accept-data-loss`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Programmatic db push completed with error:", error);
        res.status(500).json({
          success: false,
          error: error.message,
          stdout: stdout,
          stderr: stderr
        });
        return;
      }

      console.log("✅ Programmatic db push completed with success:\n", stdout);
      res.json({
        success: true,
        stdout,
        stderr
      });
    });
  }
}
