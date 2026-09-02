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
  status: "planned";
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

export async function fetchPageCenterV2Overview() {
  const response = await axios.get<PageCenterV2OverviewResponse>(
    "/api/page-center-v2/overview",
  );
  return response.data;
}
