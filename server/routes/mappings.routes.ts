import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

router.get("/available-accounts", async (req: any, res) => {
  try {
    const userId = Number(req.user?.id || req.user?.userId);

    const adAccounts = await prisma.adAccount.findMany({
      where: userId ? { OR: [{ userId }, { userId: null }] } : {},
      select: { fb_account_id: true, fb_account_name: true }
    });

    const mappings = await prisma.accountMapping.findMany({
      where: userId ? { OR: [{ userId }, { userId: null }] } : {},
      select: { fbAccountId: true, name: true }
    });

    const insights = await prisma.adInsight.findMany({
      select: { accountId: true, accountName: true },
      distinct: ['accountId']
    });

    const uniqueMap = new Map();
    adAccounts.forEach(a => {
      const clean = String(a.fb_account_id).replace("act_", "").trim();
      uniqueMap.set(clean, { accountId: clean, accountName: a.fb_account_name || clean });
    });
    mappings.forEach(m => {
      const clean = String(m.fbAccountId).replace("act_", "").trim();
      if (!uniqueMap.has(clean)) {
        uniqueMap.set(clean, { accountId: clean, accountName: m.name || clean });
      }
    });
    insights.forEach(i => {
      const clean = String(i.accountId).replace("act_", "").trim();
      if (!uniqueMap.has(clean)) {
        uniqueMap.set(clean, { accountId: clean, accountName: i.accountName || clean });
      }
    });

    return res.json({ success: true, data: Array.from(uniqueMap.values()) });
  } catch (error: any) {
    console.error("Fetch available accounts error:", error);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const userId = Number(req.user?.id || req.user?.userId);
    if (!userId) {
      return res.status(401).json({ error: "用户未登录" });
    }

    const { accountId, storeId, fbPageId, project, owner } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const cleanAccId = String(accountId).replace("act_", "").trim();
    const targetStoreId = storeId ? Number(storeId) : null;

    const mapping = await prisma.accountMapping.upsert({
      where: { fbAccountId: cleanAccId },
      update: {
        storeId: targetStoreId,
        userId,
        fbPageId: fbPageId ? String(fbPageId) : null,
        project: project ? String(project) : null,
        owner: owner ? String(owner) : null,
        updatedAt: new Date(),
      },
      create: {
        fbAccountId: cleanAccId,
        storeId: targetStoreId,
        userId,
        fbPageId: fbPageId ? String(fbPageId) : null,
        project: project ? String(project) : null,
        owner: owner ? String(owner) : null,
      },
    });

    if (targetStoreId) {
      await prisma.adAccount.upsert({
        where: { fb_account_id: cleanAccId },
        update: {
          storeId: targetStoreId,
          userId,
        },
        create: {
          fb_account_id: cleanAccId,
          fb_account_name: cleanAccId,
          storeId: targetStoreId,
          userId,
        },
      });
    }

    return res.json({ success: true, mapping });
  } catch (error: any) {
    console.error("Save account mapping error:", error);
    return res.status(500).json({ error: error.message || "关联映射操作失败" });
  }
});

