import { Router, Response } from "express";
import crypto from "crypto";
import prisma from "../../db/index.js";
import { sendInvitationEmail } from "../services/email.service.js";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/auth.middleware.js";

const router = Router();

// 1. 邀请成员 (POST /api/users)
router.post("/", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUserRole = req.user?.role || "member";
    const currentOrgId = req.user?.org_id;

    if (!currentOrgId) {
      return res.status(400).json({ success: false, error: "用户企业组织信息缺失，请重新登录" });
    }
    
    // Member 角色不能邀请任何人
    if (currentUserRole.toLowerCase() === "member") {
      return res.status(403).json({ success: false, error: "权限不足，无法邀请成员" });
    }

    const { email, role } = req.body;
    
    // Normalization & safety fallback
    let targetRole = String(role || "member");
    if (targetRole.toUpperCase() === "SUPER_ADMIN" || targetRole === "Super Admin") {
      targetRole = "SUPER_ADMIN";
    } else if (targetRole.toLowerCase() === "admin") {
      targetRole = "admin";
    } else {
      targetRole = "member";
    }

    // 只有 SUPER_ADMIN 才能邀请超级管理员
    if (targetRole === "SUPER_ADMIN" && currentUserRole.toUpperCase() !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "非超级管理员无法邀请或创建超级管理员角色" });
    }

    console.log(`[Invitation Guard] Allowed invitation request for role "${targetRole}" to ${email} under org ${currentOrgId}`);

    const origin = req.headers.origin;
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = origin || `${protocol}://${host}`;
    
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const invitation = await prisma.invitation.upsert({
      where: { email },
      update: { token, role: targetRole, expiresAt, org_id: currentOrgId },
      create: { email, token, role: targetRole, expiresAt, org_id: currentOrgId }
    });

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

// 2. 修改角色 (PUT /api/users/:id)
router.put("/:id", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUserRole = req.user?.role || "member";
    const currentUserId = req.user?.id;
    const currentOrgId = req.user?.org_id;

    if (!currentOrgId) {
      return res.status(400).json({ success: false, error: "用户企业组织信息缺失，请重新登录" });
    }
    
    // Member 不能修改任何人的角色
    if (currentUserRole.toLowerCase() === "member") {
      return res.status(403).json({ success: false, error: "权限不足，无法修改成员角色" });
    }

    const targetUserId = Number(req.params.id);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ success: false, error: "无效的用户ID格式" });
    }

    // 寻找目标用户
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "目标用户不存在" });
    }

    // 校验企业组织隔离：无法更新非己公司/团队的人
    if (targetUser.org_id !== currentOrgId) {
      return res.status(403).json({ success: false, error: "无权操作其他公司/团队的成员" });
    }

    const targetUserRole = targetUser.role || "member";
    const isTargetSuper = targetUserRole.toUpperCase() === "SUPER_ADMIN" || targetUserRole === "Super Admin";
    const isCurrentSuper = currentUserRole.toUpperCase() === "SUPER_ADMIN" || currentUserRole === "Super Admin";

    // 严禁非超管操作超管用户
    if (isTargetSuper && !isCurrentSuper) {
      return res.status(403).json({ success: false, error: "无权操作超级管理员" });
    }

    const { role } = req.body;
    let newRole = String(role || "member");
    if (newRole.toUpperCase() === "SUPER_ADMIN" || newRole === "Super Admin") {
      newRole = "SUPER_ADMIN";
    } else if (newRole.toLowerCase() === "admin") {
      newRole = "admin";
    } else {
      newRole = "member";
    }

    // 严禁非超管分配超管角色
    if (newRole === "SUPER_ADMIN" && !isCurrentSuper) {
      return res.status(403).json({ success: false, error: "非超级管理员无法分配超级管理员角色" });
    }

    // 预防防呆：系统中该企业内必须保留至少一位超级管理员
    if (currentUserId === targetUserId && isTargetSuper && newRole !== "SUPER_ADMIN") {
      const superAdminsCount = await prisma.user.count({
        where: { 
          role: { in: ["SUPER_ADMIN", "Super Admin"] },
          org_id: currentOrgId
        }
      });
      if (superAdminsCount <= 1) {
        return res.status(400).json({ success: false, error: "企业组织内必须保留至少一位超级管理员" });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: { id: true, email: true, role: true }
    });

    res.json({ success: true, data: updatedUser });
  } catch(err: any) {
    console.error("Update user role error:", err);
    res.status(500).json({ success: false, error: "修改成员角色失败系统异常" });
  }
});

