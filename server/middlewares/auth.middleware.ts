import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../db/index.js";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

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
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return null;

    if (user.org_id) {
      return user.org_id;
    }

    // Auto-create organization for this user (Scenario A auto-backfill / self-heal)
    const orgName = `个人团队_${email || user.email}`;
    const org = await prisma.organization.create({
      data: {
        name: orgName
      }
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

  if (authHeader) {
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ success: false, error: "未提供授权 Token" });
    }

    jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
      if (err) {
        return res.status(403).json({ success: false, error: "Token 验证失败或已过期" });
      }

      const userId = typeof decoded.id === "string" ? parseInt(decoded.id, 10) : decoded.id;
      const email = decoded.email || "";
      const role = decoded.role || "member";

      const orgId = await ensureUserOrganization(userId, email);

      req.user = {
        id: userId,
        email: email,
        role: role,
        org_id: orgId || undefined
      };
      next();
    });
  } else {
    // If no authorization header, check if x-user-id is set (for compatibility with existing queries)
    const userIdStr = req.headers["x-user-id"] || req.query.userId;
    if (userIdStr) {
      const parsed = parseInt(String(userIdStr), 10);
      if (!isNaN(parsed)) {
        ensureUserOrganization(parsed, "").then((orgId) => {
          req.user = { id: parsed, email: "", role: "member", org_id: orgId || undefined };
          next();
        }).catch(() => {
          req.user = { id: parsed, email: "", role: "member" };
          next();
        });
        return;
      }
    }
    return res.status(401).json({ success: false, error: "未授权，请提供 JWT Token" });
  }
}
