export const config = {
  port: 3000,
  db: {
    url: process.env.DATABASE_URL,
  },
  admin: {
    id: process.env.VITE_ADMIN_ID,
    secret: process.env.VITE_ADMIN_SECRET,
  },
  env: {
    nodeEnv: process.env.NODE_ENV,
    isProduction: process.env.NODE_ENV,
    isVercel: process.env.VERCEL,
    appUrl: process.env.APP_URL,
  },
  meta: {
    apiVersion: "v19.0",
    graphBaseUrl: "https://graph.facebook.com",
  },
  cache: {
    ttl: 600000,
  }
};

export default config;

