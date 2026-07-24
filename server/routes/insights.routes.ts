import { Router } from "express";
import prisma from "../../db/index.js";
import { isUserFacebookConnected } from "../utils.js";
import { runDiagnosticReport } from "../../scripts/diagnostic-report.js";

const router = Router();

// GET /api/insights/diagnostic-report
router.get("/diagnostic-report", async (req: any, res) => {
  try {
    const report = await runDiagnosticReport();
    return res.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error("Error generating diagnostic report:", error);
    return res.json({
      success: false,
      error: error?.message || "Failed to generate diagnostic report"
    });
  }
});

// POST /api/insights/cleanup-duplicates
router.post("/cleanup-duplicates", async (req: any, res) => {
  try {
    // Delete duplicate rows keeping the one with the maximum ID
    const deleteResult: any = await prisma.$executeRaw`
      DELETE FROM "AdInsight" a
      USING "AdInsight" b
      WHERE a."accountId" = b."accountId"
        AND a.date = b.date
        AND a.id < b.id;
    `;
    return res.json({
      success: true,
      deletedCount: deleteResult,
      message: `Cleaned up ${deleteResult} duplicate row(s) from AdInsight table.`
    });
  } catch (error: any) {
    console.error("Error cleaning up duplicate insights:", error);
    return res.json({
      success: false,
      error: error?.message || "Failed to cleanup duplicate insights"
    });
  }
});

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

    // Get Facebook account IDs assigned strictly to this user
    const adAccounts = await prisma.adAccount.findMany({
      where: { userId: Number(userId) },
      select: { fb_account_id: true }
    });

    const mappings = await prisma.accountMapping.findMany({
      where: { userId: Number(userId) },
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
    if (!isSuperAdmin && accountSet.size === 0) {
      return res.json([]);
    }

    const whereClause: any = {};

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = String(startDate).slice(0, 10);
      if (endDate) whereClause.date.lte = String(endDate).slice(0, 10);
    }

    if (!isSuperAdmin) {
      whereClause.accountId = { in: Array.from(accountSet) };
    }

    const data = await prisma.adInsight.findMany({
      where: whereClause,
      orderBy: { date: "asc" }
    });

    res.json(data);
  } catch (error: any) {
    console.error("Fetch insights error:", error);
    res.json([]);
  }
});

export default router;