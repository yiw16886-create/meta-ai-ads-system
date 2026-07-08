import axios from "axios";
import prisma from "../../db/index.js";
import { getTimezoneOffsetStr } from "../utils.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBrowserHeaders = (extraHeaders?: Record<string, string>) => {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...extraHeaders
  };
};

const getCleanDomain = (domain: string): string => {
  let clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  if (clean.endsWith(".myshopline")) {
    clean = clean + ".com";
  } else if (clean.endsWith(".myshoplazz")) {
    clean = clean + ".com";
  } else if (clean.endsWith(".myshoplazza")) {
    clean = clean + ".com";
  } else if (clean.endsWith(".myshopify")) {
    clean = clean + ".com";
  } else if (clean.endsWith(".myshoplaza")) {
    clean = clean + ".com";
  }

  // Normalize Shoplaza/Shoplazza spelling variations to the correct, resolvable .myshoplaza.com domain
  if (clean.endsWith(".myshoplazz.com")) {
    clean = clean.replace(/\.myshoplazz\.com$/, ".myshoplaza.com");
  } else if (clean.endsWith(".myshoplazza.com")) {
    clean = clean.replace(/\.myshoplazza\.com$/, ".myshoplaza.com");
  }

  return clean;
};

function extractOrderStoreIdStr(o: any): string | null {
  if (!o) return null;

  // 1. Try note_attributes array
  if (Array.isArray(o.note_attributes)) {
    const attr = o.note_attributes.find((a: any) => {
      if (!a || !a.name) return false;
      const nm = String(a.name).toLowerCase();
      return nm === 'storeid' || nm === 'store_id' || nm === 'store-id';
    });
    if (attr && attr.value) {
      return String(attr.value).trim();
    }
  }

  // 2. Try noteAttributes array (alternate naming)
  if (Array.isArray(o.noteAttributes)) {
    const attr = o.noteAttributes.find((a: any) => {
      if (!a || !a.name) return false;
      const nm = String(a.name).toLowerCase();
      return nm === 'storeid' || nm === 'store_id' || nm === 'store-id';
    });
    if (attr && attr.value) {
      return String(attr.value).trim();
    }
  }

  // 3. Try tags (string or array)
  if (o.tags) {
    const tagsArray = Array.isArray(o.tags) 
      ? o.tags 
      : String(o.tags).split(',').map(t => t.trim());

    for (const tag of tagsArray) {
      const lowerTag = String(tag).toLowerCase().trim();
      if (lowerTag.startsWith('storeid:') || lowerTag.startsWith('storeid_') || lowerTag.startsWith('storeid=')) {
        return String(tag).substring(8).trim();
      }
      if (lowerTag.startsWith('store_id:') || lowerTag.startsWith('store_id_') || lowerTag.startsWith('store_id=')) {
        return String(tag).substring(9).trim();
      }
    }
  }

  // 4. Try note
  if (o.note) {
    const match = String(o.note).match(/(?:storeid|store_id|storeId)[:=]\s*([a-zA-Z0-9_\-]+)/i);
    if (match) {
      return match[1].trim();
    }
  }

  // 5. Try custom_attributes or similar if exists
  if (Array.isArray(o.custom_attributes)) {
    const attr = o.custom_attributes.find((a: any) => {
      if (!a || !a.name) return false;
      const nm = String(a.name).toLowerCase();
      return nm === 'storeid' || nm === 'store_id' || nm === 'store-id';
    });
    if (attr && attr.value) {
      return String(attr.value).trim();
    }
  }

  return null;
}

