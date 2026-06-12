import { Router } from "express";
import prisma from "../../db/index.js";
import axios from "axios";
import { getTimezoneOffsetStr, mapOffsetToIana } from "../utils.js";

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

function getOffsetByIana(ianaName: string): string {
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaName,
      timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    if (offsetPart) {
      const val = offsetPart.value; // e.g. "GMT-05:00", "GMT+08:00", "GMT"
      if (val === "GMT") return "UTC";
      if (val.startsWith("GMT")) {
        let off = val.replace("GMT", "");
        const match = off.match(/([+-])(\d+):(\d+)/);
        if (match) {
          const sign = match[1];
          const hrs = parseInt(match[2], 10);
          const mins = parseInt(match[3], 10);
          if (mins === 0) {
            return `GMT${sign}${hrs}`;
          } else {
            return `GMT${sign}${hrs}:${mins}`;
          }
        }
      }
    }
  } catch (e: any) {
    console.error("[Tz Detection] Error formatting timezone using Intl", e.message);
  }
  return "GMT+8";
}

async function detectStoreTimezone(
  platform: string,
  domain: string,
  token: string,
  existingTimezone?: string | null
): Promise<{ timezone: string; isFallback: boolean }> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");

  // 1. Shoplazza API
  if (platform === "shoplazza") {
    const candidateUrls = [
      `https://${cleanDomain}/openapi/2022-01/shop`,
      `https://${cleanDomain}/openapi/2020-01/shop`,
      `https://${cleanDomain}/openapi/2022-01/shop.json`,
      `https://${cleanDomain}/openapi/2020-01/shop.json`,
    ];

    for (const url of candidateUrls) {
      try {
        const response = await axios.get(url, {
          headers: {
            'Access-Token': token,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        const shopTz = response.data?.shop?.timezone;
        if (shopTz) {
          console.log(`[Tz Detection] Found Shoplazza timezone: ${shopTz}`);
          return { timezone: mapOffsetToIana(shopTz), isFallback: false };
        }
      } catch (e: any) {
        // quiet continue
      }
    }
  }

  // 2. Shopify API
  if (platform === "shopify") {
    try {
      const response = await axios.get(`https://${cleanDomain}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      const ianaTz = response.data?.shop?.iana_timezone;
      if (ianaTz && ianaTz.includes("/")) {
        return { timezone: ianaTz, isFallback: false };
      }
      const tzExpr = response.data?.shop?.timezone;
      if (tzExpr) {
        return { timezone: mapOffsetToIana(tzExpr), isFallback: false };
      }
    } catch (e: any) {
      console.warn(`[Tz Detection] Shopify Shop API failed:`, e.message);
    }
  }

  // 3. Shopline API
  if (platform === "shopline") {
    try {
      const response = await axios.get(`https://${cleanDomain}/admin/openapi/v20240301/shop.json`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      const shopTz = response.data?.data?.timezone || response.data?.shop?.timezone;
      if (shopTz) {
        return { timezone: mapOffsetToIana(shopTz), isFallback: false };
      }
    } catch (e: any) {
      try {
        const response = await axios.get(`https://${cleanDomain}/admin/openapi/v20220101/shop.json`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        const shopTz = response.data?.data?.timezone || response.data?.shop?.timezone;
        if (shopTz) {
          return { timezone: mapOffsetToIana(shopTz), isFallback: false };
        }
      } catch (e2) {
        console.warn(`[Tz Detection] Shopline Shop API failed:`, e.message);
      }
    }
  }

  // 4. Fallback: Try order matching logic
  try {
    let orders: any[] = [];
    if (platform === "shopify") {
      const response = await axios.get(`https://${cleanDomain}/admin/api/2024-01/orders.json?limit=1`, {
        headers: { 'X-Shopify-Access-Token': token },
        timeout: 5000
      });
      orders = response.data?.orders || [];
    } else if (platform === "shopline") {
      const response = await axios.get(`https://${cleanDomain}/admin/openapi/v20240301/orders.json?limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 5000
      });
      orders = response.data?.data || response.data?.orders || [];
    } else if (platform === "shoplazza") {
      const response = await axios.get(`https://${cleanDomain}/openapi/2022-01/orders?limit=1`, {
        headers: { 'Access-Token': token },
        timeout: 5000
      });
      orders = response.data?.orders || [];
    }

    if (orders && orders.length > 0) {
      const firstOrder = orders[0];
      const stamp = firstOrder.created_at || firstOrder.updated_at || firstOrder.processed_at;
      if (stamp && typeof stamp === "string") {
        console.log(`[Tz Detection] Found timezone from fallback orders inspect: ${stamp}`);
        return { timezone: mapOffsetToIana(stamp), isFallback: false };
      }
    }
  } catch (e: any) {
    console.warn(`[Tz Detection] Orders inspect failed:`, e.message);
  }

  // 5. Fallback to existing timezone
  if (existingTimezone && existingTimezone.includes("/")) {
    return { timezone: existingTimezone, isFallback: true };
  }

  // 6. Last resort default standard compliant
  console.warn(`[Tz Detection] All methods failed. Defaulting with risk warning to America/Los_Angeles.`);
  return { timezone: "America/Los_Angeles", isFallback: true };
}

router.post("/", async (req, res) => {
  const { id, name, platform, shopline_token, shopify_token, shoplazza_token, domain, visitors, timezone } = req.body;
  try {
    let resolvedTimezone = "America/Los_Angeles";
    let isFallback = false;
    const actualPlatform = platform || "shopline";
    const token = actualPlatform === "shopify" ? shopify_token : (actualPlatform === "shoplazza" ? shoplazza_token : shopline_token);

    if (token && domain) {
      let existingTz = "America/Los_Angeles";
      if (id) {
        const existing = await prisma.store.findUnique({ where: { id: parseInt(id, 10) } });
        existingTz = existing?.timezone || "America/Los_Angeles";
      }
      const tzResult = await detectStoreTimezone(actualPlatform, domain, token, existingTz);
      resolvedTimezone = tzResult.timezone;
      isFallback = tzResult.isFallback;
    } else if (timezone) {
      resolvedTimezone = mapOffsetToIana(timezone);
      isFallback = false;
    } else if (id) {
      const existing = await prisma.store.findUnique({ where: { id: parseInt(id, 10) } });
      resolvedTimezone = existing?.timezone || "America/Los_Angeles";
      isFallback = existing?.timezone_fallback_warning || false;
    }

    if (id) {
      const updatedStore = await prisma.store.update({
        where: { id: parseInt(id, 10) },
        data: { 
          name, 
          platform: actualPlatform,
          shopline_token, 
          shopify_token, 
          shoplazza_token,
          domain,
          timezone: resolvedTimezone,
          timezone_fallback_warning: isFallback,
          visitors: visitors !== undefined ? parseInt(visitors, 10) : undefined
        },
      });
      res.json(updatedStore);
    } else {
      const newStore = await prisma.store.create({
        data: { 
          name, 
          platform: actualPlatform,
          shopline_token, 
          shopify_token, 
          shoplazza_token,
          domain,
          timezone: resolvedTimezone,
          timezone_fallback_warning: isFallback,
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

    for (const store of stores) {
      const isConfigured = !!(store.shopify_token || store.shopline_token || store.shoplazza_token);
      
      const tzOffset = getTimezoneOffsetStr(store.timezone);

      let storeStart = new Date();
      storeStart.setDate(storeStart.getDate() - 30);
      if (startDate && typeof startDate === "string") {
        storeStart = new Date(`${startDate}T00:00:00${tzOffset}`);
      }

      let storeEnd = new Date();
      if (endDate && typeof endDate === "string") {
        storeEnd = new Date(`${endDate}T23:59:59.999${tzOffset}`);
      }

      const orders = await prisma.order.findMany({
        where: {
          storeId: store.id,
          OR: [
            {
              createdAt: {
                gte: storeStart,
                lte: storeEnd,
              },
            },
            {
              refunded: true,
              OR: [
                {
                  refundedAt: {
                    gte: storeStart,
                    lte: storeEnd,
                  },
                },
                {
                  refundedAt: null,
                  createdAt: {
                    gte: storeStart,
                    lte: storeEnd,
                  },
                },
              ],
            },
          ],
        },
      });

      const ordersForSales = orders.filter(
        (o) => o.createdAt >= storeStart && o.createdAt <= storeEnd
      );

      const ordersForRefunds = orders.filter(
        (o) =>
          o.refunded &&
          ((o.refundedAt && o.refundedAt >= storeStart && o.refundedAt <= storeEnd) ||
            (!o.refundedAt && o.createdAt >= storeStart && o.createdAt <= storeEnd))
      );

      let totalSales = 0;
      let ordersCount = 0;
      let totalRefunded = 0;

      if (store.platform === "shoplazza") {
        const seenOrderIds = new Set();
        for (const o of ordersForSales) {
          const uniqueKey = o.orderId || o.createdAt.toISOString();
          if (!seenOrderIds.has(uniqueKey)) {
            seenOrderIds.add(uniqueKey);
            ordersCount++;
            totalSales += (o.orderTotal != null && o.orderTotal > 0) ? o.orderTotal : (o.revenue || 0);
          }
        }

        const seenRefundOrderIds = new Set();
        for (const o of ordersForRefunds) {
          const uniqueKey = o.orderId || o.createdAt.toISOString();
          if (!seenRefundOrderIds.has(uniqueKey)) {
            seenRefundOrderIds.add(uniqueKey);
            totalRefunded += (o.orderTotal != null && o.orderTotal > 0) ? o.orderTotal : (o.revenue || 0);
          }
        }
      } else {
        const seenOrderIds = new Set();
        for (const o of ordersForSales) {
          const uniqueKey = o.orderId || o.createdAt.toISOString();
          if (!seenOrderIds.has(uniqueKey)) {
            seenOrderIds.add(uniqueKey);
            ordersCount++;
            if (o.orderTotal != null && o.orderTotal > 0) {
              totalSales += o.orderTotal;
            } else {
              totalSales += (o.revenue || 0);
            }
          } else {
            if (o.orderTotal == null || o.orderTotal === 0) {
              totalSales += (o.revenue || 0);
            }
          }
        }

        const seenRefundOrderIds = new Set();
        for (const o of ordersForRefunds) {
          const uniqueKey = o.orderId || o.createdAt.toISOString();
          if (!seenRefundOrderIds.has(uniqueKey)) {
            seenRefundOrderIds.add(uniqueKey);
            if (o.orderTotal != null && o.orderTotal > 0) {
              totalRefunded += o.orderTotal;
            } else {
              totalRefunded += (o.revenue || 0);
            }
          } else {
            if (o.orderTotal == null || o.orderTotal === 0) {
              totalRefunded += (o.revenue || 0);
            }
          }
        }
      }

      result[store.name] = {
        isConfigured,
        totalSales,
        ordersCount,
        totalRefunded,
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

    const tzOffset = getTimezoneOffsetStr(store.timezone);

    let start = new Date();
    start.setDate(start.getDate() - 30);
    if (startDate && typeof startDate === "string") {
      start = new Date(`${startDate}T00:00:00${tzOffset}`);
    }

    let end = new Date();
    if (endDate && typeof endDate === "string") {
      end = new Date(`${endDate}T23:59:59.999${tzOffset}`);
    }
    const startStr = (startDate && typeof startDate === "string") ? startDate : start.toISOString().split("T")[0];
    const endStr = (endDate && typeof endDate === "string") ? endDate : end.toISOString().split("T")[0];

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

    let totalSales = 0;
    let totalOrders = 0;
    
    if (store.platform === "shoplazza") {
      const seenOrderIds = new Set();
      for (const o of orders) {
        const uniqueKey = o.orderId || o.createdAt.toISOString();
        if (!seenOrderIds.has(uniqueKey)) {
          seenOrderIds.add(uniqueKey);
          totalOrders++;
          totalSales += (o.orderTotal != null && o.orderTotal > 0) ? o.orderTotal : (o.revenue || 0);
        }
      }
    } else {
      const seenOrderIds = new Set();
      for (const o of orders) {
        const uniqueKey = o.orderId || o.createdAt.toISOString();
        if (!seenOrderIds.has(uniqueKey)) {
          seenOrderIds.add(uniqueKey);
          totalOrders++;
          if (o.orderTotal != null && o.orderTotal > 0) {
            totalSales += o.orderTotal;
          } else {
            totalSales += (o.revenue || 0);
          }
        } else {
          if (o.orderTotal == null || o.orderTotal === 0) {
            totalSales += (o.revenue || 0);
          }
        }
      }
    }

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

  const productCandidates = [
    `https://${cleanDomain}/openapi/2022-01/products?limit=10`,
    `https://${cleanDomain}/openapi/2020-01/products?limit=10`,
    `https://${cleanDomain}/openapi/2022-01/products.json?limit=10`,
    `https://${cleanDomain}/openapi/2020-01/products.json?limit=10`
  ];

  const orderCandidates = [
    `https://${cleanDomain}/openapi/2022-01/orders?limit=10`,
    `https://${cleanDomain}/openapi/2020-01/orders?limit=10`,
    `https://${cleanDomain}/openapi/2022-01/orders.json?limit=10`,
    `https://${cleanDomain}/openapi/2020-01/orders.json?limit=10`
  ];

  let successfulProductResponse: any = null;
  let productsUrlUsed = "";
  let productsError: any = null;

  for (const url of productCandidates) {
    console.log(`[Shoplazza Test HTTP] Trying Product Candidate URL: ${url}`);
    try {
      const response = await axios.get(url, { headers, timeout: 6000 });
      if (response.status === 200 && response.data) {
        successfulProductResponse = response;
        productsUrlUsed = url;
        break;
      }
    } catch (prodErr: any) {
      console.warn(`[Shoplazza Test HTTP] Product candidate failed: ${url}. Status/Error: ${prodErr.response?.status || prodErr.message}`);
      productsError = prodErr;
    }
  }

  if (successfulProductResponse) {
    const productsData = successfulProductResponse.data;
    const products = productsData.products || productsData.data?.products || (Array.isArray(productsData.data) ? productsData.data : []) || [];
    const fetchedList = products.map((p: any) => ({
      id: p.id,
      title: p.title || p.name,
      vendor: p.vendor || "",
      product_type: p.product_type || "Uncategorized",
      sku: p.variants?.[0]?.sku || "",
      price: p.variants?.[0]?.price || "0.00",
      inventory: p.variants?.[0]?.inventory_quantity ?? 0,
      image: p.images?.[0]?.src || null,
      created_at: p.created_at,
    }));

    const pathOnly = productsUrlUsed.replace(`https://${cleanDomain}`, "");
    return res.json({
      success: true,
      message: `成功连通店匠 API (通过 Products 接口: "${pathOnly}") 并获取到 ${fetchedList.length} 个最新商品！`,
      products: fetchedList,
      api_path_used: productsUrlUsed,
    });
  }

  console.log(`[Shoplazza Test HTTP] All product endpoints failed or returned error. Trying Fallback Orders URLs...`);

  let successfulOrderResponse: any = null;
  let ordersUrlUsed = "";
  let ordersError: any = null;

  for (const url of orderCandidates) {
    console.log(`[Shoplazza Test HTTP] Trying Order Fallback Candidate URL: ${url}`);
    try {
      const response = await axios.get(url, { headers, timeout: 6000 });
      if (response.status === 200 && response.data) {
        successfulOrderResponse = response;
        ordersUrlUsed = url;
        break;
      }
    } catch (ordErr: any) {
      console.warn(`[Shoplazza Test HTTP] Order candidate failed: ${url}. Status/Error: ${ordErr.response?.status || ordErr.message}`);
      ordersError = ordErr;
    }
  }

  if (successfulOrderResponse) {
    const ordersData = successfulOrderResponse.data;
    const orders = ordersData.orders || ordersData.data?.orders || (Array.isArray(ordersData.data) ? ordersData.data : []) || [];
    const fetchedList: any[] = [];
    const seenProductIds = new Set();

    for (const order of orders) {
      if (!order.line_items) continue;
      for (const item of order.line_items) {
        const productId = item.product_id ? item.product_id.toString() : null;
        if (productId && !seenProductIds.has(productId)) {
          seenProductIds.add(productId);
          fetchedList.push({
            id: productId,
            title: item.title || item.name || "Unknown Product",
            vendor: "",
            product_type: "订单销售商品",
            sku: item.sku || "",
            price: item.price || "0.00",
            inventory: item.quantity ?? 1,
            image: null,
            created_at: order.created_at,
          });
        }
      }
    }

    const pathOnly = ordersUrlUsed.replace(`https://${cleanDomain}`, "");
    return res.json({
      success: true,
      message: `成功连通店匠 API (通过 Orders 订单流接口: "${pathOnly}" 反查) 并成功同步到 ${fetchedList.length} 个订单关联商品！`,
      products: fetchedList,
      api_path_used: ordersUrlUsed,
    });
  }

  const lastErr = productsError || ordersError;
  console.error(`[Shoplazza Test HTTP Error] All candidates failed. Last error:`, lastErr?.response?.data || lastErr?.message);
  const errorDetails = lastErr?.response?.data 
    ? typeof lastErr.response.data === "object" ? JSON.stringify(lastErr.response.data) : String(lastErr.response.data)
    : lastErr?.message || "网络请求失败";

  return res.status(500).json({
    success: false,
    error: `无法与 Shoplazza API 通信，已重试多个 API 路由（已试 Products 与 Orders 多个版本及后缀）。`,
    details: `最近一次错误: ${errorDetails}`,
  });
});

router.post("/test-shopify-connection", async (req, res) => {
  const { domain, token } = req.body;
  if (!domain || !token) {
    return res.status(400).json({ error: "域名 (domain) 和授权秘钥 (Access-Token) 不能为空" });
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json'
  };

  const url = `https://${cleanDomain}/admin/api/2024-01/products.json?limit=10`;
  console.log(`[Shopify Test HTTP] Trying URL: ${url}`);
  try {
    const response = await axios.get(url, { headers, timeout: 8000 });
    if (response.status === 200 && response.data) {
      const products = response.data.products || [];
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

      return res.json({
        success: true,
        message: `成功秒速连通 Shopify API 并获取到 ${fetchedList.length} 个最新在售商品！`,
        products: fetchedList,
        api_path_used: url,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: `请求返回非200状态码: ${response.status}`,
      });
    }
  } catch (error: any) {
    console.error(`[Shopify Test HTTP Error] Failed:`, error.response?.data || error.message);
    const errorDetails = error.response?.data 
      ? typeof error.response.data === "object" ? JSON.stringify(error.response.data) : String(error.response.data)
      : error.message || "网络请求失败";
    return res.status(500).json({
      success: false,
      error: `无法与 Shopify API 通信，请检查域名和 Access Token。`,
      details: errorDetails,
    });
  }
});

router.post("/test-shopline-connection", async (req, res) => {
  const { domain, token } = req.body;
  if (!domain || !token) {
    return res.status(400).json({ error: "域名 (domain) 和授权秘钥 (Access-Token) 不能为空" });
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const productCandidates = [
    `https://${cleanDomain}/admin/openapi/v20240401/products/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20240301/products/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230901/products/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230301/products/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20240301/products.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20240301/products?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230901/products.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230901/products?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230301/products.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230301/products?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20220301/products.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20220301/products?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20201201/products.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20201201/products?limit=10`,
    `https://${cleanDomain}/admin/openapi/products.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/products?limit=10`,
    `https://${cleanDomain}/admin/api/v20200901/products.json?limit=10`,
    `https://${cleanDomain}/admin/api/products.json?limit=10`
  ];

  const orderCandidates = [
    `https://${cleanDomain}/admin/openapi/v20240401/orders/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20240301/orders/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230901/orders/list.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20240301/orders.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20240301/orders?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230901/orders.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230901/orders?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230301/orders.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20230301/orders?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20220301/orders.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20220301/orders?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20201201/orders.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/v20201201/orders?limit=10`,
    `https://${cleanDomain}/admin/openapi/orders.json?limit=10`,
    `https://${cleanDomain}/admin/openapi/orders?limit=10`,
    `https://${cleanDomain}/admin/api/v20200901/orders.json?limit=10`,
    `https://${cleanDomain}/admin/api/orders.json?limit=10`
  ];

  let successfulProductResponse: any = null;
  let productsUrlUsed = "";
  let productsError: any = null;

  for (const url of productCandidates) {
    console.log(`[Shopline Test HTTP] Trying Product Candidate URL: ${url}`);
    try {
      const response = await axios.get(url, { headers, timeout: 6000 });
      if (response.status === 200 && response.data) {
        successfulProductResponse = response;
        productsUrlUsed = url;
        break;
      }
    } catch (prodErr: any) {
      console.warn(`[Shopline Test HTTP] Product candidate failed: ${url}. Status/Error: ${prodErr.response?.status || prodErr.message}`);
      productsError = prodErr;
    }
  }

  if (successfulProductResponse) {
    const productsData = successfulProductResponse.data;
    const products = productsData.products || productsData.data?.products || (Array.isArray(productsData.data) ? productsData.data : []) || [];
    const fetchedList = products.map((p: any) => ({
      id: p.id,
      title: p.title || p.name,
      vendor: p.vendor || "",
      product_type: p.product_type || "Uncategorized",
      sku: p.variants?.[0]?.sku || "",
      price: p.variants?.[0]?.price || "0.00",
      inventory: p.variants?.[0]?.inventory_quantity ?? 0,
      image: p.images?.[0]?.src || null,
      created_at: p.created_at,
    }));

    const pathOnly = productsUrlUsed.replace(`https://${cleanDomain}`, "");
    return res.json({
      success: true,
      message: `成功连通 SHOPLINE API (通过 Products 接口: "${pathOnly}") 并获取到 ${fetchedList.length} 个最新商品！`,
      products: fetchedList,
      api_path_used: productsUrlUsed,
    });
  }

  console.log(`[Shopline Test HTTP] All product endpoints failed or returned error. Trying Fallback Orders URLs...`);
  
  let successfulOrderResponse: any = null;
  let ordersUrlUsed = "";
  let ordersError: any = null;

  for (const url of orderCandidates) {
    console.log(`[Shopline Test HTTP] Trying Order Fallback Candidate URL: ${url}`);
    try {
      const response = await axios.get(url, { headers, timeout: 6000 });
      if (response.status === 200 && response.data) {
        successfulOrderResponse = response;
        ordersUrlUsed = url;
        break;
      }
    } catch (ordErr: any) {
      console.warn(`[Shopline Test HTTP] Order candidate failed: ${url}. Status/Error: ${ordErr.response?.status || ordErr.message}`);
      ordersError = ordErr;
    }
  }

  if (successfulOrderResponse) {
    const ordersData = successfulOrderResponse.data;
    const orders = ordersData.orders || ordersData.data?.orders || (Array.isArray(ordersData.data) ? ordersData.data : []) || [];
    const fetchedList: any[] = [];
    const seenProductIds = new Set();

    for (const order of orders) {
      if (!order.line_items) continue;
      for (const item of order.line_items) {
        const productId = item.product_id ? item.product_id.toString() : null;
        if (productId && !seenProductIds.has(productId)) {
          seenProductIds.add(productId);
          fetchedList.push({
            id: productId,
            title: item.title || item.name || "Unknown Product",
            vendor: "",
            product_type: "订单销售商品",
            sku: item.sku || "",
            price: item.price || "0.00",
            inventory: item.quantity ?? 1,
            image: null,
            created_at: order.created_at,
          });
        }
      }
    }

    const pathOnly = ordersUrlUsed.replace(`https://${cleanDomain}`, "");
    return res.json({
      success: true,
      message: `成功连通 SHOPLINE API (通过 Orders 订单流接口: "${pathOnly}" 反查) 并成功同步到 ${fetchedList.length} 个订单关联商品！`,
      products: fetchedList,
      api_path_used: ordersUrlUsed,
    });
  }

  // If we reach here, both products and orders endpoints have failed.
  const lastErr = productsError || ordersError;
  console.error(`[Shopline Test HTTP Error] All candidates failed. Last error:`, lastErr?.response?.data || lastErr?.message);
  const errorDetails = lastErr?.response?.data 
    ? typeof lastErr.response.data === "object" ? JSON.stringify(lastErr.response.data) : String(lastErr.response.data)
    : lastErr?.message || "网络请求失败";

  return res.status(500).json({
    success: false,
    error: `无法与 SHOPLINE API 通信，已重试多个 API 路由（已试 Products 与 Orders 多个版本及后缀）。`,
    details: `最近一次网络报错: ${errorDetails}`,
  });
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
