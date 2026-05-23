import { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { AuditService } from "../services/saas/audit.service.js";
import { SaaSContextService } from "../services/saas/usage.service.js";

export class SaaSController {
  /**
   * Example endpoint showing RBAC and Audit Logging in action
   */
  static async updateAdAccountBudget(req: Request, res: Response) {
    const { workspaceId, accountId } = req.params;
    const { newDailyBudget } = req.body;
    const userId = Number((req as any).user?.id || req.headers["x-user-id"]);

    try {
      // 1. We assume requireWorkspaceRole(['ADMIN', 'OPERATOR']) is handled by Middleware

      // 2. Fetch context
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { organizationId: true },
      });

      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      // 3. Feature Flag check (e.g. requires PRO tier to sync budgets directly)
      const canUpdate = await SaaSContextService.isFeatureEnabled(
        workspace.organizationId,
        "ADVANCED_REPORTING",
      );
      if (!canUpdate) {
        return res
          .status(402)
          .json({ error: "Payment Required: Please upgrade to PRO" });
      }

      // 4. Do the actual Meta API Update (Placeholder)
      console.log(
        `[Meta API] Updating Budget for ${accountId} to $${newDailyBudget}`,
      );

      // 5. Add to Audit Log securely
      await AuditService.logAction({
        organizationId: workspace.organizationId,
        userId: userId,
        action: "UPDATE_AD_ACCOUNT_BUDGET",
        resourceType: "AD_ACCOUNT",
        resourceId: accountId,
        details: { newDailyBudget },
      });

      res
        .status(200)
        .json({ success: true, message: "Budget updated and audited" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async getWorkspacesByUser(req: Request, res: Response) {
    const userId = Number((req as any).user?.id || req.headers["x-user-id"]);
    try {
      const workspaces = await prisma.userWorkspace.findMany({
        where: { userId },
        include: { workspace: true },
      });
      res.status(200).json({ data: workspaces });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
}
