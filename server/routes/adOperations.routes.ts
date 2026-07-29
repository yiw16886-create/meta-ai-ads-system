import { Router } from "express";
import axios from "axios";
import prisma from "../../db/index.js";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { getMetaToken, cleanFbAccountId, extractMetaError } from "../utils.js";

const router = Router();

// POST /api/ad-operations/update-status
router.post("/update-status", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "未登录" });
  }

  const { objectType, objectId, status, accountId } = req.body;
  if (!objectType || !objectId || !status) {
    return res.status(400).json({ success: false, error: "缺少必要参数 (objectType, objectId, status)" });
  }

  const allowedTypes = ["campaign", "adset", "ad"];
  if (!allowedTypes.includes(objectType)) {
    return res.status(400).json({ success: false, error: "无效的对象类型" });
  }

  const allowedStatuses = ["ACTIVE", "PAUSED", "ARCHIVED"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: "无效的状态值" });
  }

  const cleanActId = accountId ? cleanFbAccountId(accountId) : null;
  const token = await getMetaToken(userId);
  if (!token) {
    return res.status(400).json({ success: false, error: "未查找到有效 Meta API Token" });
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { org_id: true },
  });

  try {
    const url = `https://graph.facebook.com/v19.0/${objectId}`;
    const response = await axios.post(
      url,
      { status, access_token: token },
      { timeout: 15000 }
    );

    if (response.data?.success) {
      if (objectType === "campaign") {
        await prisma.campaign.updateMany({
          where: { id: objectId },
          data: { status },
        }).catch(() => null);
      }

      await prisma.metaActionLog.create({
        data: {
          userId,
          orgId: actor?.org_id,
          action: `UPDATE_${objectType.toUpperCase()}_STATUS`,
          accountId: cleanActId,
          status: "SUCCESS",
          requestJson: { objectType, objectId, status },
          resultJson: response.data,
        },
      }).catch(() => null);

      return res.json({ success: true, message: `${objectType} 状态更新成功` });
    } else {
      throw new Error("Meta 未确认状态变更成功");
    }
  } catch (error: any) {
    const errMsg = extractMetaError(error);
    await prisma.metaActionLog.create({
      data: {
        userId,
        orgId: actor?.org_id,
        action: `UPDATE_${objectType.toUpperCase()}_STATUS`,
        accountId: cleanActId,
        status: "FAILED",
        requestJson: { objectType, objectId, status },
        errorMessage: errMsg,
      },
    }).catch(() => null);

    return res.status(502).json({ success: false, error: "Meta 接口响应失败", details: errMsg });
  }
});

// POST /api/ad-operations/update-budget
router.post("/update-budget", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "未登录" });
  }

  const { objectType, objectId, dailyBudget, accountId } = req.body;
  if (!objectType || !objectId || dailyBudget === undefined) {
    return res.status(400).json({ success: false, error: "缺少必要参数 (objectType, objectId, dailyBudget)" });
  }

  const cleanActId = accountId ? cleanFbAccountId(accountId) : null;
  const token = await getMetaToken(userId);
  if (!token) {
    return res.status(400).json({ success: false, error: "未查找到有效 Meta API Token" });
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { org_id: true },
  });

  const budgetInCents = Math.round(Number(dailyBudget) * 100);

  try {
    const url = `https://graph.facebook.com/v19.0/${objectId}`;
    const response = await axios.post(
      url,
      { daily_budget: budgetInCents, access_token: token },
      { timeout: 15000 }
    );

    if (response.data?.success) {
      await prisma.metaActionLog.create({
        data: {
          userId,
          orgId: actor?.org_id,
          action: `UPDATE_${objectType.toUpperCase()}_BUDGET`,
          accountId: cleanActId,
          status: "SUCCESS",
          requestJson: { objectType, objectId, dailyBudget },
          resultJson: response.data,
        },
      }).catch(() => null);

      return res.json({ success: true, message: `${objectType} 预算调整成功` });
    } else {
      throw new Error("Meta 未确认预算调整成功");
    }
  } catch (error: any) {
    const errMsg = extractMetaError(error);
    await prisma.metaActionLog.create({
      data: {
        userId,
        orgId: actor?.org_id,
        action: `UPDATE_${objectType.toUpperCase()}_BUDGET`,
        accountId: cleanActId,
        status: "FAILED",
        requestJson: { objectType, objectId, dailyBudget },
        errorMessage: errMsg,
      },
    }).catch(() => null);

    return res.status(502).json({ success: false, error: "Meta 预算更新接口响应失败", details: errMsg });
  }
});

// GET /api/ad-operations/logs
router.get("/logs", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "未登录" });
  }

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
  const skip = (page - 1) * limit;

  try {
    const [total, logs] = await Promise.all([
      prisma.metaActionLog.count({ where: { userId } }),
      prisma.metaActionLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return res.json({
      success: true,
      total,
      page,
      limit,
      logs,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "获取日志失败", details: error.message });
  }
});

export default router;
