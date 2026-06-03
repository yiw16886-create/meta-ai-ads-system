import { Router } from "express";
import prisma from "../db";
import { getProductIntelligence } from "../services/product-intelligence.service";
import { getCreativeIntelligence } from "../services/creative-intelligence.service";
import { attributePurchases } from "../services/attribution.service";
import { aggregateData } from "../services/aggregation.service";

const router = Router();

router.get("/products", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await getProductIntelligence(startDate as string, endDate as string);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch product intelligence", details: error.message });
  }
});

router.get("/creatives", async (req, res) => {
  const { startDate, endDate, storeFilter } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    const data = await getCreativeIntelligence(startDate as string, endDate as string, storeFilter as string);
    
    // Set headers for chunked streaming response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write('[\n');
    for (let i = 0; i < data.length; i++) {
      res.write(JSON.stringify(data[i]));
      if (i < data.length - 1) {
        res.write(',\n');
      }
    }
    res.write('\n]');
    res.end();
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch creative intelligence", details: error.message });
    } else {
      res.end();
    }
  }
});

router.get("/creatives/daily", async (req, res) => {
  const { startDate, endDate, storeFilter } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    let creativeIds: string[] | undefined = undefined;

    if (storeFilter && storeFilter !== 'all') {
      const isNum = !isNaN(Number(storeFilter));
      const store = await prisma.store.findFirst({
        where: isNum 
          ? { id: Number(storeFilter) } 
          : { name: { equals: storeFilter as string, mode: 'insensitive' } }
      });
      if (store) {
        const mappings = await prisma.accountMapping.findMany({
          where: { storeId: store.id },
          select: { fbAccountId: true }
        });
        const fbAccountIds = mappings.map(m => m.fbAccountId);
        const creatives = await prisma.adCreative.findMany({
          where: { fbAccountId: { in: fbAccountIds } },
          select: { creativeId: true }
        });
        creativeIds = creatives.map(c => c.creativeId);
      }
    }

    const data = await prisma.creativePerformanceDaily.findMany({
      where: {
        date: {
          gte: startDate as string,
          lte: endDate as string
        },
        ...(creativeIds ? { creativeId: { in: creativeIds } } : {})
      },
      orderBy: {
        date: "asc"
      }
    });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch daily creative performance", details: error.message });
  }
});

router.post("/aggregate", async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    await attributePurchases();
    const result = await aggregateData(startDate, endDate);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to aggregate intelligence", details: error.message });
  }
});

export default router;
