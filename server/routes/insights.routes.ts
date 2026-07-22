import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

router.get("/", async (req: any, res) => {
  const { startDate, endDate } = req.query;
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User session missing" });
    }

    // Get only the Facebook account IDs that belong to the current user
    const adAccounts = await prisma.adAccount.findMany({
      where: { userId },
      select: { fb_account_id: true }
    });
    const userAccountIds = adAccounts.map(a => a.fb_account_id);

    const data = await prisma.adInsight.findMany({
      where: {
        accountId: { in: userAccountIds },
        date: {
          gte: startDate as string,
          lte: endDate as string,
        }
      },
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