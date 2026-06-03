import { Request, Response, NextFunction } from "express";
import prisma from "../db";

export class MappingsController {
  static async listMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mappings = await prisma.accountMapping.findMany({
        include: { store: true }
      });

      const monitoringData = await prisma.metaAccountMonitoring.findMany({
        select: { accountId: true, accountName: true },
      });
      
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
          project: m.project || "未分配",
          owner: m.owner || "未分配"
        };
      });
      res.json(mapped);
    } catch (err) {
      next(err);
    }
  }

  static async batchUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { mappings } = req.body;
    if (!Array.isArray(mappings)) {
      res.status(400).json({ error: "Mappings array is required" });
      return;
    }

    try {
      // Filter out invalid mappings before updating DB
      const validMappings = mappings.filter((m: any) => m && m.accountId != null);

      const results = await Promise.all(
        validMappings.map(async (mapping: any) => {
          const cleanAccId = String(mapping.accountId).replace("act_", "").trim();
          const mappingName = mapping.accountName
            ? String(mapping.accountName)
            : "Unknown";

          const storeName = mapping.store ? String(mapping.store).trim() : null;
          let targetStoreId: number | null = null;
          if (storeName && storeName !== "未分配" && storeName !== "Unknown") {
            const store = await prisma.store.findFirst({
              where: {
                name: {
                  equals: storeName,
                  mode: "insensitive",
                },
              },
            });
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
            return { success: true, accountId: cleanAccId, action: 'unmapped' };
          }

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
              fb_account_name: mappingName,
            },
            create: {
              fb_account_id: cleanAccId,
              fb_account_name: mappingName,
              storeId: targetStoreId,
            },
          });

          return upMap;
        })
      );
      res.json({ success: true, count: results.filter(Boolean).length });
    } catch (err) {
      next(err);
    }
  }
}
