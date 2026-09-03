import axios from "axios";

export type PageCenterV2Cohort = "A" | "B";

export type PageCenterV2AccessResponse = {
  success: true;
  data: {
    module: "page-center-v2";
    available: boolean;
    cohort: PageCenterV2Cohort;
    reason: "global_disabled" | "not_allowlisted" | "allowlisted";
  };
};

export type PageCenterV2Section = {
  id: "oauth" | "pages" | "tools";
  title: string;
  description: string;
  phase: number;
  status: "planned" | "ready";
};

export type PageCenterV2OverviewResponse = {
  success: true;
  data: {
    module: "page-center-v2";
    contractVersion: string;
    cohort: "B";
    mode: "tools";
    readOnly: false;
    sections: PageCenterV2Section[];
    capabilities: {
      connectOAuth: boolean;
      listPages: boolean;
      readPosts: boolean;
      publishPosts: boolean;
      manageComments: boolean;
    };
  };
};

export async function fetchPageCenterV2Access() {
  const response = await axios.get<PageCenterV2AccessResponse>(
    "/api/page-center-v2/access",
  );
  return response.data;
}

export type McpOAuthAuthorizationRequest = {
  id: string;
  clientName: string;
  scope: string[];
  resource: string;
  expiresAt: string;
};

export async function fetchMcpOAuthAuthorizationRequest(id: string) {
  const response = await axios.get<{ success: true; data: McpOAuthAuthorizationRequest }>(
    `/api/page-center-v2/oauth/requests/${encodeURIComponent(id)}`,
  );
  return response.data.data;
}

export async function decideMcpOAuthAuthorizationRequest(id: string, approved: boolean) {
  const response = await axios.post<{ success: true; data: { redirectUrl: string } }>(
    `/api/page-center-v2/oauth/requests/${encodeURIComponent(id)}/decision`,
    { approved },
  );
  return response.data.data.redirectUrl;
}

export async function fetchPageCenterV2Overview() {
  const response = await axios.get<PageCenterV2OverviewResponse>(
    "/api/page-center-v2/overview",
  );
  return response.data;
}

export type PageCenterReadiness = {
  ready: boolean;
  checks: Array<{
    id: string;
    label: string;
    ready: boolean;
    code: string;
  }>;
  externalChecks: Array<{
    id: string;
    label: string;
    status: "manual";
  }>;
};

export async function fetchPageCenterReadiness() {
  const response = await axios.get<{ success: true; data: PageCenterReadiness }>(
    "/api/page-center-v2/readiness",
  );
  return response.data.data;
}

export type PageCenterAuthorizedPage = {
  pageId: string;
  pageName: string;
  category: string | null;
  tasks: string[];
  canRead: boolean;
  canPublish: boolean;
  canManageComments: boolean;
  status: string;
  lastVerifiedAt: string | null;
};

export type PageCenterMetaStatus = {
  connected: boolean;
  facebookUserName: string | null;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
  pages: PageCenterAuthorizedPage[];
};

export async function fetchPageCenterMetaStatus() {
  const response = await axios.get<{ success: true; data: PageCenterMetaStatus }>(
    "/api/page-center-v2/meta/status",
  );
  return response.data.data;
}

export async function createPageCenterMetaConnection() {
  const response = await axios.post<{ success: true; data: { url: string } }>(
    "/api/page-center-v2/meta/connect",
  );
  return response.data.data.url;
}

export async function verifyPageCenterMetaConnection() {
  const response = await axios.post<{ success: true; data: PageCenterMetaStatus }>(
    "/api/page-center-v2/meta/verify",
  );
  return response.data.data;
}

export async function disconnectPageCenterMetaConnection() {
  await axios.post("/api/page-center-v2/meta/disconnect");
}
