import type { Request } from "express";
import prisma from "../../../../db/index.js";

export type PageCenterMetaEnvironment = NodeJS.ProcessEnv & {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  FACEBOOK_CONFIG_ID?: string;
  META_GRAPH_API_VERSION?: string;
  PAGE_CENTER_META_REDIRECT_URI?: string;
  APP_URL?: string;
  VERCEL_URL?: string;
};

export type PageCenterMetaConfig = {
  clientId: string;
  clientSecret: string;
  configId?: string;
  graphVersion: string;
  redirectUri: string;
};

function normalizedOrigin(raw: string) {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  if (!/^https?:$/.test(url.protocol)) throw new Error("PAGE_CENTER_META_REDIRECT_URI_INVALID");
  return url.origin;
}

export function getPageCenterMetaRedirectUri(
  req: Pick<Request, "protocol" | "get">,
  environment: PageCenterMetaEnvironment = process.env,
) {
  const explicit = environment.PAGE_CENTER_META_REDIRECT_URI?.trim();
  if (explicit) {
    const url = new URL(/^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`);
    if (!/^https?:$/.test(url.protocol)) throw new Error("PAGE_CENTER_META_REDIRECT_URI_INVALID");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }

  const configuredBase = environment.APP_URL?.trim() || environment.VERCEL_URL?.trim();
  const origin = configuredBase
    ? normalizedOrigin(configuredBase)
    : normalizedOrigin(`${req.protocol}://${req.get("host") || "localhost"}`);
  return `${origin}/api/page-center-v2/meta/callback`;
}

export async function loadPageCenterMetaConfig(
  req: Pick<Request, "protocol" | "get">,
  environment: PageCenterMetaEnvironment = process.env,
): Promise<PageCenterMetaConfig> {
  const systemConfig = await (prisma as any).systemSetting.findFirst().catch(() => null);
  const settings = await (prisma as any).setting.findMany().catch(() => []);
  const settingMap = Object.fromEntries(
    settings.map((item: { key: string; value: string }) => [item.key, item.value]),
  );
  const clientId = environment.META_APP_ID || environment.FACEBOOK_CLIENT_ID || systemConfig?.meta_client_id || settingMap.FACEBOOK_CLIENT_ID;
  const clientSecret = environment.META_APP_SECRET || environment.FACEBOOK_CLIENT_SECRET || systemConfig?.meta_client_secret || settingMap.FACEBOOK_CLIENT_SECRET;
  const configId = environment.FACEBOOK_CONFIG_ID || systemConfig?.meta_config_id || settingMap.META_CONFIG_ID;

  if (!clientId || !clientSecret) throw new Error("PAGE_CENTER_META_APP_NOT_CONFIGURED");

  return {
    clientId,
    clientSecret,
    configId: configId || undefined,
    graphVersion: environment.META_GRAPH_API_VERSION?.trim() || "v20.0",
    redirectUri: getPageCenterMetaRedirectUri(req, environment),
  };
}