// Helper for listing users
const listUsersHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserRole = req.user?.role || "member";
    const isCurrentSuper = currentUserRole.toUpperCase() === "SUPER_ADMIN" || currentUserRole === "Super Admin";
    const currentOrgId = req.user?.org_id;

    if (!currentOrgId) {
      return res.status(400).json({ success: false, error: "用户企业组织信息缺失，请重新登录" });
    }

    // 金字塔隔离逻辑 + 企业组织物理隔离：强行隔离 org_id！
    let userWhereClause: any = {
      org_id: currentOrgId
    };
    let invitationWhereClause: any = {
      org_id: currentOrgId
    };

    if (!isCurrentSuper) {
      userWhereClause.role = {
        notIn: ["SUPER_ADMIN", "Super Admin"]
      };
      invitationWhereClause.role = {
        notIn: ["SUPER_ADMIN", "Super Admin"]
      };
    }

    const users = await prisma.user.findMany({ 
      where: userWhereClause,
      select: { id: true, email: true, role: true, createdAt: true }
    });

    const invitations = await prisma.invitation.findMany({
      where: invitationWhereClause,
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
};

// 3. 拉取用户列表 (GET /api/users & GET /api/users/list)
router.get("/", authenticateJWT as any, listUsersHandler);
router.get("/list", authenticateJWT as any, listUsersHandler);

// 4. 删除用户/邀请 (DELETE /api/users/:id)
router.delete("/:id", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUserRole = req.user?.role || "member";
    const currentOrgId = req.user?.org_id;

    if (!currentOrgId) {
      return res.status(400).json({ success: false, error: "用户企业组织信息缺失，请重新登录" });
    }
    
    // Member 不能删除任何成员/撤销邀请
    if (currentUserRole.toLowerCase() === "member") {
      return res.status(403).json({ success: false, error: "权限不足，无法移除成员" });
    }

    const { id } = req.params;
    const isCurrentSuper = currentUserRole.toUpperCase() === "SUPER_ADMIN" || currentUserRole === "Super Admin";
    
    // 处理撤销邀请
    if (id && String(id).startsWith("inv_")) {
      const invIdStr = String(id).replace("inv_", "");
      const invId = parseInt(invIdStr, 10);
      
      if (isNaN(invId)) {
        return res.status(400).json({ success: false, error: "无效的邀请ID格式" });
      }
      
      const invitation = await prisma.invitation.findUnique({ where: { id: invId } });
      if (!invitation) {
        return res.status(404).json({ success: false, error: "邀请记录不存在" });
      }

      // 校验企业组织隔离
      if (invitation.org_id !== currentOrgId) {
        return res.status(403).json({ success: false, error: "无权操作其他公司/团队的邀请" });
      }

      const isInvSuper = invitation.role.toUpperCase() === "SUPER_ADMIN" || invitation.role === "Super Admin";
      if (isInvSuper && !isCurrentSuper) {
        return res.status(403).json({ success: false, error: "无权操作超级管理员邀请" });
      }

      await prisma.invitation.delete({ where: { id: invId } });
      return res.json({ success: true, message: "已撤回邀请" });
    }

    // 处理正式成员删除
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: "无效的用户ID格式" });
    }

    // 严禁删除自身
    if (userId === req.user?.id) {
      return res.status(400).json({ success: false, error: "不能删除当前登录的账号自身" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ success: false, error: "用户不存在" });
    }

    // 校验企业组织隔离
    if (user.org_id !== currentOrgId) {
      return res.status(403).json({ success: false, error: "无权操作其他公司/团队的成员" });
    }

    const targetUserRole = user.role || "member";
    const isTargetSuper = targetUserRole.toUpperCase() === "SUPER_ADMIN" || targetUserRole === "Super Admin";

    // 严禁非超管删除超管用户
    if (isTargetSuper && !isCurrentSuper) {
      return res.status(403).json({ success: false, error: "无权操作超级管理员" });
    }

    await prisma.user.delete({ where: { id: userId } });
    res.json({ success: true, message: "用户已删除" });
  } catch (error: any) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, error: "删除用户失败系统异常" });
  }
});

// 5. 重新发送邀请邮件 (POST /api/users/:id/resend)
router.post("/:id/resend", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUserRole = req.user?.role || "member";
    const currentOrgId = req.user?.org_id;

    if (!currentOrgId) {
      return res.status(400).json({ success: false, error: "用户企业组织信息缺失，请重新登录" });
    }
    
    // Member 不能重发邀请
    if (currentUserRole.toLowerCase() === "member") {
      return res.status(403).json({ success: false, error: "权限不足，无法重发邀请" });
    }

    const { id } = req.params;
    const origin = req.headers.origin;
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = origin || `${protocol}://${host}`;
    const isCurrentSuper = currentUserRole.toUpperCase() === "SUPER_ADMIN" || currentUserRole === "Super Admin";

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

    // 校验企业组织隔离
    if (invitation.org_id !== currentOrgId) {
      return res.status(403).json({ success: false, error: "无权操作其他公司/团队的邀请" });
    }

    const isInvSuper = invitation.role.toUpperCase() === "SUPER_ADMIN" || invitation.role === "Super Admin";
    if (isInvSuper && !isCurrentSuper) {
      return res.status(403).json({ success: false, error: "无权操作超级管理员邀请" });
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
