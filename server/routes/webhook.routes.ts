import { Router } from "express";
import { neon } from "@neondatabase/serverless";
import prisma from "../../db/index.js";

const router = Router();

// 1. 动态检测数据库中是否存在 Material / material / materials / Materials 表及其字段
async function getActualTableNameAndFields(sql: any) {
  let tableName = "Material";
  let hasUpdatedAt = false;
  try {
    const tableRows = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND LOWER(table_name) IN ('material', 'materials')
      LIMIT 1
    `;
    if (tableRows && tableRows.length > 0) {
      tableName = tableRows[0].table_name;
    }

    const colRows = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND LOWER(table_name) = LOWER(${tableName})
        AND column_name = 'updatedAt'
      LIMIT 1
    `;
    if (colRows && colRows.length > 0) {
      hasUpdatedAt = true;
    }
  } catch (e: any) {
    console.warn("[Express Webhook] Failed to dynamically inspect schema with Neon:", e.message);
  }
  return { tableName, hasUpdatedAt };
}

async function getActualTableNameAndFieldsPrisma() {
  let tableName = "Material";
  let hasUpdatedAt = false;
  try {
    const tableRows: any[] = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND LOWER(table_name) IN ('material', 'materials')
      LIMIT 1
    `;
    if (tableRows && tableRows.length > 0) {
      tableName = tableRows[0].table_name;
    }

    const colRows: any[] = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND LOWER(table_name) = LOWER(${tableName})
        AND column_name = 'updatedAt'
      LIMIT 1
    `;
    if (colRows && colRows.length > 0) {
      hasUpdatedAt = true;
    }
  } catch (e: any) {
    console.warn("[Express Webhook] Prisma failed to dynamically inspect schema:", e.message);
  }
  return { tableName, hasUpdatedAt };
}

// 2. 素材 webhook 及增量同步接口
router.post("/material", async (req, res) => {
  // 安全校验（可选 Token 校验）
  const secretHeader = req.headers["x-webhook-secret"];
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (webhookSecret && secretHeader && secretHeader !== webhookSecret) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { materialId, status, resultUrl, items, lastSyncTime } = req.body;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(500).json({ success: false, error: "DATABASE_URL is not configured" });
    }

    const sql = neon(databaseUrl);
    const { tableName, hasUpdatedAt } = await getActualTableNameAndFields(sql);

    let updatedCount = 0;

    // 场景 A: 批量增量同步数组 items
    const rawItems = Array.isArray(items) ? items : (materialId ? [{ materialId, status, resultUrl }] : []);

    if (rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields (materialId/status/resultUrl or items array)"
      });
    }

    // 校验 items 有效性
    const validItems = rawItems.filter(item => {
      const name = item.name || item.material_name || '';
      if (!name) return true;
      return String(name).trim().length > 0;
    });

    for (const item of validItems) {
      const mId = item.materialId || item.id || item.creative_id;
      const mStatus = item.status || 'ACTIVE';
      const mResultUrl = item.resultUrl || item.preview_url || item.landing_url || null;
      const mName = item.name || item.material_name || null;
      const mAccount = item.accountId || item.account_id || null;

      if (!mId) continue;

      try {
        // 使用 PostgreSQL 原生 ON CONFLICT 保持幂等，只在真正发生变化时才更新（避免无意义的写入开销）
        if (tableName === "Material") {
          await sql`
            INSERT INTO "Material" ("id", "name", "status", "resultUrl", "account_id", "updatedAt")
            VALUES (${mId}, ${mName}, ${mStatus}, ${mResultUrl}, ${mAccount}, NOW())
            ON CONFLICT ("id") 
            DO UPDATE SET 
              "status" = EXCLUDED."status",
              "resultUrl" = EXCLUDED."resultUrl",
              "updatedAt" = NOW()
            WHERE "Material"."status" IS DISTINCT FROM EXCLUDED."status"
               OR "Material"."resultUrl" IS DISTINCT FROM EXCLUDED."resultUrl";
          `;
        } else if (tableName === "material") {
          await sql`
            INSERT INTO "material" ("id", "name", "status", "resultUrl", "account_id", "updatedAt")
            VALUES (${mId}, ${mName}, ${mStatus}, ${mResultUrl}, ${mAccount}, NOW())
            ON CONFLICT ("id") 
            DO UPDATE SET 
              "status" = EXCLUDED."status",
              "resultUrl" = EXCLUDED."resultUrl",
              "updatedAt" = NOW()
            WHERE "material"."status" IS DISTINCT FROM EXCLUDED."status"
               OR "material"."resultUrl" IS DISTINCT FROM EXCLUDED."resultUrl";
          `;
        } else {
          // UPDATE fallback
          await sql`
            UPDATE "Material" 
            SET "status" = ${mStatus}, "resultUrl" = ${mResultUrl}, "updatedAt" = NOW() 
            WHERE "id" = ${mId} 
              AND ("status" IS DISTINCT FROM ${mStatus} OR "resultUrl" IS DISTINCT FROM ${mResultUrl});
          `;
        }
        updatedCount++;
      } catch (err: any) {
        // Fallback for missing columns on old tables
        await sql`
          UPDATE "Material" 
          SET "status" = ${mStatus}, "resultUrl" = ${mResultUrl} 
          WHERE "id" = ${mId};
        `.catch(() => {});
      }
    }

    console.log(`[Express Webhook] Batch updated ${updatedCount} items in table "${tableName}".`);

    return res.json({
      success: true,
      updatedCount,
      syncTimestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[Express Webhook] Material update failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
