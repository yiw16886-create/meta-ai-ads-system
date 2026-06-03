import { Router } from "express";
import prisma from "../db";

const router = Router();

router.get("/", async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await prisma.adInsight.findMany({
      where: {
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