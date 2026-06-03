import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import prisma from "../db";
import { sendInvitationEmail } from "../services/email.service";

export class UsersController {
  static async createInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, role } = req.body;
      const origin = req.headers.origin;
      const host = req.get('host');
      const protocol = req.protocol;
      const baseUrl = origin || `${protocol}://${host}`;
      
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const invitation = await prisma.invitation.upsert({
        where: { email },
        update: { token, role, expiresAt },
        create: { email, token, role, expiresAt }
      });

      const emailResult = await sendInvitationEmail(email, token, role, baseUrl);
      
      res.json({ 
        success: true, 
        emailed: emailResult.success,
        emailError: emailResult.error,
        recommendation: emailResult.recommendation,
        data: { 
          id: invitation.id, 
          email: invitation.email, 
          role: invitation.role, 
          token: invitation.token 
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role } = req.body;
      const user = await prisma.user.update({
        where: { id: Number(req.params.id) },
        data: { role },
        select: { id: true, email: true, role: true }
      });
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  static async listUsersAndInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await prisma.user.findMany({ 
        select: { id: true, email: true, role: true, createdAt: true }
      });
      const invitations = await prisma.invitation.findMany({
        select: { id: true, email: true, role: true, createdAt: true, token: true }
      });
      
      const combined = [
        ...users.map(u => ({ ...u, status: "active" })),
        ...invitations.map(i => ({ ...i, id: `inv_${i.id}`, status: "pending" }))
      ];
      
      res.json({ success: true, data: combined });
    } catch (err) {
      next(err);
    }
  }

  static async deleteUserOrInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (id && String(id).startsWith("inv_")) {
        const invIdStr = String(id).replace("inv_", "");
        const invId = parseInt(invIdStr, 10);
        
        if (isNaN(invId)) {
          res.status(400).json({ success: false, error: "无效的邀请ID格式" });
          return;
        }
        
        await prisma.invitation.delete({ where: { id: invId } });
        res.json({ success: true, message: "已撤回邀请" });
        return;
      }

      const userId = parseInt(id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ success: false, error: "无效的用户ID格式" });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      
      if (!user) {
        res.status(404).json({ success: false, error: "用户不存在" });
        return;
      }

      await prisma.user.delete({ where: { id: userId } });
      res.json({ success: true, message: "用户已删除" });
    } catch (err) {
      next(err);
    }
  }
}
