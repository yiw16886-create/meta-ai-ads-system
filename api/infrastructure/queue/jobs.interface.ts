export interface SyncAccountJobPayload {
  accountId: string;
  token: string;
  startDate: string;
  endDate: string;
  userId?: string;
}

export interface AiDiagnosisJobPayload {
  accountId: string;
  triggerSource: "CRON" | "MANUAL" | "WEBHOOK";
  userId?: string;
}

export interface ReportGenerationJobPayload {
  accountId: string;
  reportType: string;
  dateStr: string;
}
