import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

router.get("/available-accounts", async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.userId ? Number(req.user?.id || req.user?.userId) : null;
    if (!userId) {
      return res.json({ success: true, data: [] });
    }

    const numUserId = userId;
    const isSuperAdmin = req.user?.role === "SUPER_ADMIN";
    
    const mappings = await prisma.accountMapping.findMany({
      ...(isSuperAdmin ? {} : { where: { OR: [{ userId: numUserId }, { userId: null }] } }),
      include: { store: true },
    });

    const adAccountData = await prisma.adAccount.findMany({
      ...(isSuperAdmin ? {} : { where: { OR: [{ userId: numUserId }, { userId: null }] } }),
      select: { fb_account_id: true, fb_account_name: true },
    });

    const monitoringData = await prisma.metaAccountMonitoring.findMany({
      select: { accountId: true, accountName: true, activityStatus: true, status: true },
    });

    const insightData = await prisma.adInsight.findMany({
      select: { accountId: true, accountName: true },
      distinct: ['accountId']
    });

    const uniqueMap = new Map();
    monitoringData.forEach(m => {
      const clean = String(m.accountId).replace("act_", "").trim();
      uniqueMap.set(clean, { accountId: clean, accountName: m.accountName || clean });
    });
    adAccountData.forEach(a => {
      const clean = String(a.fb_account_id).replace("act_", "").trim();
      if (!uniqueMap.has(clean) || uniqueMap.get(clean).accountName === clean) {
        uniqueMap.set(clean, { accountId: clean, accountName: a.fb_account_name || clean });
      }
    });
    mappings.forEach(m => {
      const clean = String(m.fbAccountId).replace("act_", "").trim();
      if (!uniqueMap.has(clean) || uniqueMap.get(clean).accountName === clean) {
        uniqueMap.set(clean, { accountId: clean, accountName: m.name || clean });
      }
    });
    insightData.forEach(i => {
      const clean = String(i.accountId).replace("act_", "").trim();
      if (!uniqueMap.has(clean) || uniqueMap.get(clean).accountName === clean) {
        uniqueMap.set(clean, { accountId: clean, accountName: i.accountName || clean });
      }
    });

    return res.json({ success: true, data: Array.from(uniqueMap.values()) });
  } catch (error: any) {
    console.error("Fetch available accounts error:", error);
    return res.json([]);
  }
});

router.post("/", async (req: any, res) => {
  try {
    const userId = Number(req.user?.id || req.user?.userId);
    if (!userId) {
      return res.status(401).json({ error: "用户未登录" });
    }

    const { accountId, storeId, store, fbPageId, project, owner, status, accountName } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const cleanAccId = String(accountId).replace("act_", "").trim();
    let targetStoreId = storeId ? Number(storeId) : null;

    if (!targetStoreId && store && String(store).trim() !== "未分配" && String(store).trim() !== "Unknown") {
      const sName = String(store).trim();
      const existing = await prisma.store.findFirst({
        where: { name: { equals: sName, mode: "insensitive" } },
      });
      if (existing) {
        targetStoreId = existing.id;
      } else if (!isNaN(Number(sName))) {
        targetStoreId = Number(sName);
      } else {
        try {
          const newStore = await prisma.store.create({
            data: { name: sName, platform: "shopline", userId },
          });
          targetStoreId = newStore.id;
        } catch (e) {
          const found = await prisma.store.findFirst({
            where: { name: { equals: sName, mode: "insensitive" } },
          });
          if (found) targetStoreId = found.id;
        }
      }
    }

    let statusVal = "ACTIVE";
    if (status) {
      const s = String(status).trim();
      if (s === "停用" || s.toUpperCase() === "DISABLED" || s === "INACTIVE" || s === "2" || s === "0") {
        statusVal = "DISABLED";
      } else if (s === "正常" || s.toUpperCase() === "ACTIVE" || s === "1") {
        statusVal = "ACTIVE";
      }
    }

    const projectValue = project && String(project).trim() !== "未分配" ? String(project).trim() : null;
    const ownerValue = owner && String(owner).trim() !== "未分配" ? String(owner).trim() : null;

    let mapping;
    try {
      mapping = await prisma.accountMapping.upsert({
        where: { fbAccountId: cleanAccId },
        update: {
          storeId: targetStoreId,
          userId,
          fbPageId: fbPageId ? String(fbPageId) : null,
          project: projectValue,
          owner: ownerValue,
          status: statusVal,
          updatedAt: new Date(),
        },
        create: {
          fbAccountId: cleanAccId,
          storeId: targetStoreId,
          userId,
          fbPageId: fbPageId ? String(fbPageId) : null,
          project: projectValue,
          owner: ownerValue,
          status: statusVal,
        },
      });
    } catch (err: any) {
      console.warn(`[Save Mapping] Retry fallback for ${cleanAccId}:`, err.message);
      await prisma.accountMapping.updateMany({
        where: { fbAccountId: cleanAccId },
        data: {
          storeId: targetStoreId,
          userId,
          fbPageId: fbPageId ? String(fbPageId) : null,
          project: projectValue,
          owner: ownerValue,
          status: statusVal,
          updatedAt: new Date(),
        },
      });
      mapping = await prisma.accountMapping.findFirst({ where: { fbAccountId: cleanAccId } });
    }

    try {
      await prisma.adAccount.upsert({
        where: { fb_account_id: cleanAccId },
        update: {
          storeId: targetStoreId,
          userId,
          fb_account_name: accountName ? String(accountName).trim() : undefined,
        },
        create: {
          fb_account_id: cleanAccId,
          fb_account_name: accountName ? String(accountName).trim() : cleanAccId,
          storeId: targetStoreId,
          userId,
        },
      });
    } catch (err: any) {
      console.warn(`[Save AdAccount] Retry fallback for ${cleanAccId}:`, err.message);
      await prisma.adAccount.updateMany({
        where: { fb_account_id: cleanAccId },
        data: {
          storeId: targetStoreId,
          userId,
          fb_account_name: accountName ? String(accountName).trim() : undefined,
        },
      });
    }

    return res.json({ success: true, mapping });
  } catch (error: any) {
    console.error("Save account mapping error:", error);
    return res.json({ error: error.message || "关联映射操作失败" });
  }
});

