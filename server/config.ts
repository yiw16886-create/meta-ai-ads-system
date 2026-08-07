/**
 * 集中配置管理 — 所有环境变量在此统一读取和校验
 * 生产环境强制要求设置关键变量，避免使用弱回退值
 */

const isDev = process.env.NODE_ENV !== "production";
const isVercel = !!process.env.VERCEL;

function requireEnv(key: string, devFallback?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (isDev && devFallback !== undefined) {
    console.warn(`⚠️ [CONFIG] ${key} 未设置，使用开发回退值（生产环境禁止）`);
    return devFallback;
  }
  throw new Error(
    `❌ [CONFIG] 缺少必需的环境变量: ${key}。请设置该环境变量后重启服务。`
  );
}

function optionalEnv(key: string, fallback: string = ""): string {
  return process.env[key] || fallback;
}

export const config = {
  // 认证
  jwtSecret: requireEnv("JWT_SECRET", "dev_jwt_secret_key_change_in_production"),
  adminSecret: requireEnv("ADMIN_SECRET", "dev_admin_secret_change_in_production"),

  // 数据库
  databaseUrl: optionalEnv("DATABASE_URL") ||
    optionalEnv("POSTGRES_PRISMA_URL") ||
    optionalEnv("POSTGRES_URL"),

  // Meta / Facebook
  facebookClientId: optionalEnv("FACEBOOK_CLIENT_ID"),
  facebookClientSecret: optionalEnv("FACEBOOK_CLIENT_SECRET"),
  facebookConfigId: optionalEnv("FACEBOOK_CONFIG_ID"),

  // AI — 可选，未设置时 AI 分析功能将不可用但不会报错
  // GEMINI_API_KEY 是个人密钥，生产环境不应共享给其他用户
  geminiApiKey: optionalEnv("GEMINI_API_KEY"),

  // 应用
  appUrl: optionalEnv("APP_URL"),
  vercelUrl: optionalEnv("VERCEL_URL"),

  // 加密 — 可选，未设置时 Token 以明文存储（个人使用场景，Neon 数据库本身已有安全保护）
  encryptionKey: optionalEnv("ENCRYPTION_KEY"),

  // 邮件
  smtpHost: optionalEnv("SMTP_HOST"),
  smtpPort: optionalEnv("SMTP_PORT"),
  smtpUser: optionalEnv("SMTP_USER"),
  smtpPass: optionalEnv("SMTP_PASS"),

  // 管理员初始化
  adminEmail: optionalEnv("ADMIN_EMAIL"),
  adminPassword: optionalEnv("ADMIN_PASSWORD"),

  // 环境标识
  isDev,
  isVercel,
  nodeEnv: optionalEnv("NODE_ENV", "development"),

  // 速率限制配置
  rateLimit: {
    global: { windowMs: 60_000, max: 100 },       // 全局：100 req/min
    auth: { windowMs: 60_000, max: 5 },            // 登录/注册：5 req/min
    metaApi: { windowMs: 60_000, max: 30 },        // Meta API 代理：30 req/min
  },

  // 缓存 TTL（毫秒）
  cache: {
    metaInsights: 5 * 60 * 1000,      // 5 min
    aggregatedData: 15 * 60 * 1000,   // 15 min
    accountList: 30 * 60 * 1000,      // 30 min
    token: 30 * 60 * 1000,            // 30 min
  },
} as const;
