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
    mode: "skeleton";
    readOnly: true;
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
