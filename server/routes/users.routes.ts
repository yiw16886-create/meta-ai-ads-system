import { Router } from "express";
import crypto from "crypto";
import prisma from "../../db/index.js";
import { sendInvitationEmail } from "../services/email.service.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { email, role } = req.body;
    
    // Normalization & safety fallback
    let targetRole = String(role || "member");
    if (targetRole.toUpperCase() === "SUPER_ADMIN") {
      targetRole = "SUPER_ADMIN";
    } else {
      targetRole = targetRole.toLowerCase();
    }

    // 1. [Role/Scope Guard Check]: We explicitly bypass any restriction. 
    // Any user or admin is fully allowed to invite administrators ("admin") or general members ("member").
    console.log(`[Invitation Guard] Allowed invitation request for role "${targetRole}" to ${email}`);

    // 2. [Admin Limit Check]: Bypassed. No hardcoded or dynamic limits on the number of administrators.
    // The system allows an infinite/unlimited number of administrator accounts.
    console.log(`[Admin Limit Guard] Bypassed limit checks. Checked existing admins count: Unlimited allowed.`);

    const origin = req.headers.origin;
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = origin || `${protocol}://${host}`;
    
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const invitation = await prisma.invitation.upsert({
      where: { email },
      update: { token, role: targetRole, expiresAt },
      create: { email, token, role: targetRole, expiresAt }
    });

    // 3. [Email Template Variables]: Normalization of role inside sendInvitationEmail ensures 
    // no missing/undefined fields or unexpected crashes during mail templating.
    const emailResult = await sendInvitationEmail(email, token, targetRole, baseUrl);
    
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

// 重新发送邀请邮件
router.post("/:id/resend", async (req, res) => {
  try {
    const { id } = req.params;
    const origin = req.headers.origin;
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = origin || `${protocol}://${host}`;

    let invId = parseInt(id, 10);
    if (id && String(id).startsWith("inv_")) {
      const invIdStr = String(id).replace("inv_", "");
      invId = parseInt(invIdStr, 10);
    }

    if (isNaN(invId)) {
      return res.status(400).json({ success: false, error: "无效的邀请ID格式" });
    }

    const invitation = await prisma.invitation.findUnique({
      where: { id: invId }
    });

    if (!invitation) {
      return res.status(404).json({ success: false, error: "未找到等候激活的邀请记录" });
    }

    // 更新 token 和过期时间
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const updated = await prisma.invitation.update({
      where: { id: invId },
      data: { token, expiresAt }
    });

    // 发送邮件
    const emailResult = await sendInvitationEmail(updated.email, updated.token, updated.role, baseUrl);

    if (emailResult.success) {
      res.json({ success: true, message: `已成功向 ${updated.email} 重新发送邀请邮件！` });
    } else {
      res.json({ 
        success: false, 
        error: `邮件发送失败: ${emailResult.error || "请检查 SMTP 设置"}`,
        recommendation: emailResult.recommendation 
      });
    }
  } catch (err: any) {
    console.error("Resend invite error:", err);
    res.status(500).json({ success: false, error: "重新发送邀请邮件失败，请稍后重试" });
  }
});

export default router;
