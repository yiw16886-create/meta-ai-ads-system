import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db";

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      
      if (user && await bcrypt.compare(password, user.password)) {
        res.json({ 
          success: true, 
          user: { id: user.id, email: user.email, role: user.role } 
        });
      } else {
        res.status(401).json({ success: false, error: "账户或密码错误" });
      }
    } catch (error) {
      next(error);
    }
  }

  static async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ error: "Token required" });
        return;
      }
      
      const invitation = await prisma.invitation.findUnique({ where: { token } });
      if (!invitation || invitation.expiresAt < new Date()) {
        res.status(400).json({ error: "邀请失效或已过期" });
        return;
      }
      
      res.json({ 
        success: true, 
        data: { email: invitation.email, role: invitation.role } 
      });
    } catch (error) {
      next(error);
    }
  }

  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        res.status(400).json({ error: "Missing data" });
        return;
      }
      
      const invitation = await prisma.invitation.findUnique({ where: { token } });
      if (!invitation || invitation.expiresAt < new Date()) {
        res.status(400).json({ error: "邀请失效或已过期" });
        return;
      }

      const hashedPass = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.upsert({
        where: { email: invitation.email },
        update: { password: hashedPass, role: invitation.role },
        create: { email: invitation.email, password: hashedPass, role: invitation.role }
      });

      await prisma.invitation.delete({ where: { token } });

      res.json({ 
        success: true, 
        user: { id: user.id, email: user.email, role: user.role } 
      });
    } catch (error) {
      next(error);
    }
  }
}
