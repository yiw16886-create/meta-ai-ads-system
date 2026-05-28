import axios from "axios";
import prisma from "../db.js";

export async function syncStoreData(startDate: string, endDate: string) {
  const stores = await prisma.store.findMany();

  for (const store of stores) {
    if (!store.shopify_token && !store.shopline_token) {
      console.warn(`[Store Sync] Skipping store ${store.id} (${store.name}) because token is empty`);
      continue;
    }
    
    try {
      if (store.shopline_token) {
        console.log(`[Store Sync] Triggering Shopline Sync for store ${store.id}...`);
        await syncShoplineStoreData(store, startDate, endDate);
      } else if (store.shopify_token) {
        console.log(`[Store Sync] Triggering Shopify Sync for store ${store.id}...`);
        await syncShopifyStoreData(store, startDate, endDate);
      }
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

  // 2. Fetch Orders
  let ordersUrl = `https://${domain}/admin/openapi/v20240301/orders.json?status=any&created_at_min=${startDate}T00:00:00Z&created_at_max=${endDate}T23:59:59Z&limit=100`;
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
      if (!o.line_items) continue;
      for (const lineItem of o.line_items) {
        const productId = lineItem.product_id ? lineItem.product_id.toString() : null;
        if (!productId) continue;

        try {
          // Fallback: lazily create product if it didn't sync previously to satisfy foreign key
          await prisma.product.upsert({
            where: { id: productId },
            update: {}, // Don't overwrite if it exists
            create: {
              id: productId,
              storeId: store.id,
              name: lineItem.title || lineItem.name || "Unknown Product",
              sku: lineItem.sku || "",
              category: "Uncategorized",
              inventory: 0,
            }
          });

          await prisma.order.upsert({
            where: { id: lineItem.id.toString() },
            update: {
              revenue: parseFloat(lineItem.price || 0) * (lineItem.quantity || 1),
              refunded: o.financial_status === 'refunded' || o.financial_status === 'partially_refunded',
            },
            create: {
              id: lineItem.id.toString(),
              storeId: store.id,
              productId: productId,
              revenue: parseFloat(lineItem.price || 0) * (lineItem.quantity || 1),
              profit: (parseFloat(lineItem.price || 0) * (lineItem.quantity || 1)) * 0.4,
              refunded: o.financial_status === 'refunded' || o.financial_status === 'partially_refunded',
              createdAt: new Date(o.created_at)
            }
          });
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
              await prisma.product.upsert({
                where: { id: p.id.toString() },
                update: {
                  name: p.title,
                  category: p.product_type || "Uncategorized",
                  sku: p.variants?.[0]?.sku || "",
                  inventory: p.variants?.[0]?.inventory_quantity || 0,
                },
                create: {
                  id: p.id.toString(),
                  storeId: store.id,
                  name: p.title,
                  sku: p.variants?.[0]?.sku || "",
                  category: p.product_type || "Uncategorized",
                  inventory: p.variants?.[0]?.inventory_quantity || 0,
                }
              });
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
          } else {
            hasNextPage = false;
          }
        }
        console.log(`[Store Sync] Total products synced for store ${store.id}: ${productsCount}`);

        // 2. Fetch Orders
        // Shopify date fields: created_at_min requires ISO8601 format
        let ordersUrl = `https://${domain}/admin/api/2024-01/orders.json?status=any&created_at_min=${startDate}T00:00:00Z&created_at_max=${endDate}T23:59:59Z&limit=250`;
        let hasNextOrders = true;
        let ordersCount = 0;

        while (hasNextOrders && ordersUrl) {
          console.log(`[Store Sync] Fetching orders from URL: ${ordersUrl}`);
          const res = await axios.get(ordersUrl, { headers });
          const orders = res.data.orders || [];
          console.log(`[Store Sync] Received ${orders.length} orders`);

          let successCount = 0;
          for (const o of orders) {
            for (const lineItem of o.line_items) {
              const productId = lineItem.product_id ? lineItem.product_id.toString() : null;
              if (!productId) continue;

              try {
                await prisma.order.upsert({
                  where: { id: lineItem.id.toString() },
                  update: {
                    revenue: parseFloat(lineItem.price) * lineItem.quantity,
                    refunded: o.financial_status === 'refunded' || o.financial_status === 'partially_refunded',
                  },
                  create: {
                    id: lineItem.id.toString(),
                    storeId: store.id,
                    productId: productId,
                    revenue: parseFloat(lineItem.price) * lineItem.quantity,
                    profit: (parseFloat(lineItem.price) * lineItem.quantity) * 0.4, // Estimated 40% margin logic
                    refunded: o.financial_status === 'refunded' || o.financial_status === 'partially_refunded',
                    createdAt: new Date(o.created_at)
                  }
                });
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
          } else {
            hasNextOrders = false;
          }
        }
        console.log(`[Store Sync] Total order items synced for store ${store.id}: ${ordersCount}`);
      } catch (err: any) {
        console.error(`[Store Sync] Failed API call for shopify store ${store.id}:`, err?.response?.data || err?.message || err);
      }
}