async function findStoreIdForOrder(storeIdValue: string, defaultStoreId: number): Promise<number> {
  const cleanVal = storeIdValue.trim();
  if (!cleanVal) return defaultStoreId;

  // 1. Check if cleanVal matches any Store name (case-insensitive)
  const storeByName = await prisma.store.findFirst({
    where: {
      name: {
        equals: cleanVal,
        mode: 'insensitive'
      }
    }
  });
  if (storeByName) {
    return storeByName.id;
  }

  // 2. Check if cleanVal matches any field in AccountMapping (case-insensitive)
  const mapping = await prisma.accountMapping.findFirst({
    where: {
      OR: [
        { name: { equals: cleanVal, mode: 'insensitive' } },
        { project: { equals: cleanVal, mode: 'insensitive' } },
        { owner: { equals: cleanVal, mode: 'insensitive' } },
        { fbAccountId: { equals: cleanVal, mode: 'insensitive' } },
        { fbAccountId: { equals: `act_${cleanVal}`, mode: 'insensitive' } }
      ],
      storeId: { not: null }
    },
    include: { store: true }
  });

  if (mapping && mapping.storeId) {
    return mapping.storeId;
  }

  return defaultStoreId;
}

export async function syncStoreData(startDate: string, endDate: string, storeIdentifier?: string) {
  let stores;
  if (storeIdentifier) {
    const isNumeric = !isNaN(parseInt(storeIdentifier, 10)) && /^\d+$/.test(storeIdentifier);
    if (isNumeric) {
      stores = await prisma.store.findMany({ where: { id: parseInt(storeIdentifier, 10) } });
    } else {
      stores = await prisma.store.findMany({ where: { name: { equals: storeIdentifier, mode: 'insensitive' } } });
    }
  } else {
    stores = await prisma.store.findMany();
  }

  for (const store of stores) {
    if (!store.shopify_token && !store.shopline_token && !store.shoplazza_token) {
      console.warn(`[Store Sync] Skipping store ${store.id} (${store.name}) because token is empty`);
      continue;
    }
    
    try {
      if (store.platform === "shoplazza" || (store.shoplazza_token && !store.shopline_token && !store.shopify_token)) {
        console.log(`[Store Sync] Triggering Shoplazza Sync for store ${store.id}...`);
        await syncShoplazzaStoreData(store, startDate, endDate);
      } else if (store.shopline_token) {
        console.log(`[Store Sync] Triggering Shopline Sync for store ${store.id}...`);
        await syncShoplineStoreData(store, startDate, endDate);
      } else if (store.shopify_token) {
        console.log(`[Store Sync] Triggering Shopify Sync for store ${store.id}...`);
        await syncShopifyStoreData(store, startDate, endDate);
      }
      // Wait between stores to be polite & avoid concurrency limits
      await delay(1000);
    } catch (err) {
      console.error(`[Store Sync] Failed to sync store ${store.id}:`, err);
    }
  }
}

