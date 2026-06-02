export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  db: {
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  },
  admin: {
    id: process.env.VITE_ADMIN_ID || "admin",
    secret: process.env.VITE_ADMIN_SECRET || "123456",
  },
  env: {
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    isVercel: !!process.env.VERCEL,
    appUrl: process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""),
  },
  meta: {
    apiVersion: "v19.0",
    graphBaseUrl: "https://graph.facebook.com",
  },
  cache: {
    ttl: 10 * 60 * 1000, // 10 minutes cache TTL
  }
};

export default config;
