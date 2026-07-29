import { Router } from "express";
import prisma from "../../db/index.js";
import { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { getMetaToken } from "../utils.js";
import {
  createPausedSalesDraft,
  listCampaigns,
  type DraftAdInput,
} from "../services/meta-ads-management.service.js";

const router = Router();

function cleanAccountId(value: unknown) {
  return String(value || "").replace(/^act_/, "").trim();
}

function isAdmin(role?: string) {
  const normalized = String(role || "").toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPER_ADMIN";
}

async function getActor(req: AuthenticatedRequest) {
  if (!req.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, role: true, org_id: true, status: true },
  });
}

async function canAccessAccount(req: AuthenticatedRequest, accountId: string, role?: string) {
  if (String(role || "").toUpperCase() === "SUPER_ADMIN") return true;
  if (!req.user?.id) return false;
  const variants = [accountId, `act_${accountId}`];
  const [account, mapping] = await Promise.all([
    prisma.adAccount.findFirst({
      where: { userId: req.user.id, fb_account_id: { in: variants } },
      select: { id: true },
    }),
    prisma.accountMapping.findFirst({
      where: { userId: req.user.id, fbAccountId: { in: variants } },
      select: { id: true },
    }),
  ]);
  return Boolean(account || mapping);
}

function validateDraft(body: Partial<DraftAdInput>) {
  const required: Array<keyof DraftAdInput> = [
    "accountId", "campaignName", "adSetName", "adName", "dailyBudget",
    "countries", "pixelId", "pageId", "landingUrl", "imageUrl",
    "primaryText", "headline",
  ];
  const missing = required.filter((key) => {
    const value = body[key];
    return value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
  });
  if (missing.length) return `缺少必要字段：${missing.join(", ")}`;
  if (!Number.isFinite(Number(body.dailyBudget)) || Number(body.dailyBudget) <= 0) {
    return "单日预算必须大于 0";
  }
  const ageMin = Number(body.ageMin);
  const ageMax = Number(body.ageMax);
  if (ageMin < 18 || ageMax > 65 || ageMin > ageMax) {
    return "年龄范围必须在 18–65 岁之间";
  }
  try {
    const landing = new URL(String(body.landingUrl));
    const image = new URL(String(body.imageUrl));
    if (landing.protocol !== "https:" || image.protocol !== "https:") {
      return "落地页和素材链接必须使用 HTTPS";
    }
  } catch {
    return "落地页或素材链接格式无效";
  }
  return null;
}

router.get("/accounts/:accountId/campaigns", async (req: AuthenticatedRequest, res) => {
  const accountId = cleanAccountId(req.params.accountId);
  const actor = await getActor(req);
  if (!actor || actor.status !== "ACTIVE" || !accountId || !(await canAccessAccount(req, accountId, actor.role))) {
    return res.status(403).json({ success: false, error: "无权访问该广告账户" });
  }
  const token = await getMetaToken(req.user?.id);
  if (!token) return res.status(400).json({ success: false, error: "请先绑定 Meta 账户" });
  try {
    const campaigns = await listCampaigns(accountId, token);
    return res.json({ success: true, campaigns });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/drafts", async (req: AuthenticatedRequest, res) => {
  const actor = await getActor(req);
  if (!actor || actor.status !== "ACTIVE" || !isAdmin(actor.role)) {
    return res.status(403).json({ success: false, error: "仅管理员可创建广告草稿" });
  }
  const input = req.body as DraftAdInput;
  input.accountId = cleanAccountId(input.accountId);
  input.ageMin = Number(input.ageMin);
  input.ageMax = Number(input.ageMax);
  input.dailyBudget = Number(input.dailyBudget);
  input.countries = Array.isArray(input.countries) ? input.countries : [];
  const validationError = validateDraft(input);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }
  if (!(await canAccessAccount(req, input.accountId, actor.role))) {
    return res.status(403).json({ success: false, error: "无权操作该广告账户" });
  }
  const token = await getMetaToken(req.user?.id);
  if (!token) return res.status(400).json({ success: false, error: "请先绑定 Meta 账户" });

  try {
    const result = await createPausedSalesDraft(input, token);
    await prisma.metaActionLog.create({
      data: {
        userId: actor.id,
        orgId: actor.org_id,
        action: "CREATE_PAUSED_SALES_DRAFT",
        accountId: input.accountId,
        status: "SUCCESS",
        requestJson: input,
        resultJson: result,
      },
    }).catch((auditError: any) => {
      console.error("[Ad Operations] Failed to write success audit log:", auditError.message);
    });
    return res.json({ success: true, result });
  } catch (error: any) {
    await prisma.metaActionLog.create({
      data: {
        userId: actor.id,
        orgId: actor.org_id,
        action: "CREATE_PAUSED_SALES_DRAFT",
        accountId: input.accountId,
        status: "FAILED",
        requestJson: input,
        errorMessage: error.message,
      },
    }).catch(() => null);
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.get("/actions", async (req: AuthenticatedRequest, res) => {
  const actor = await getActor(req);
  if (!actor || actor.status !== "ACTIVE") {
    return res.status(401).json({ success: false, error: "用户不存在或已被禁用" });
  }
  const where = String(actor.role || "").toUpperCase() === "SUPER_ADMIN"
    ? { orgId: actor.org_id || undefined }
    : { userId: actor.id };
  const actions = await prisma.metaActionLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return res.json({ success: true, actions });
});

export default router;
