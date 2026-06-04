import { Router } from "express";
import prisma from "../../db/index";
import axios from "axios";

const router = Router();
const shoplineCache = new Map<string, { data: any; expiry: number }>();

router.get("/", async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      include: { accounts: true },
    });
    res.json(stores);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch stores", details: error.message });
  }
});

router.post("/", async (req, res) => {
  const { id, name, shopline_token, shopify_token, domain, visitors, timezone } = req.body;
  try {
    if (id) {
      const updatedStore = await prisma.store.update({
        where: { id: parseInt(id, 10) },
        data: { 
          name, 
          shopline_token, 
          shopify_token, 
          domain,
          timezone: timezone || undefined,
          visitors: visitors !== undefined ? parseInt(visitors, 10) : undefined
        },
      });
      res.json(updatedStore);
    } else {
      const newStore = await prisma.store.create({
        data: { 
          name, 
          shopline_token, 
          shopify_token, 
          domain,
          timezone: timezone || "GMT+8",
          visitors: visitors !== undefined ? parseInt(visitors, 10) : 0
        },
      });
      res.json(newStore);
    }
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to save store", details: error.message });
  }
});

router.get("/all-dashboard-summary", async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const stores = await prisma.store.findMany();
    const result: Record<string, any> = {};

    let start = new Date();
    start.setDate(start.getDate() - 30);
    if (startDate && typeof startDate === "string") {
      start = new Date(startDate);
    }

    let end = new Date();
    if (endDate && typeof endDate === "string") {
      end = new Date(endDate + 'T23:59:59.999Z');
    }

    for (const store of stores) {
      const isConfigured = !!(store.shopify_token || store.shopline_token);
      
      const orders = await prisma.order.findMany({
        where: {
          storeId: store.id,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalSales = orders.reduce((sum, o) => sum + (o.revenue || 0), 0);
      const ordersCount = orders.length;

      result[store.name] = {
        isConfigured,
        totalSales,
        ordersCount,
        error: null,
      };
    }

    res.json(result);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch store summaries", details: error.message });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const isNumeric = !isNaN(parseInt(id, 10)) && /^\d+$/.test(id);
    let store;
    if (isNumeric) {
      store = await prisma.store.findUnique({
        where: { id: parseInt(id, 10) },
        include: { accounts: true },
      });
    } else {
      store = await prisma.store.findFirst({
        where: { name: { equals: id, mode: "insensitive" } },
        include: { accounts: true },
      });
    }

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }
    res.json(store);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch store" });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.store.delete({
      where: { id: parseInt(id, 10) },
    });
    res.json({ success: true });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to delete store", details: error.message });
  }
});

router.post("/:id/accounts", async (req, res) => {
  const { id } = req.params;
  const { fb_account_id, fb_account_name, fb_access_token } = req.body;

  try {
    const account = await prisma.adAccount.upsert({
      where: { fb_account_id },
      update: {
        fb_account_name,
        fb_access_token,
        storeId: parseInt(id, 10),
      },
      create: {
        fb_account_id,
        fb_account_name,
        fb_access_token,
        storeId: parseInt(id, 10),
      },
    });

    res.json(account);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to allocate account", details: error.message });
  }
});

router.delete("/:id/accounts/:accountId", async (req, res) => {
  const { accountId } = req.params;

  try {
    await prisma.adAccount.delete({
      where: { fb_account_id: accountId },
    });

    res.json({ success: true });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to remove account", details: error.message });
  }
});

export default router;