router.get("/", async (req: any, res) => {
  try {
    const { activeOnly } = req.query;
    const userId = req.user?.id || req.user?.userId;
    const numUserId = userId ? Number(userId) : null;

    if (!numUserId) {
      return res.json([]);
    }

    const isSuperAdmin = req.user?.role === "SUPER_ADMIN";

    const mappings = await prisma.accountMapping.findMany({
      ...(isSuperAdmin ? {} : { where: { OR: [{ userId: numUserId }, { userId: null }] } }),
      include: { store: true },
    });

    const adAccountData = await prisma.adAccount.findMany({
      ...(isSuperAdmin ? {} : { where: { OR: [{ userId: numUserId }, { userId: null }] } }),
      select: { fb_account_id: true, fb_account_name: true },
    });

    const monitoringData = await prisma.metaAccountMonitoring.findMany({
      select: { accountId: true, accountName: true, activityStatus: true, status: true },
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

    // Gather all unique account IDs across all tables
    const uniqueIds = new Set<string>();
    monitoringData.forEach((d) =>
      uniqueIds.add(String(d.accountId).replace("act_", "").trim())
    );
    mappings.forEach((m) =>
      uniqueIds.add(String(m.fbAccountId).replace("act_", "").trim())
    );
    adAccountData.forEach((d) =>
      uniqueIds.add(String(d.fb_account_id).replace("act_", "").trim())
    );
    insightData.forEach((d) =>
      uniqueIds.add(String(d.accountId).replace("act_", "").trim())
    );

    // Map them to format so frontend is happy
    let mapped = Array.from(uniqueIds).map((cleanId) => {
      const m = mappings.find(
        (item) =>
          String(item.fbAccountId).replace("act_", "").trim() === cleanId,
      );
      const accId = m ? m.fbAccountId : cleanId;
      const displayName = nameMap.get(cleanId) || (m && m.name ? m.name : accId);
      const monItem = monitoringData.find(
        (d) => String(d.accountId).replace("act_", "").trim() === cleanId,
      );

      let statusVal = "ACTIVE";
      if (m && m.status) {
        statusVal = m.status;
      } else if (monItem) {
        if (monItem.activityStatus === 4 || monItem.status === 2 || monItem.status === 3) {
          statusVal = "DISABLED";
        }
      }

      return {
        accountId: accId.startsWith("act_") ? accId : `act_${accId}`,
        accountName: displayName,
        fbPageId: m ? m.fbPageId : null,
        store: m && m.store ? m.store.name : "未分配",
        storeId: m ? m.storeId : null,
        project: m && m.project ? m.project : "未分配",
        owner: m && m.owner ? m.owner : "未分配",
        status: statusVal,
        activityStatus: monItem?.activityStatus || 1,
      };
    });

    if (activeOnly === "true") {
      mapped = mapped.filter((item) => item.status !== "DISABLED" && (item.activityStatus || 0) < 4);
    }

    res.json(mapped);
  } catch (err: any) {
    console.error("Fetch mappings error:", err);
    res.json({
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

    // Deduplicate by cleanAccId (keep latest) to prevent self-collision in array
    const deduplicatedMap = new Map<string, any>();
    for (const mapping of validMappings) {
      const cleanAccId = String(mapping.accountId).replace("act_", "").trim();
      if (cleanAccId) {
        deduplicatedMap.set(cleanAccId, mapping);
      }
    }

    const uniqueMappings = Array.from(deduplicatedMap.values());
    const results = [];

    // Pre-resolve all unique store names in one pass
    const storeNames = new Set<string>();
    for (const mapping of uniqueMappings) {
      const name = mapping.store ? String(mapping.store).trim() : null;
      if (name && name !== "未分配" && name !== "Unknown") {
        storeNames.add(name);
      }
    }

    const storeMap = new Map<string, number>();
    if (storeNames.size > 0) {
      const existingStores = await prisma.store.findMany();
      for (const s of existingStores) {
        storeMap.set(s.name.toLowerCase(), s.id);
      }

      for (const sName of storeNames) {
        if (!storeMap.has(sName.toLowerCase())) {
          try {
            const newStore = await prisma.store.upsert({
              where: { name: sName },
              update: { userId },
              create: { name: sName, platform: "shopline", userId },
            });
            storeMap.set(sName.toLowerCase(), newStore.id);
          } catch (e) {
            const found = await prisma.store.findFirst({
              where: { name: { equals: sName, mode: "insensitive" } },
            });
            if (found) storeMap.set(sName.toLowerCase(), found.id);
          }
        }
      }
    }

    // Process mappings in chunks to avoid single query bottleneck while remaining safe
    const chunkSize = 20;
    for (let i = 0; i < uniqueMappings.length; i += chunkSize) {
      const chunk = uniqueMappings.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (mapping) => {
          const cleanAccId = String(mapping.accountId).replace("act_", "").trim();
          const storeName = mapping.store ? String(mapping.store).trim() : null;
          let targetStoreId: number | null = null;

          if (storeName && storeName !== "未分配" && storeName !== "Unknown") {
            targetStoreId = storeMap.get(storeName.toLowerCase()) || null;
          }

          const projectValue =
            mapping.project && String(mapping.project).trim() !== "未分配"
              ? String(mapping.project).trim()
              : null;
          const ownerValue =
            mapping.owner && String(mapping.owner).trim() !== "未分配"
              ? String(mapping.owner).trim()
              : null;

          let statusVal: string | undefined = undefined;
          const rawStatus =
            mapping.status ||
            mapping.accountStatus ||
            mapping["状态"] ||
            mapping["账户状态"];
          if (
            rawStatus !== undefined &&
            rawStatus !== null &&
            String(rawStatus).trim() !== ""
          ) {
            const s = String(rawStatus).trim();
            if (
              s === "停用" ||
              s.toUpperCase() === "DISABLED" ||
              s === "INACTIVE" ||
              s === "2" ||
              s === "0"
            ) {
              statusVal = "DISABLED";
            } else if (
              s === "正常" ||
              s.toUpperCase() === "ACTIVE" ||
              s === "1"
            ) {
              statusVal = "ACTIVE";
            } else {
              statusVal = s;
            }
          }

          let upMap;
          try {
            upMap = await prisma.accountMapping.upsert({
              where: { fbAccountId: cleanAccId },
              update: {
                storeId: targetStoreId,
                userId,
                fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
                project: projectValue,
                owner: ownerValue,
                ...(statusVal ? { status: statusVal } : {}),
                updatedAt: new Date(),
              },
              create: {
                storeId: targetStoreId,
                userId,
                fbAccountId: cleanAccId,
                fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
                project: projectValue,
                owner: ownerValue,
                status: statusVal || "ACTIVE",
              },
            });
          } catch (mErr: any) {
            await prisma.accountMapping.updateMany({
              where: { fbAccountId: cleanAccId },
              data: {
                storeId: targetStoreId,
                userId,
                fbPageId: mapping.fbPageId ? String(mapping.fbPageId) : null,
                project: projectValue,
                owner: ownerValue,
                ...(statusVal ? { status: statusVal } : {}),
                updatedAt: new Date(),
              },
            });
            upMap = await prisma.accountMapping.findFirst({
              where: { fbAccountId: cleanAccId },
            });
          }

          try {
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
          } catch (adErr: any) {
            await prisma.adAccount.updateMany({
              where: { fb_account_id: cleanAccId },
              data: {
                storeId: targetStoreId,
                userId,
                fb_account_name: mapping.accountName
                  ? String(mapping.accountName).trim()
                  : undefined,
              },
            });
          }

          if (upMap) {
            results.push(upMap);
          }
        })
      );
    }

    res.json({ success: true, count: results.length });
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
    res.json({ error: err.message });
  }
});

export default router;
