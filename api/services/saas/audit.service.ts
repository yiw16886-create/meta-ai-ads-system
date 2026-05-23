import { prisma } from "../../db/prisma.js";

export class AuditService {
  /**
   * Enterprise Audit Logging
   * Securely append an immutable record of user actions for compliance.
   */
  static async logAction(params: {
    organizationId: string;
    userId: number;
    action: string;
    resourceType: "AD_ACCOUNT" | "WORKSPACE" | "STORE" | "BILLING";
    resourceId?: string;
    details?: any; // JSON object representing before/after states or context
  }) {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          details: params.details ? JSON.stringify(params.details) : undefined,
        },
      });
    } catch (e: any) {
      console.error(
        "[Audit Service Error] Failed to write audit log:",
        e.message,
      );
      // In a true critical Enterprise system, throwing here might be required.
      // We log and swallow to prevent blocking the main operation.
    }
  }
}