router.get("/", async (req: any, res) => {
  try {
    const { activeOnly } = req.query;
    const userId = req.user?.id || req.user?.userId;
    const numUserId = userId ? Number(userId) : null;

    const mappings = await prisma.accountMapping.findMany({
      where: numUserId ? { OR: [{ userId: numUserId }, { userId: null }] } : {},
      include: { store: true },
    });

    const adAccountData = await prisma.adAccount.findMany({
      where: numUserId ? { OR: [{ userId: numUserId }, { userId: null }] } : {},
      select: { fb_account_id: true, fb_account_name: true },
    });

    const monitoringData = await prisma.metaAccountMonitoring.findMany({
      select: { accountId: true, accountName: true, activityStatus: true },
    });

    const insightData = await prisma.adInsight.findMany({
      select: { accountId: true, accountName: true },
      distinct: ['accountId']
    });

    const nameMap = new Map<string, string>();
    for (const d of monitoringData) {
      if (d.accountName) {
        nameMap.set(String(d.accountId).replace("act_", "").trim(), d.accountName);
      }
    }
    for (const d of adAccountData) {
      if (d.fb_account_name) {
        nameMap.set(String(d.fb_account_id).replace("act_", "").trim(), d.fb_account_name);
      }
    }
    for (const d of insightData) {
      if (d.accountName) {
        const clean = String(d.accountId).replace("act_", "").trim();
        if (!nameMap.has(clean)) {
          nameMap.set(clean, d.accountName);
        }
      }
    }

    // Left-Join minded unique mapping generation: gather all unique account IDs
    const uniqueIds = new Set<string>();
    mappings.forEach((m) =>
      uniqueIds.add(String(m.fbAccountId).replace("act_", "").trim()),
    );
    monitoringData.forEach((d) =>
      uniqueIds.add(String(d.accountId).replace("act_", "").trim()),
    );
    adAccountData.forEach((d) =>
      uniqueIds.add(String(d.fb_account_id).replace("act_", "").trim()),
    );
    insightData.forEach((d) =>
      uniqueIds.add(String(d.accountId).replace("act_", "").trim()),
    );

    // Map them to format so frontend is happy
    let mapped = Array.from(uniqueIds).map((cleanId) => {
      const m = mappings.find(
        (item) =>
          String(item.fbAccountId).replace("act_", "").trim() === cleanId,
      );
      const accId = m ? m.fbAccountId : cleanId;
      const displayName = nameMap.get(cleanId) || (m && m.name ? m.name : accId);
      return {
        accountId: accId.startsWith("act_") ? accId : `act_${accId}`,
        accountName: displayName,
        fbPageId: m ? m.fbPageId : null,
        store: m && m.store ? m.store.name : "未分配",
        storeId: m ? m.storeId : null,
        project: m && m.project ? m.project : "未分配",
        owner: m && m.owner ? m.owner : "未分配",
        activityStatus:
          monitoringData.find(
            (d) => String(d.accountId).replace("act_", "").trim() === cleanId,
          )?.activityStatus || 1,
      };
    });

    if (activeOnly === "true") {
      mapped = mapped.filter((item) => (item.activityStatus || 0) < 4);
    }

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

router.post("/batch", async (req: any, res) => {
  const { mappings } = req.body;
  const userId = Number(req.user?.id || req.user?.userId);

  if (!userId) {
    return res.status(401).json({ error: "用户未登录" });
  }

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
              store = await prisma.store.upsert({
                where: { name: storeName },
                update: { userId },
                create: {
                  name: storeName,
                  platform: "shopline",
                  userId,
                },
              });
            } catch (e) {
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

        const upMap = await prisma.accountMapping.upsert({
          where: { fbAccountId: cleanAccId },
          update: {
            storeId: targetStoreId,
            userId,
            fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
            project:
              mapping.project && String(mapping.project).trim() !== "未分配"
                ? String(mapping.project).trim()
                : null,
            owner:
              mapping.owner && String(mapping.owner).trim() !== "未分配"
                ? String(mapping.owner).trim()
                : null,
            updatedAt: new Date(),
          },
          create: {
            storeId: targetStoreId,
            userId,
            fbAccountId: cleanAccId,
            fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
            project:
              mapping.project && String(mapping.project).trim() !== "未分配"
                ? String(mapping.project).trim()
                : null,
            owner:
              mapping.owner && String(mapping.owner).trim() !== "未分配"
                ? String(mapping.owner).trim()
                : null,
          },
        });

        // Ensure AdAccount record exists and points to targetStoreId
        await prisma.adAccount.upsert({
          where: { fb_account_id: cleanAccId },
          update: {
            storeId: targetStoreId,
            userId,
            fb_account_name: mapping.accountName
              ? String(mapping.accountName).trim()
              : undefined,
          },
          create: {
            fb_account_id: cleanAccId,
            fb_account_name: mapping.accountName
              ? String(mapping.accountName).trim()
              : cleanAccId,
            storeId: targetStoreId,
            userId,
          },
        });

        return upMap;
      }),
    );
    res.json({ success: true, count: results.filter(Boolean).length });
  } catch (err: any) {
    console.error("Batch save mappings error:", err);
    res
      .status(500)
      .json({ error: "Failed to save mappings to DB", details: err.message });
  }
});

router.delete("/:accountId", async (req: any, res) => {
  try {
    const { accountId } = req.params;
    const cleanAccId = String(accountId).replace("act_", "").trim();
    
    await prisma.accountMapping.deleteMany({
      where: {
        OR: [
          { fbAccountId: cleanAccId },
          { fbAccountId: `act_${cleanAccId}` }
        ]
      }
    });

    res.json({ success: true, accountId: cleanAccId });
  } catch (err: any) {
    console.error("Delete mapping error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
