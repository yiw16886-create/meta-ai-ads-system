import { loadEnv } from "./env-loader";

export const config = {
  port: 3000,
  db: {
    url: "",
  },
  admin: {
    id: "admin",
    secret: "123456",
  },
  env: {
    nodeEnv: "development",
    isProduction: false,
    isVercel: false,
    appUrl: "",
  },
  meta: {
    apiVersion: "v19.0",
    graphBaseUrl: "https://graph.facebook.com",
  },
  cache: {
    ttl: 600000,
  }
};

loadEnv(config);

export default config;
