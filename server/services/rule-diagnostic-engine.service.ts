// STEP 13-A-R2: rule-diagnostic-engine minimal skeleton
// Purpose: generate structured diagnostic issues only. No ChatGPT, no UI, no automatic Meta operations.

export type DiagnosticIssueSeverity = "critical" | "warning" | "info";
export type DiagnosticIssueLayer = "production" | "data_health_notice" | "debug_invalid";

export type DiagnosticActionVerb =
  | "bind_account"
  | "reduce_budget"
  | "increase_budget"
  | "pause"
  | "keep_observing"
  | "refresh_token"
  | "review_mapping"
  | "investigate_data_gap"
  | "exclude_country"
  | "open_detail"
  | "create_variant";

export interface DiagnosticIssueEvidence {
  source: string;
  metric?: string;
  value?: number | string | null;
  detail?: string;
}

export interface DiagnosticEntityRef {
  entityType: string;
  entityId: string;
  route?: string;
}

export interface DiagnosticIssue {
  id: string;
  layer: DiagnosticIssueLayer;
  severity: DiagnosticIssueSeverity;
  entityType: string;
  entityId: string;
  entityRefs: DiagnosticEntityRef[];
  actionVerb: DiagnosticActionVerb;
  actionTarget: string;
  title: string;
  reason: string;
  evidence: DiagnosticIssueEvidence[];
  route: string;
  humanConfirmationRequired: true;
  limitations: string[];
}

export interface GenerateDiagnosticIssuesParams {
  startDate?: string;
  endDate?: string;
  storeId?: string;
  accountId?: string;
  scope?: "account" | "store" | "creative" | "country" | "product" | "data_health" | "all";
}

export interface GenerateDiagnosticIssuesResult {
  issues: DiagnosticIssue[];
  summary: {
    engine: "rule-diagnostic-engine";
    generatedAt: string;
    issueCount: number;
    productionCount: number;
    dataHealthNoticeCount: number;
    debugInvalidCount: number;
    scope: GenerateDiagnosticIssuesParams["scope"];
    limitations: string[];
  };
}

const LEGAL_ACTION_VERBS: ReadonlySet<DiagnosticActionVerb> = new Set([
  "bind_account",
  "reduce_budget",
  "increase_budget",
  "pause",
  "keep_observing",
  "refresh_token",
  "review_mapping",
  "investigate_data_gap",
  "exclude_country",
  "open_detail",
  "create_variant",
]);

export async function generateDiagnosticIssues(
  params: GenerateDiagnosticIssuesParams = {},
): Promise<GenerateDiagnosticIssuesResult> {
  const scope = params.scope ?? "all";

  const detectedIssues = [
    ...(scope === "account" || scope === "all" ? await detectAccountIssues(params) : []),
    ...(scope === "store" || scope === "all" ? await detectStoreIssues(params) : []),
    ...(scope === "creative" || scope === "all" ? await detectCreativeIssues(params) : []),
    ...(scope === "country" || scope === "all" ? await detectCountryIssues(params) : []),
    ...(scope === "product" || scope === "all" ? await detectProductIssues(params) : []),
    ...(scope === "data_health" || scope === "all" ? await detectDataHealthIssues(params) : []),
  ];

  const issues = detectedIssues
    .map(validateIssueEligibility)
    .filter((issue): issue is DiagnosticIssue => issue !== null);

  return {
    issues,
    summary: {
      engine: "rule-diagnostic-engine",
      generatedAt: new Date().toISOString(),
      issueCount: issues.length,
      productionCount: issues.filter((issue) => issue.layer === "production").length,
      dataHealthNoticeCount: issues.filter((issue) => issue.layer === "data_health_notice").length,
      debugInvalidCount: issues.filter((issue) => issue.layer === "debug_invalid").length,
      scope,
      limitations: [
        "STEP 13-A-R2 minimal skeleton only; business detection rules are not enabled yet.",
        "No ChatGPT explanation layer is connected in this step.",
        "No automatic Meta account operation is allowed.",
      ],
    },
  };
}

export async function detectAccountIssues(
  _params: GenerateDiagnosticIssuesParams,
): Promise<DiagnosticIssue[]> {
  return [];
}

export async function detectStoreIssues(
  _params: GenerateDiagnosticIssuesParams,
): Promise<DiagnosticIssue[]> {
  return [];
}

export async function detectCreativeIssues(
  _params: GenerateDiagnosticIssuesParams,
): Promise<DiagnosticIssue[]> {
  return [];
}

export async function detectCountryIssues(
  _params: GenerateDiagnosticIssuesParams,
): Promise<DiagnosticIssue[]> {
  return [];
}

export async function detectProductIssues(
  _params: GenerateDiagnosticIssuesParams,
): Promise<DiagnosticIssue[]> {
  return [];
}

export async function detectDataHealthIssues(
  _params: GenerateDiagnosticIssuesParams,
): Promise<DiagnosticIssue[]> {
  return [];
}

export function validateIssueEligibility(issue: DiagnosticIssue): DiagnosticIssue | null {
  if (!issue.entityId || issue.entityId === "unknown" || issue.entityId === "free_text") {
    return null;
  }

  if (!issue.route || issue.entityRefs.length === 0 || issue.evidence.length === 0) {
    return null;
  }

  if (!LEGAL_ACTION_VERBS.has(issue.actionVerb)) {
    return null;
  }

  return issue;
}
