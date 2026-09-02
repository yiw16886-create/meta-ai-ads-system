export type PageCenterV2Actor = {
  id: number;
  email: string;
  role?: string;
  org_id?: string;
};

export type PageCenterV2Environment = {
  PAGE_CENTER_V2_ENABLED?: string;
  PAGE_CENTER_V2_ALLOWLIST?: string;
};

export type PageCenterV2AccessDecision = {
  moduleEnabled: boolean;
  available: boolean;
  cohort: "A" | "B";
  reason: "global_disabled" | "unauthenticated" | "not_allowlisted" | "allowlisted";
};

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnabled(value: string | undefined) {
  return ENABLED_VALUES.has((value || "").trim().toLowerCase());
}

function parseAllowlist(value: string | undefined) {
  return new Set(
    (value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function actorAllowlistKeys(actor: PageCenterV2Actor) {
  const id = String(actor.id);
  const email = actor.email.trim().toLowerCase();

  return [id, `id:${id}`, email, `email:${email}`];
}

export function evaluatePageCenterV2Access(
  actor: PageCenterV2Actor | undefined,
  environment: PageCenterV2Environment = process.env,
): PageCenterV2AccessDecision {
  const moduleEnabled = isEnabled(environment.PAGE_CENTER_V2_ENABLED);

  if (!moduleEnabled) {
    return {
      moduleEnabled,
      available: false,
      cohort: "A",
      reason: "global_disabled",
    };
  }

  if (!actor) {
    return {
      moduleEnabled,
      available: false,
      cohort: "A",
      reason: "unauthenticated",
    };
  }

  const allowlist = parseAllowlist(environment.PAGE_CENTER_V2_ALLOWLIST);
  const allowlisted = actorAllowlistKeys(actor).some((key) => allowlist.has(key));

  if (!allowlisted) {
    return {
      moduleEnabled,
      available: false,
      cohort: "A",
      reason: "not_allowlisted",
    };
  }

  return {
    moduleEnabled,
    available: true,
    cohort: "B",
    reason: "allowlisted",
  };
}
