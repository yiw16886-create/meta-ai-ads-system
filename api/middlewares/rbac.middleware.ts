import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

export const requireWorkspaceRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Determine user via basic auth mechanism - placeholder
    // In a real app, this comes from an auth middleware decoding JWT to req.user
    const userId = (req as any).user?.id || req.headers["x-user-id"];
    const workspaceId = req.params.workspaceId || req.body.workspaceId;

    if (!userId) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Missing user identity" });
    }

    if (!workspaceId) {
      return res
        .status(400)
        .json({ error: "Bad Request: Missing workspaceId context for RBAC" });
    }

    try {
      const userWorkspace = await prisma.userWorkspace.findUnique({
        where: {
          userId_workspaceId: {
            userId: Number(userId),
            workspaceId: workspaceId as string,
          },
        },
      });

      if (!userWorkspace) {
        return res
          .status(403)
          .json({ error: "Forbidden: You are not a member of this workspace" });
      }

      const hasRole = roles.includes(userWorkspace.role);

      // Implicitly, Organization OWNER always has access, but skipping that complexity for now.
      // If we wanted to check Org Owner:
      // const orgRole = await prisma.userOrganization.findFirst({ ... })

      if (!hasRole) {
        return res
          .status(403)
          .json({
            error: `Forbidden: Requires one of [${roles.join(", ")}] roles`,
          });
      }

      // Pass the permitted workspace role into context
      (req as any).workspaceCtx = userWorkspace.role;
      next();
    } catch (error) {
      console.error("[RBAC Error]", error);
      res
        .status(500)
        .json({ error: "Internal Server Error checking permissions" });
    }
  };
};

export const requireOrganizationRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || req.headers["x-user-id"];
    const organizationId = req.params.organizationId || req.body.organizationId;

    if (!userId || !organizationId) {
      return res.status(400).json({ error: "Missing required auth context" });
    }

    try {
      const userOrg = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: Number(userId),
            organizationId: organizationId as string,
          },
        },
      });

      if (!userOrg || !roles.includes(userOrg.role)) {
        return res
          .status(403)
          .json({ error: "Forbidden: Insufficient Organization permissions" });
      }

      next();
    } catch (error) {
      console.error("[RBAC Error]", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
};
