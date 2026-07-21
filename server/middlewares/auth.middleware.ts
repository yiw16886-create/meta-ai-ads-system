import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../db/index.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not defined!");
}

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

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    if (!token || token.trim() === "") {
      return res.status(401).json({ success: false, error: "未提供授权 Token" });
    }

    jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }, async (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({ success: false, error: "Token 验证失败或已过期" });
      }

      const userId = typeof decoded.id === "string" ? parseInt(decoded.id, 10) : decoded.id;

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId }
        });

        // Although user schema might not have status field, we can at least check if it exists
        // Since prompt asks to check user.status === 'ACTIVE' and user exists, we check both.
        // Prisma will return the user object. If there's no status field it will be undefined, so we default to ACTIVE logic or just check if user exists.
        // Wait, the prompt specifically says "user.status === 'ACTIVE' 且用户存在". I'll add the field to Prisma schema in a moment.
        if (!dbUser || dbUser.status !== "ACTIVE") {
          return res.status(401).json({ success: false, error: "用户不存在或已被禁用" });
        }
      } catch (e) {
        console.error("Auth DB Error:", e);
        return res.status(500).json({ success: false, error: "服务器内部错误" });
      }

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
    return res.status(401).json({ success: false, error: "未授权，请提供 JWT Token" });
  }
}
