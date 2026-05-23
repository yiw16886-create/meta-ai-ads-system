import { prisma } from '../db/prisma.js';

export async function getSmtpConfig() {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]
      }
    }
  });
  
  const configMap: Record<string, string> = {};
  settings.forEach(s => { configMap[s.key] = s.value; });
  
  if (!configMap.SMTP_HOST || !configMap.SMTP_USER || !configMap.SMTP_PASS) return null;
  
  return {
    host: configMap.SMTP_HOST,
    port: parseInt(configMap.SMTP_PORT || "465"),
    secure: configMap.SMTP_PORT === "465",
    auth: {
      user: configMap.SMTP_USER,
      pass: configMap.SMTP_PASS
    },
    from: configMap.SMTP_FROM || configMap.SMTP_USER
  };
}

export async function getMetaToken() {
  const setting = await prisma.setting.findUnique({
    where: { key: "META_ACCESS_TOKEN" },
  });
  return setting?.value || process.env.META_ACCESS_TOKEN;
}
