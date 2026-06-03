import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user && await bcrypt.compare(password, user.password)) {
      res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
    } else {
      res.status(401).json({ success: false, error: "账户或密码错误" });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: "登录系统异常" });
  }
});

router.post("/verify-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token required" });
  try {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: "邀请失效或已过期" });
    }
    res.json({ success: true, data: { email: invitation.email, role: invitation.role } });
  } catch (e) {
    res.status(500).json({ error: "Token verification failed" });
  }
});

router.post("/register", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Missing data" });
  
  try {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: "邀请失效或已过期" });
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
  } catch (e) {
    console.error("Registration failed", e);
    res.status(500).json({ error: "注册失败" });
  }
});

export default router;
