import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { activeOnly } = req.query;

    let mappings = await prisma.accountMapping.findMany({
      include: { store: true }
    });

    const monitoringData = await prisma.metaAccountMonitoring.findMany({
      select: { accountId: true, accountName: true, activityStatus: true },
    });
    
    if (activeOnly === 'true') {
      const activeIds = new Set(monitoringData.filter(d => (d.activityStatus || 0) <= 2).map(d => d.accountId));
      mappings = mappings.filter(m => {
        const cleanId = String(m.fbAccountId).replace("act_", "").trim();
        return activeIds.has(cleanId);
      });
    }

    const adAccountData = await prisma.adAccount.findMany({
      select: { fb_account_id: true, fb_account_name: true },
    });

    const nameMap = new Map();
    for (const d of monitoringData) {
      if (d.accountName) nameMap.set(d.accountId, d.accountName);
    }
    for (const d of adAccountData) {
      if (d.fb_account_name) {
        nameMap.set(String(d.fb_account_id).replace("act_", "").trim(), d.fb_account_name);
      }
    }

    // Map them back to the old format so frontend is happy
    const mapped = mappings.map(m => {
      const cleanId = String(m.fbAccountId).replace("act_", "").trim();
      return {
        accountId: m.fbAccountId,
        accountName: nameMap.get(cleanId) || m.fbAccountId,
        fbPageId: m.fbPageId,
        store: m.store ? m.store.name : "未分配",
        storeId: m.storeId,
        project: m.project || "未分配",
        owner: m.owner || "未分配"
      };
    });
    res.json(mapped);
  } catch (err: any) {
    console.error("Fetch mappings error:", err);
    res.status(500).json({
      error: "Failed to fetch mappings from DB",
      details: err.message,
      code: err.code,
    });
  }
});

router.post("/batch", async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: "Mappings array is required" });
  }

  try {
    // Filter out invalid mappings before updating DB
    const validMappings = mappings.filter((m: any) => m && m.accountId != null);

    const results = await Promise.all(
      validMappings.map(async (mapping: any) => {
        const cleanAccId = String(mapping.accountId).replace("act_", "").trim();

        const storeName = mapping.store ? String(mapping.store).trim() : null;
        let targetStoreId: number | null = null;
        if (storeName && storeName !== "未分配" && storeName !== "Unknown") {
          let store = await prisma.store.findFirst({
            where: {
              name: {
                equals: storeName,
                mode: "insensitive",
              },
            },
          });
          if (!store) {
            try {
              // Cancel the restriction and automatically create the store safely
              store = await prisma.store.upsert({
                where: { name: storeName },
                update: {},
                create: {
                  name: storeName,
                  platform: "shopline",
                },
              });
            } catch (e) {
              // Fallback selection in case of race condition
              store = await prisma.store.findFirst({
                where: {
                  name: {
                    equals: storeName,
                    mode: "insensitive",
                  },
                },
              });
            }
          }
          if (store) {
            targetStoreId = store.id;
          }
        }

        if (!targetStoreId) {
          // If no mapped store, update to storeId = null
          const upMap = await prisma.accountMapping.upsert({
            where: { fbAccountId: cleanAccId },
            update: {
              storeId: null,
              fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
              project: (mapping.project && String(mapping.project).trim() !== "未分配") ? String(mapping.project).trim() : null,
              owner: (mapping.owner && String(mapping.owner).trim() !== "未分配") ? String(mapping.owner).trim() : null,
            },
            create: {
              storeId: null,
              fbAccountId: cleanAccId,
              fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
              project: (mapping.project && String(mapping.project).trim() !== "未分配") ? String(mapping.project).trim() : null,
              owner: (mapping.owner && String(mapping.owner).trim() !== "未分配") ? String(mapping.owner).trim() : null,
            }
          });
          // Also delete corresponding AdAccount record since storeId is not nullable
          try {
            await prisma.adAccount.delete({
              where: { fb_account_id: cleanAccId }
            });
          } catch (e) {
            // ignore if not found in AdAccount
          }
          return { success: true, accountId: cleanAccId, action: 'unmapped' };
        }

        if (targetStoreId) {
          const upMap = await prisma.accountMapping.upsert({
            where: { fbAccountId: cleanAccId },
            update: {
              storeId: targetStoreId,
              fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
              project: (mapping.project && String(mapping.project).trim() !== "未分配") ? String(mapping.project).trim() : null,
              owner: (mapping.owner && String(mapping.owner).trim() !== "未分配") ? String(mapping.owner).trim() : null,
              updatedAt: new Date(),
            },
            create: {
              storeId: targetStoreId,
              fbAccountId: cleanAccId,
              fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
              project: (mapping.project && String(mapping.project).trim() !== "未分配") ? String(mapping.project).trim() : null,
              owner: (mapping.owner && String(mapping.owner).trim() !== "未分配") ? String(mapping.owner).trim() : null,
            },
          });

          // Sync with AdAccount: find corresponding Store and upsert/update store relation
          await prisma.adAccount.upsert({
            where: { fb_account_id: cleanAccId },
            update: {
              storeId: targetStoreId,
              fb_account_name: mapping.accountName ? String(mapping.accountName).trim() : "Unknown",
            },
            create: {
              fb_account_id: cleanAccId,
              fb_account_name: mapping.accountName ? String(mapping.accountName).trim() : "Unknown",
              storeId: targetStoreId,
            },
          });

          return upMap;
        } else {
          return null;
        }
      })
    );
    res.json({ success: true, count: results.filter(Boolean).length });
  } catch (err: any) {
    console.error("Batch save mappings error:", err);
    res
      .status(500)
      .json({ error: "Failed to save mappings to DB", details: err.message });
  }
});

export default router;