import { Router } from "express";
import prisma from "../../db/index.js";
import { getProductIntelligence } from "../services/product-intelligence.service.js";
import { getCreativeIntelligence } from "../services/creative-intelligence.service.js";
import { attributePurchases } from "../services/attribution.service.js";
import { aggregateData } from "../services/aggregation.service.js";

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
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing dates" });
  try {
    // Return empty array since CreativePerformanceDaily is removed for re-development
    res.json([]);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch daily creative performance", details: error.message });
  }
});

router.post("/creatives/clear-metrics", async (req, res) => {
  try {
    // Return success immediately as table is now removed
    res.json({ success: true, message: "素材表现指标的所有数据已成功清除（底层数据表已彻底移除）" });
  } catch (error: any) {
    res.status(500).json({ error: "清除素材表现指标数据失败", details: error.message });
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
