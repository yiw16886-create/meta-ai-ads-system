import useSWR from "swr";
import {
  fetchPageCenterV2Access,
  type PageCenterV2Cohort,
} from "./api";

const ACCESS_KEY = "/api/page-center-v2/access";

export type PageCenterV2AccessState = {
  available: boolean;
  cohort: PageCenterV2Cohort;
  reason?: "global_disabled" | "not_allowlisted" | "allowlisted";
  isLoading: boolean;
};

export function usePageCenterV2Access(): PageCenterV2AccessState {
  const { data, isLoading } = useSWR(ACCESS_KEY, fetchPageCenterV2Access, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  return {
    available: data?.data.available === true,
    cohort: data?.data.cohort || "A",
    reason: data?.data.reason,
    isLoading,
  };
}
