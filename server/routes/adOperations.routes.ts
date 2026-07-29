import { Router } from "express";
import prisma from "../../db/index.js";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import {
  getCampaignsForUser,
  createPausedSalesDraft,
  verifyAccountOwnership,
} from "../services/meta-ads-management.service.js";

const router = Router();

// GET /api/ad-operations/accounts/:accountId/campaigns
router.get("/accounts/:accountId/campaigns", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "未登录" });
  }

  const accountId = String(req.params.accountId || "").trim();
  if (!accountId) {
    return res.status(400).json({ success: false, error: "缺少 accountId 参数" });
  }

  try {
    const campaigns = await getCampaignsForUser(userId, accountId);
    return res.json({ success: true, campaigns });
  } catch (error: any) {
    const status = error.message.includes("归属校验失败") || error.message.includes("无权访问") ? 403 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/ad-operations/drafts (严格限制只能创建 PAUSED 状态草稿)
router.post("/drafts", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "未登录" });
  }

  const { accountId, name, dailyBudget, targetCountry } = req.body;
  if (!accountId || !name || dailyBudget === undefined) {
    return res.status(400).json({ success: false, error: "缺少必要参数 (accountId, name, dailyBudget)" });
  }

  try {
    const result = await createPausedSalesDraft(userId, {
      accountId: String(accountId),
      name: String(name),
      dailyBudget: Number(dailyBudget),
      targetCountry: targetCountry ? String(targetCountry) : undefined,
    });

    return res.json(result);
  } catch (error: any) {
    const status = error.message.includes("归属校验失败") || error.message.includes("无权") ? 403 : 502;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// GET /api/ad-operations/actions (查看历史操作日志)
router.get("/actions", authenticateJWT as any, async (req: AuthenticatedRequest, res) => {
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
