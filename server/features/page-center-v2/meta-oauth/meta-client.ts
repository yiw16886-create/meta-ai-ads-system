import type { PageCenterMetaConfig } from "./config.js";

export type MetaPermission = { permission: string; status: string };
export type MetaPage = {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  tasks?: string[];
};

type MetaResponse<T> = T & { error?: { code?: number } };

export class PageCenterMetaClient {
  constructor(
    private readonly config: PageCenterMetaConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async graph<T>(
    path: string,
    parameters: Record<string, string>,
    method: "GET" | "POST" = "GET",
  ) {
    const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/${path}`);
    const { access_token: accessToken, ...requestParameters } = parameters;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const requestInit: RequestInit = { method, headers };
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestInit.body = new URLSearchParams(requestParameters);
    } else {
      Object.entries(requestParameters).forEach(([key, value]) => url.searchParams.set(key, value));
    }
    const response = await this.request(url, requestInit);
    const body = (await response.json()) as MetaResponse<T>;
    if (!response.ok || body.error) {
      const code = body.error?.code ? `_${body.error.code}` : "";
      throw new Error(`PAGE_CENTER_META_GRAPH_ERROR${code}`);
    }
    return body;
  }

  async exchangeCode(code: string) {
    const short = await this.graph<{ access_token: string; expires_in?: number }>("oauth/access_token", {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
    }, "POST");
    const long = await this.graph<{ access_token: string; expires_in?: number }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      fb_exchange_token: short.access_token,
    }, "POST");
    return long.access_token ? long : short;
  }

  async identity(userToken: string) {
    return this.graph<{ id: string; name?: string }>("me", {
      fields: "id,name",
      access_token: userToken,
    });
  }

  async permissions(userToken: string) {
    const response = await this.graph<{ data: MetaPermission[] }>("me/permissions", {
      access_token: userToken,
    });
    return response.data || [];
  }

  async pages(userToken: string) {
    const response = await this.graph<{ data: MetaPage[] }>("me/accounts", {
      fields: "id,name,category,access_token,tasks",
      limit: "200",
      access_token: userToken,
    });
    return response.data || [];
  }
}