async function syncShoplineStoreData(store: any, startDate: string, endDate: string) {
  const domain = getCleanDomain(store.domain);
  const headers = getBrowserHeaders({ 
    'Authorization': `Bearer ${store.shopline_token}`,
    'Content-Type': 'application/json'
  });
  
  // 1. Fetch Products
  // We skip fetching products directly for Shopline as the /products.json endpoint is often not exposed or returns 404.
  // Instead, products are lazily created during the Order sync phase from order line items.

  // 2. Fetch Orders (Store Timezone aware)
  const tzOffset = getTimezoneOffsetStr(store.timezone);
  let ordersUrl = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=${startDate}T00:00:00${tzOffset}&created_at_max=${endDate}T23:59:59${tzOffset}&limit=100`;
  let hasNextOrders = true;
  let ordersCount = 0;

  while (hasNextOrders && ordersUrl) {
    console.log(`[Shopline Sync] Fetching orders from URL: ${ordersUrl}`);
    let res;
    try {
      res = await axios.get(ordersUrl, { headers });
    } catch(e: any) {
      console.error(`[Shopline Sync] Failed to fetch orders for ${store.id}:`, e.response?.data || e.message);
      break;
    }
    
    const orders = res.data.data || res.data.orders || [];
    console.log(`[Shopline Sync] Received ${orders.length} orders`);

    let successCount = 0;
    for (const o of orders) {
      const allowedStatuses = ['paid', 'pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded'];
      const currentStatus = String(o.financial_status || "").toLowerCase();
      if (!allowedStatuses.includes(currentStatus)) {
        continue;
      }
      if (o.cancelled_at || o.cancel_reason) {
        continue;
      }
      if (!o.line_items) continue;

      const orderStoreIdStr = extractOrderStoreIdStr(o);
      const targetStoreId = orderStoreIdStr 
        ? await findStoreIdForOrder(orderStoreIdStr, store.id) 
        : store.id;

      if (orderStoreIdStr) {
        console.log(`[Shopline Sync Matching] Order ID: ${o.id}, extracted storeid tag/note: "${orderStoreIdStr}", mapped to target storeId: ${targetStoreId}`);
      }

      for (const lineItem of o.line_items) {
        const productId = lineItem.product_id ? lineItem.product_id.toString() : null;
        if (!productId) continue;

        try {
          // Fallback: lazily create product if it didn't sync previously to satisfy foreign key
          const existingProduct = await prisma.product.findUnique({
            where: { id: productId }
          });
          if (!existingProduct) {
            await prisma.product.create({
              data: {
                id: productId,
                storeId: targetStoreId,
                name: lineItem.title || lineItem.name || "Unknown Product",
                sku: lineItem.sku || "",
                category: "Uncategorized",
                inventory: 0,
              }
            });
          }

          const revenue = parseFloat(lineItem.price || 0) * (lineItem.quantity || 1);
          const refunded = o.financial_status === 'refunded' || o.financial_status === 'partially_refunded';
          const refundedAt = refunded ? new Date(o.updated_at || o.created_at) : null;
          const orderId = o.id.toString();
          const orderTotal = parseFloat(o.total_price || o.current_total_price || o.total_amount || 0);
          
          const lineItemDbId = `${store.platform}_${store.id}_${orderId}_${lineItem.id.toString()}`;

          const existingOrder = await prisma.order.findUnique({
            where: { id: lineItemDbId }
          });

          if (existingOrder) {
            if (existingOrder.revenue !== revenue || existingOrder.refunded !== refunded || existingOrder.orderId !== orderId || existingOrder.orderTotal !== orderTotal || existingOrder.storeId !== targetStoreId) {
              await prisma.order.update({
                where: { id: lineItemDbId },
                data: {
                  revenue,
                  refunded,
                  refundedAt,
                  orderId,
                  orderTotal,
                  storeId: targetStoreId,
                }
              });
            }
          } else {
            await prisma.order.create({
              data: {
                id: lineItemDbId,
                storeId: targetStoreId,
                productId: productId,
                revenue,
                profit: revenue * 0.4,
                refunded,
                refundedAt,
                orderId,
                orderTotal,
                createdAt: new Date(o.created_at)
              }
            });
          }
          successCount++;
        } catch (oErr) {
          console.error(`[Shopline Sync] Prisma error writing order ${lineItem.id}:`, oErr);
        }
      }
    }
    console.log(`[Shopline Sync] Successfully wrote ${successCount} order line items`);
    ordersCount += successCount;

    const linkHeader = res.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
      ordersUrl = matches ? matches[1] : "";
      // Brief sleep between paginated requests
      await delay(500);
    } else {
      hasNextOrders = false;
    }
  }
  console.log(`[Shopline Sync] Total order items synced for store ${store.id}: ${ordersCount}`);
}

async function syncShopifyStoreData(store: any, startDate: string, endDate: string) {
      try {
        const domain = getCleanDomain(store.domain); // clean up URL
        // We set both headers to maximize compatibility if it's a shopify/shopline hybrid or custom endpoint
        const rawHeaders: Record<string, string> = {};
        if (store.shopify_token) rawHeaders['X-Shopify-Access-Token'] = store.shopify_token;
        if (store.shopline_token) rawHeaders['Authorization'] = `Bearer ${store.shopline_token}`;
        const headers = getBrowserHeaders(rawHeaders);
        
        console.log(`[Store Sync] Starting API sync for store ${store.id} (${store.name}) on domain ${domain}`);
        
        // 1. Fetch Products
        let hasNextPage = true;
        let url = `https://${domain}/admin/api/2024-01/products.json?limit=250`;
        let productsCount = 0;
        
        while (hasNextPage && url) {
          console.log(`[Store Sync] Fetching products from URL: ${url}`);
          const response = await axios.get(url, { headers });
          const products = response.data.products || [];
          console.log(`[Store Sync] Received ${products.length} products`);
          
          let successCount = 0;
          for (const p of products) {
            try {
              const name = p.title;
              const category = p.product_type || "Uncategorized";
              const sku = p.variants?.[0]?.sku || "";
              const inventory = p.variants?.[0]?.inventory_quantity || 0;

              const existingProduct = await prisma.product.findUnique({
                where: { id: p.id.toString() }
              });

              if (existingProduct) {
                if (existingProduct.name !== name || existingProduct.category !== category || existingProduct.sku !== sku || existingProduct.inventory !== inventory) {
                  await prisma.product.update({
                    where: { id: p.id.toString() },
                    data: { name, category, sku, inventory }
                  });
                }
              } else {
                await prisma.product.create({
                  data: {
                    id: p.id.toString(),
                    storeId: store.id,
                    name,
                    sku,
                    category,
                    inventory
                  }
                });
              }
              successCount++;
            } catch (pErr) {
              console.error(`[Store Sync] Prisma error writing product ${p.id}:`, pErr);
            }
          }
          console.log(`[Store Sync] Successfully wrote ${successCount} products`);
          productsCount += successCount;
          
          const linkHeader = response.headers.link;
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
            url = matches ? matches[1] : "";
            // Brief sleep between paginated requests
            await delay(500);
          } else {
            hasNextPage = false;
          }
        }
        console.log(`[Store Sync] Total products synced for store ${store.id}: ${productsCount}`);

        // 2. Fetch Orders
        // Shopify date fields: created_at_min requires ISO8601 format
        const tzOffset = getTimezoneOffsetStr(store.timezone);
        let ordersUrl = `https://${domain}/admin/api/2024-01/orders.json?status=any&created_at_min=${startDate}T00:00:00${tzOffset}&created_at_max=${endDate}T23:59:59${tzOffset}&limit=250`;
        let hasNextOrders = true;
        let ordersCount = 0;

        while (hasNextOrders && ordersUrl) {
          console.log(`[Store Sync] Fetching orders from URL: ${ordersUrl}`);
          const res = await axios.get(ordersUrl, { headers });
          const orders = res.data.orders || [];
          console.log(`[Store Sync] Received ${orders.length} orders`);

          let successCount = 0;
          for (const o of orders) {
            const allowedStatuses = ['paid', 'pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded'];
            const currentStatus = String(o.financial_status || "").toLowerCase();
            if (!allowedStatuses.includes(currentStatus)) {
              continue;
            }
            if (o.cancelled_at || o.cancel_reason) {
              continue;
            }
            if (!o.line_items) continue;

            const orderStoreIdStr = extractOrderStoreIdStr(o);
            const targetStoreId = orderStoreIdStr 
              ? await findStoreIdForOrder(orderStoreIdStr, store.id) 
              : store.id;

            if (orderStoreIdStr) {
              console.log(`[Shopify Sync Matching] Order ID: ${o.id}, extracted storeid tag/note: "${orderStoreIdStr}", mapped to target storeId: ${targetStoreId}`);
            }

            for (const lineItem of o.line_items) {
              const productId = lineItem.product_id ? lineItem.product_id.toString() : null;
              if (!productId) continue;

              try {
                // Ensure product exists
                const existingProduct = await prisma.product.findUnique({
                  where: { id: productId }
                });
                if (!existingProduct) {
                  await prisma.product.create({
                    data: {
                      id: productId,
                      storeId: targetStoreId,
                      name: lineItem.title || lineItem.name || "Unknown Product",
                      sku: lineItem.sku || "",
                      category: "Uncategorized",
                      inventory: 0,
                    }
                  });
                }

                const revenue = parseFloat(lineItem.price) * lineItem.quantity;
                const refunded = o.financial_status === 'refunded' || o.financial_status === 'partially_refunded';
                const refundedAt = refunded ? new Date(o.updated_at || o.created_at) : null;
                const orderId = o.id.toString();
                const orderTotal = parseFloat(o.total_price || o.current_total_price || o.total_amount || 0);

                const lineItemDbId = `${store.platform}_${store.id}_${orderId}_${lineItem.id.toString()}`;

                const existingOrder = await prisma.order.findUnique({
                  where: { id: lineItemDbId }
                });

                if (existingOrder) {
                  if (existingOrder.revenue !== revenue || existingOrder.refunded !== refunded || existingOrder.orderId !== orderId || existingOrder.orderTotal !== orderTotal || existingOrder.storeId !== targetStoreId) {
                     await prisma.order.update({
                       where: { id: lineItemDbId },
                       data: {
                         revenue,
                         refunded,
                         refundedAt,
                         orderId,
                         orderTotal,
                         storeId: targetStoreId,
                       }
                     });
                  }
                } else {
                  await prisma.order.create({
                    data: {
                      id: lineItemDbId,
                      storeId: targetStoreId,
                      productId: productId,
                      revenue,
                      profit: revenue * 0.4,
                      refunded,
                      refundedAt,
                      orderId,
                      orderTotal,
                      createdAt: new Date(o.created_at)
                    }
                  });
                }
                successCount++;
              } catch (oErr) {
                console.error(`[Store Sync] Prisma error writing order ${lineItem.id}:`, oErr);
              }
            }
          }
          console.log(`[Store Sync] Successfully wrote ${successCount} order line items`);
          ordersCount += successCount;

          const linkHeader = res.headers.link;
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
            ordersUrl = matches ? matches[1] : "";
            // Brief sleep between paginated requests
            await delay(500);
          } else {
            hasNextOrders = false;
          }
        }
        console.log(`[Store Sync] Total order items synced for store ${store.id}: ${ordersCount}`);
      } catch (err: any) {
        console.error(`[Store Sync] Failed API call for shopify store ${store.id}:`, err?.response?.data || err?.message || err);
      }
}

