export function loadEnv(config: any) {
  config.db.url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  config.admin.id = process.env.VITE_ADMIN_ID || "admin";
  config.admin.secret = process.env.VITE_ADMIN_SECRET || "123456";
  config.env.nodeEnv = process.env.NODE_ENV || "development";
  config.env.isProduction = process.env.NODE_ENV === "production";
  config.env.isVercel = !!process.env.VERCEL;
  config.env.appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
}
