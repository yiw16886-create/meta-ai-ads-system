const databaseUrl = process.env.DATABASE_URL || "";
const postgresUrl = process.env.POSTGRES_URL || "";
const finalDbUrl = databaseUrl ? databaseUrl : postgresUrl;

const adminId = process.env.VITE_ADMIN_ID || "admin";
const adminSecret = process.env.VITE_ADMIN_SECRET || "123456";

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const isVercel = process.env.VERCEL ? true : false;
const appUrl = process.env.APP_URL || "";

export const config = {
  port: 3000,
  db: {
    url: finalDbUrl,
  },
  admin: {
    id: adminId,
    secret: adminSecret,
  },
  env: {
    nodeEnv: nodeEnv,
    isProduction: isProduction,
    isVercel: isVercel,
    appUrl: appUrl,
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
