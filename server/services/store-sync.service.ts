import axios from "axios";
import prisma from "../../db/index.js";
import { getTimezoneOffsetStr } from "../utils.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const domain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
  const headers = { 
    'Authorization': `Bearer ${store.shopline_token}`,
    'Content-Type': 'application/json'
  };
  
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
      if (o.financial_status !== 'paid' && o.financial_status !== 'partially_refunded' && o.financial_status !== 'refunded') {
        continue;
      }
      if (!o.line_items) continue;
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
                storeId: store.id,
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
          
          const existingOrder = await prisma.order.findUnique({
            where: { id: lineItem.id.toString() }
          });

          if (existingOrder) {
            if (existingOrder.revenue !== revenue || existingOrder.refunded !== refunded || existingOrder.orderId !== orderId || existingOrder.orderTotal !== orderTotal) {
              await prisma.order.update({
                where: { id: lineItem.id.toString() },
                data: {
                  revenue,
                  refunded,
                  refundedAt,
                  orderId,
                  orderTotal,
                }
              });
            }
          } else {
            await prisma.order.create({
              data: {
                id: lineItem.id.toString(),
                storeId: store.id,
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
        const domain = store.domain.replace(/^https?:\/\//, ""); // clean up URL
        // We set both headers to maximize compatibility if it's a shopify/shopline hybrid or custom endpoint
        const headers: Record<string, string> = {};
        if (store.shopify_token) headers['X-Shopify-Access-Token'] = store.shopify_token;
        if (store.shopline_token) headers['Authorization'] = `Bearer ${store.shopline_token}`;
        
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
            if (o.financial_status !== 'paid' && o.financial_status !== 'partially_refunded' && o.financial_status !== 'refunded') {
              continue;
            }
            if (!o.line_items) continue;
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
                      storeId: store.id,
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

                const existingOrder = await prisma.order.findUnique({
                  where: { id: lineItem.id.toString() }
                });

                if (existingOrder) {
                  if (existingOrder.revenue !== revenue || existingOrder.refunded !== refunded || existingOrder.orderId !== orderId || existingOrder.orderTotal !== orderTotal) {
                     await prisma.order.update({
                       where: { id: lineItem.id.toString() },
                       data: {
                         revenue,
                         refunded,
                         refundedAt,
                         orderId,
                         orderTotal,
                       }
                     });
                  }
                } else {
                  await prisma.order.create({
                    data: {
                      id: lineItem.id.toString(),
                      storeId: store.id,
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
    const domain = store.domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin\/.*$/, "");
    const headers = {
      'Access-Token': store.shoplazza_token,
      'Content-Type': 'application/json'
    };
    
    console.log(`[Shoplazza Sync] Starting API sync for store ${store.id} (${store.name}) on domain ${domain}`);
    
    let apiVersion = "2022-01";
    let useJsonSuffix = false;

    // Detect endpoint format dynamically
    const candidateUrls = [
      { version: "2022-01", json: false, url: `https://${domain}/openapi/2022-01/products?limit=1` },
      { version: "2020-01", json: false, url: `https://${domain}/openapi/2020-01/products?limit=1` },
      { version: "2022-01", json: true, url: `https://${domain}/openapi/2022-01/products.json?limit=1` },
      { version: "2020-01", json: true, url: `https://${domain}/openapi/2020-01/products.json?limit=1` },
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
    let hasNextPage = true;
    let url = `https://${domain}/openapi/${apiVersion}/products${suffix}?limit=250`;
    let productsCount = 0;
    
    while (hasNextPage && url) {
      console.log(`[Shoplazza Sync] Fetching products from URL: ${url}`);
      let response;
      try {
        response = await axios.get(url, { headers });
      } catch (e: any) {
        console.error(`[Shoplazza Sync] Failed to fetch products for ${store.id}:`, e.response?.data || e.message);
        break;
      }
      const products = response.data.products || [];
      console.log(`[Shoplazza Sync] Received ${products.length} products`);
      
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
          console.error(`[Shoplazza Sync] Prisma error writing product ${p.id}:`, pErr);
        }
      }
      console.log(`[Shoplazza Sync] Successfully wrote ${successCount} products`);
      productsCount += successCount;
      
      const linkHeader = response.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
        url = matches ? matches[1] : "";
        await delay(500);
      } else {
        hasNextPage = false;
      }
    }
    console.log(`[Shoplazza Sync] Total products synced for store ${store.id}: ${productsCount}`);

    // 2. Fetch Orders
    const tzOffset = getTimezoneOffsetStr(store.timezone);
    let ordersUrl = `https://${domain}/openapi/${apiVersion}/orders${suffix}?status=any&created_at_min=${startDate}T00:00:00${tzOffset}&created_at_max=${endDate}T23:59:59${tzOffset}&limit=250`;
    let hasNextOrders = true;
    let ordersCount = 0;

    while (hasNextOrders && ordersUrl) {
      console.log(`[Shoplazza Sync] Fetching orders from URL: ${ordersUrl}`);
      let res;
      try {
        res = await axios.get(ordersUrl, { headers });
      } catch (e: any) {
        console.error(`[Shoplazza Sync] Failed to fetch orders for ${store.id}:`, e.response?.data || e.message);
        break;
      }
      const orders = res.data.orders || [];
      console.log(`[Shoplazza Sync] Received ${orders.length} orders`);

      let successCount = 0;
      for (const o of orders) {
        if (o.financial_status !== 'paid' && o.financial_status !== 'partially_refunded' && o.financial_status !== 'refunded') {
          continue;
        }
        if (!o.line_items) continue;
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
                  storeId: store.id,
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

            const existingOrder = await prisma.order.findUnique({
              where: { id: lineItem.id.toString() }
            });

            if (existingOrder) {
              if (existingOrder.revenue !== revenue || existingOrder.refunded !== refunded || existingOrder.orderId !== orderId || existingOrder.orderTotal !== orderTotal) {
                await prisma.order.update({
                  where: { id: lineItem.id.toString() },
                  data: {
                    revenue,
                    refunded,
                    refundedAt,
                    orderId,
                    orderTotal,
                  }
                });
              }
            } else {
              await prisma.order.create({
                data: {
                  id: lineItem.id.toString(),
                  storeId: store.id,
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
            console.error(`[Shoplazza Sync] Prisma error writing order ${lineItem.id}:`, oErr);
          }
        }
      }
      console.log(`[Shoplazza Sync] Successfully wrote ${successCount} order line items`);
      ordersCount += successCount;

      const linkHeader = res.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
        ordersUrl = matches ? matches[1] : "";
        await delay(500);
      } else {
        hasNextOrders = false;
      }
    }
    console.log(`[Shoplazza Sync] Total order items synced for store ${store.id}: ${ordersCount}`);
  } catch (err: any) {
    console.error(`[Shoplazza Sync] Failed API call for shoplazza store ${store.id}:`, err?.response?.data || err?.message || err);
  }
}
