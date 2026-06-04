import { Router } from "express";
import prisma from "../../db/index.js";
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
  const { id, name, platform, shopline_token, shopify_token, shoplazza_token, domain, visitors, timezone } = req.body;
  try {
    if (id) {
      const updatedStore = await prisma.store.update({
        where: { id: parseInt(id, 10) },
        data: { 
          name, 
          platform: platform || "shopline",
          shopline_token, 
          shopify_token, 
          shoplazza_token,
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
          platform: platform || "shopline",
          shopline_token, 
          shopify_token, 
          shoplazza_token,
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
      const isConfigured = !!(store.shopify_token || store.shopline_token || store.shoplazza_token);
      
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

router.get("/:id/dashboard-summary", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

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

    let start = new Date();
    start.setDate(start.getDate() - 30);
    if (startDate && typeof startDate === "string") {
      start = new Date(startDate);
    }

    let end = new Date();
    if (endDate && typeof endDate === "string") {
      end = new Date(endDate + 'T23:59:59.999Z');
    }
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    const accountIds = store.accounts.map(a => a.fb_account_id);
    const adInsights = await prisma.adInsight.findMany({
      where: {
        accountId: { in: accountIds },
        date: {
          gte: startStr,
          lte: endStr,
        },
      }
    });

    const totalSales = orders.reduce((sum, o) => sum + (o.revenue || 0), 0);
    const totalOrders = orders.length;
    const totalSpend = adInsights.reduce((sum, ad) => sum + (ad.spend || 0), 0);
    
    // totalROAS
    const totalROAS = totalSpend > 0 ? (totalSales / totalSpend) : 0;
    
    // visitors handling (just based on store total visitors, or average? We'll approximate for now or just return store.visitors)
    const totalVisitors = store.visitors || 0;
    
    // avgConversionRate
    const avgConversionRate = totalVisitors > 0 ? ((totalOrders / totalVisitors) * 100) : 0;

    res.json({
      summary: {
        totalSpend,
        totalROAS,
        totalSales,
        totalOrders,
        totalVisitors,
        avgConversionRate,
      },
      shopline: {
        isConfigured: !!(store.shopline_token || store.shopify_token || store.shoplazza_token),
        error: null,
        errorMessage: "",
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch dashboard summary", details: error.message });
  }
});

router.post("/test-shoplazza-connection", async (req, res) => {
  const { domain, token } = req.body;
  if (!domain || !token) {
    return res.status(400).json({ error: "域名 (domain) 和授权秘钥 (Access-Token) 不能为空" });
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = {
    'Access-Token': token,
    'Content-Type': 'application/json'
  };

  // Define plausible Shoplazza OpenAPI paths for product query to try
  const candidateUrls = [
    `https://${cleanDomain}/openapi/2022-01/products?limit=10`,
    `https://${cleanDomain}/openapi/2020-01/products?limit=10`,
    `https://${cleanDomain}/openapi/2022-01/products.json?limit=10`,
    `https://${cleanDomain}/openapi/2020-01/products.json?limit=10`
  ];

  let lastError: any = null;
  let successfulResponse: any = null;
  let chosenUrl = "";

  for (const url of candidateUrls) {
    console.log(`[Shoplazza Test HTTP] Trying candidate URL: ${url}`);
    try {
      const response = await axios.get(url, { headers, timeout: 8000 });
      if (response.status === 200 && response.data) {
        successfulResponse = response;
        chosenUrl = url;
        break; // Working endpoint found!
      }
    } catch (error: any) {
      console.warn(`[Shoplazza Test HTTP] Failed candidate URL: ${url}. Status/Error: ${error.response?.status || error.message}`);
      lastError = error;
    }
  }

  if (successfulResponse) {
    const products = successfulResponse.data.products || successfulResponse.data.data || [];
    
    const fetchedList = products.map((p: any) => ({
      id: p.id,
      title: p.title,
      vendor: p.vendor || "",
      product_type: p.product_type || "Uncategorized",
      sku: p.variants?.[0]?.sku || "",
      price: p.variants?.[0]?.price || "0.00",
      inventory: p.variants?.[0]?.inventory_quantity ?? 0,
      image: p.images?.[0]?.src || null,
      created_at: p.created_at,
    }));

    const pathOnly = chosenUrl.replace(`https://${cleanDomain}`, "");
    return res.json({
      success: true,
      message: `成功通过接口 "${pathOnly}" 联通店匠 API 并获取到 ${fetchedList.length} 个商品！`,
      products: fetchedList,
      api_path_used: chosenUrl,
    });
  } else {
    console.error(`[Shoplazza Test HTTP Error] All candidates failed.`);
    const errorDetails = lastError?.response?.data 
      ? typeof lastError.response.data === "object" ? JSON.stringify(lastError.response.data) : String(lastError.response.data)
      : lastError?.message || "网络请求失败";
    return res.status(500).json({
      success: false,
      error: `无法与 Shoplazza API 通信，已重试多个 OpenAPI 路径格式。`,
      details: `最近一次错误: ${errorDetails}`,
    });
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
