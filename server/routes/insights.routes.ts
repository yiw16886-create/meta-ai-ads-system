import { Router } from "express";
import prisma from "../../db/index.js";
import { isUserFacebookConnected } from "../utils.js";

const router = Router();

router.get("/", async (req: any, res) => {
  const { startDate, endDate } = req.query;
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User session missing" });
    }

    const connected = await isUserFacebookConnected(userId);
    if (!connected) {
      return res.json([]);
    }

    // Get Facebook account IDs assigned to this user, unassigned, or mapped
    const adAccounts = await prisma.adAccount.findMany({
      where: {
        OR: [
          { userId },
          { userId: null },
          ...(req.user?.org_id ? [{ user: { org_id: req.user.org_id } }] : [])
        ]
      },
      select: { fb_account_id: true }
    });

    const mappings = await prisma.accountMapping.findMany({
      select: { fbAccountId: true }
    });

    const accountSet = new Set<string>();
    adAccounts.forEach(a => {
      if (a.fb_account_id) {
        const clean = a.fb_account_id.replace("act_", "").trim();
        accountSet.add(clean);
        accountSet.add(`act_${clean}`);
      }
    });
    mappings.forEach(m => {
      if (m.fbAccountId) {
        const clean = m.fbAccountId.replace("act_", "").trim();
        accountSet.add(clean);
        accountSet.add(`act_${clean}`);
      }
    });

    const isSuperAdmin = req.user?.role === "SUPER_ADMIN";
    const whereClause: any = {};

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = String(startDate).slice(0, 10);
      if (endDate) whereClause.date.lte = String(endDate).slice(0, 10);
    }

    if (!isSuperAdmin && accountSet.size > 0) {
      whereClause.accountId = { in: Array.from(accountSet) };
    }

    const data = await prisma.adInsight.findMany({
      where: whereClause,
      orderBy: { date: "asc" }
    });

    res.json(data);
  } catch (error: any) {
    console.error("Fetch insights error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch data", details: error?.message });
  }
});

export default router;