async function syncShoplazzaStoreData(store: any, startDate: string, endDate: string) {
  try {
    const domain = getCleanDomain(store.domain);
    const headers = getBrowserHeaders({
      'Access-Token': store.shoplazza_token,
      'Content-Type': 'application/json'
    });
    
    console.log(`[Shoplazza Sync] Starting API sync for store ${store.id} (${store.name}) on domain ${domain}`);
    
    let apiVersion = "2022-01";
    let useJsonSuffix = false;

    // Detect endpoint format dynamically using orders
    const candidateUrls = [
      { version: "2022-01", json: false, url: `https://${domain}/openapi/2022-01/orders?limit=1` },
      { version: "2020-01", json: false, url: `https://${domain}/openapi/2020-01/orders?limit=1` },
      { version: "2022-01", json: true, url: `https://${domain}/openapi/2022-01/orders.json?limit=1` },
      { version: "2020-01", json: true, url: `https://${domain}/openapi/2020-01/orders.json?limit=1` },
    ];

    for (const cand of candidateUrls) {
      try {
        console.log(`[Shoplazza Sync] Detecting format: checking ${cand.url}`);
        const testRes = await axios.get(cand.url, { headers, timeout: 5000 });
        if (testRes.status === 200) {
          apiVersion = cand.version;
          useJsonSuffix = cand.json;
          console.log(`[Shoplazza Sync] Autodetected format matches: Version=${apiVersion}, JsonSuffix=${useJsonSuffix}`);
          break;
        }
      } catch (err) {
        // continue trying
      }
    }

    const suffix = useJsonSuffix ? ".json" : "";

    // 1. Fetch Products
    // We skip fetching products directly for Shoplazza as requested.
    // Instead, products are lazily created during the Order sync phase from order line items.

    // 2. Fetch Orders
    const limit = 50;
    let page = 1;
    let hasNextOrders = true;
    let ordersCount = 0;

    // Use dayjs specifying store.timezone or America/Los_Angeles with proper UTC conversion
    const storeTz = store.timezone || "America/Los_Angeles";
    const formattedMin = dayjs.tz(`${startDate}T00:00:00`, storeTz).utc().format();
    const formattedMax = dayjs.tz(`${endDate}T23:59:59`, storeTz).utc().format();

    while (hasNextOrders) {
      const updated_at_min = encodeURIComponent(formattedMin);
      const updated_at_max = encodeURIComponent(formattedMax);
      const ordersUrl = `https://${domain}/openapi/${apiVersion}/orders${suffix}?updated_at_min=${updated_at_min}&updated_at_max=${updated_at_max}&limit=${limit}&page=${page}`;

      console.log(`[Shoplazza Sync] Fetching orders page ${page} from URL: ${ordersUrl}`);
      let res;
      try {
        res = await axios.get(ordersUrl, { headers });
      } catch (e: any) {
        console.error(`[Shoplazza Sync] Failed to fetch orders for ${store.id} at page ${page}:`, e.response?.data || e.message);
        break;
      }

      const orders = res.data.orders || [];
      console.log(`[Shoplazza Sync] Page ${page} received ${orders.length} orders`);

      if (orders.length === 0) {
        hasNextOrders = false;
        break;
      }

      let successCount = 0;
      for (const o of orders) {
        const allowedStatuses = ['paid', 'pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded'];
        const currentStatus = String(o.financial_status || "").toLowerCase();
        if (!allowedStatuses.includes(currentStatus)) {
          continue;
        }
        if (o.cancelled_at || o.cancel_reason) {
          continue;
        }
        if (!o.line_items) continue;

        const orderStoreIdStr = extractOrderStoreIdStr(o);
        const targetStoreId = orderStoreIdStr 
          ? await findStoreIdForOrder(orderStoreIdStr, store.id) 
          : store.id;

        if (orderStoreIdStr) {
          console.log(`[Shoplazza Sync Matching] Order ID: ${o.id}, extracted storeid tag/note: "${orderStoreIdStr}", mapped to target storeId: ${targetStoreId}`);
        }

        for (const lineItem of o.line_items) {
          const productId = lineItem.product_id ? lineItem.product_id.toString() : null;
          if (!productId) continue;

          try {
            const existingProduct = await prisma.product.findUnique({
              where: { id: productId }
            });
            if (!existingProduct) {
              await prisma.product.create({
                data: {
                  id: productId,
                  storeId: targetStoreId,
                  name: lineItem.title || lineItem.name || "Unknown Product",
                  sku: lineItem.sku || "",
                  category: "Uncategorized",
                  inventory: 0,
                }
              });
            }

            const revenue = parseFloat(lineItem.price || 0) * (lineItem.quantity || 1);
            const refunded = o.financial_status === 'refunded' || o.financial_status === 'partially_refunded';
            const refundedAt = refunded ? new Date(o.updated_at || o.created_at) : null;
            const orderId = o.id.toString();
            const orderTotal = parseFloat(o.total_price || o.current_total_price || o.total_amount || 0);

            const lineItemDbId = `${store.platform}_${store.id}_${orderId}_${lineItem.id.toString()}`;

            await prisma.order.upsert({
              where: { id: lineItemDbId },
              update: {
                storeId: targetStoreId,
                productId: productId,
                revenue,
                profit: revenue * 0.4,
                refunded,
                refundedAt,
                orderId,
                orderTotal,
                createdAt: new Date(o.processed_at || o.created_at)
              },
              create: {
                id: lineItemDbId,
                storeId: targetStoreId,
                productId: productId,
                revenue,
                profit: revenue * 0.4,
                refunded,
                refundedAt,
                orderId,
                orderTotal,
                createdAt: new Date(o.processed_at || o.created_at)
              }
            });
            successCount++;
          } catch (oErr) {
            console.error(`[Shoplazza Sync] Prisma error writing order ${lineItem.id}:`, oErr);
          }
        }
      }
      console.log(`[Shoplazza Sync] Page ${page}: Successfully wrote ${successCount} order line items`);
      ordersCount += successCount;

      if (orders.length < limit) {
        hasNextOrders = false;
      } else {
        page++;
        await delay(500);
      }
    }
    console.log(`[Shoplazza Sync] Total order items synced for store ${store.id}: ${ordersCount}`);
  } catch (err: any) {
    console.error(`[Shoplazza Sync] Failed API call for shoplazza store ${store.id}:`, err?.response?.data || err?.message || err);
  }
}
