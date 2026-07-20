import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../db/index.js";
import { getJwtSecret } from "../security.js";

const JWT_SECRET = getJwtSecret();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role?: string;
    org_id?: string;
  };
}

export async function ensureUserOrganization(userId: number, email: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    if (user.org_id) return user.org_id;

    const org = await prisma.organization.create({
      data: { name: `个人团队_${email || user.email}` }
    });

    await prisma.user.update({
      where: { id: userId },
      data: { org_id: org.id }
    });
    return org.id;
  } catch (error) {
    console.error("Failed to ensure organization for user:", userId, error);
    return null;
  }
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Authorization requires a Bearer JWT" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ success: false, error: "Authorization requires a Bearer JWT" });
  }

  jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
    if (err || !decoded?.id) {
      return res.status(401).json({ success: false, error: "JWT validation failed or token expired" });
    }

    const userId = typeof decoded.id === "string" ? parseInt(decoded.id, 10) : decoded.id;
    if (!Number.isInteger(userId)) {
      return res.status(401).json({ success: false, error: "JWT does not contain a valid user identity" });
    }

    try {
      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!currentUser) {
        return res.status(401).json({ success: false, error: "JWT user no longer exists" });
      }

      const orgId = await ensureUserOrganization(userId, currentUser.email);
      req.user = {
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        org_id: orgId || undefined
      };
      next();
    } catch (error) {
      console.error("Failed to load the authenticated user:", error);
      return res.status(503).json({ success: false, error: "Authentication service is unavailable" });
    }
  });
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "SUPER_ADMIN" && req.user?.role !== "admin") {
    return res.status(403).json({ success: false, error: "Super administrator access is required" });
  }
  next();
}

export function temporarilyDisabled(_req: Request, res: Response) {
  return res.status(503).json({
    success: false,
    code: "SECURITY_LOCKDOWN",
    error: "This operation is temporarily disabled while its security controls are upgraded",
  });
}
