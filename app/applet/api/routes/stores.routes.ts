import { Router } from "express";
import prisma from "../db.js";
import axios from "axios";
import { getMetaToken } from "../services/meta-hierarchy-sync.service.js"; // Note: might need to be exported / adjusted
import { getShoplineAnalytics } from "../services/store-sync.service.js";

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
