import { Router } from "express";
import crypto from "crypto";
import prisma from "../../db/index";
import { sendInvitationEmail } from "../services/email.service";

const router = Router();

router.post("/", async (req, res) => {
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
  } catch(err: any) {
    console.error("Invite error:", err);
    res.status(500).json({ success: false, error: "邀请失败，请稍后重试" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { role } = req.body;
    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: { role },
      select: { id: true, email: true, role: true }
    });
    res.json({ success: true, data: user });
  } catch(err: any) {
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
});

router.get("/", async (req, res) => {
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
  } catch (error: any) {
    console.error("Fetch users error:", error);
    res.status(500).json({ success: false, error: "加载成员列表失败: " + error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id && String(id).startsWith("inv_")) {
      const invIdStr = String(id).replace("inv_", "");
      const invId = parseInt(invIdStr, 10);
      
      if (isNaN(invId)) {
        return res.status(400).json({ success: false, error: "无效的邀请ID格式" });
      }
      
      const deleted = await prisma.invitation.delete({ where: { id: invId } });
      return res.json({ success: true, message: "已撤回邀请" });
    }

    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: "无效的用户ID格式" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ success: false, error: "用户不存在" });
    }

    // prevent deleting admin if only one admin left?
    // Not explicitly handled here before, but deleting logic is simple.
    await prisma.user.delete({ where: { id: userId } });
    res.json({ success: true, message: "用户已删除" });
  } catch (error: any) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, error: "删除用户失败系统异常" });
  }
});

export default router;
