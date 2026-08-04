import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { prisma } from "../../../../db/index.js";

async function getActualTableNameAndFields(sql: any) {
  let tableName = "Material";
  let hasUpdatedAt = false;
  try {
    const tableRows = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' 
        AND LOWER(table_name) IN ('material', 'materials')
      LIMIT 1
    `;
    if (tableRows && tableRows.length > 0) {
      tableName = tableRows[0].table_name;
    }
    
    const colRows = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' 
        AND table_name=${tableName} 
        AND LOWER(column_name) IN ('updatedat', 'updated_at')
      LIMIT 1
    `;
    if (colRows && colRows.length > 0) {
      hasUpdatedAt = true;
    }
  } catch (e: any) {
    console.warn("[Webhook] Failed to dynamically inspect schema via Neon:", e.message);
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
      WHERE table_schema='public' 
        AND LOWER(table_name) IN ('material', 'materials')
      LIMIT 1
    `;
    if (tableRows && tableRows.length > 0) {
      tableName = tableRows[0].table_name;
    }
    
    const colRows: any[] = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' 
        AND table_name=${tableName} 
        AND LOWER(column_name) IN ('updatedat', 'updated_at')
      LIMIT 1
    `;
    if (colRows && colRows.length > 0) {
      hasUpdatedAt = true;
    }
  } catch (e: any) {
    console.warn("[Webhook] Prisma failed to dynamically inspect schema:", e.message);
  }
  return { tableName, hasUpdatedAt };
}

export async function POST(req: NextRequest) {
  // Validate Security
  const secretHeader = req.headers.get("x-webhook-secret");
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret || secretHeader !== webhookSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { materialId, status, resultUrl } = body;

    if (!materialId || !status || !resultUrl) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (materialId, status, resultUrl)" },
        { status: 400 }
      );
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        { success: false, error: "DATABASE_URL is not configured" },
        { status: 500 }
      );
    }

    // Attempt updating via @neondatabase/serverless
    try {
      const sql = neon(databaseUrl);
      const { tableName, hasUpdatedAt } = await getActualTableNameAndFields(sql);

      if (hasUpdatedAt) {
        if (tableName === "Material") {
          await sql`UPDATE "Material" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        } else if (tableName === "material") {
          await sql`UPDATE "material" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        } else if (tableName === "materials") {
          await sql`UPDATE "materials" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        } else if (tableName === "Materials") {
          await sql`UPDATE "Materials" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        }
      } else {
        if (tableName === "Material") {
          await sql`UPDATE "Material" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        } else if (tableName === "material") {
          await sql`UPDATE "material" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        } else if (tableName === "materials") {
          await sql`UPDATE "materials" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        } else if (tableName === "Materials") {
          await sql`UPDATE "Materials" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        }
      }
      console.log(`[Webhook] Material ${materialId} successfully updated in database table "${tableName}" via Neon.`);
    } catch (neonError: any) {
      console.warn("[Webhook] Neon direct update failed, trying fallback Prisma raw SQL:", neonError.message);
      
      const { tableName, hasUpdatedAt } = await getActualTableNameAndFieldsPrisma();

      // Fallback: Prisma executeRaw
      if (hasUpdatedAt) {
        if (tableName === "Material") {
          await prisma.$executeRaw`UPDATE "Material" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        } else if (tableName === "material") {
          await prisma.$executeRaw`UPDATE "material" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        } else if (tableName === "materials") {
          await prisma.$executeRaw`UPDATE "materials" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        } else if (tableName === "Materials") {
          await prisma.$executeRaw`UPDATE "Materials" SET "status" = ${status}, "resultUrl" = ${resultUrl}, "updatedAt" = NOW() WHERE "id" = ${materialId}`;
        }
      } else {
        if (tableName === "Material") {
          await prisma.$executeRaw`UPDATE "Material" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        } else if (tableName === "material") {
          await prisma.$executeRaw`UPDATE "material" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        } else if (tableName === "materials") {
          await prisma.$executeRaw`UPDATE "materials" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        } else if (tableName === "Materials") {
          await prisma.$executeRaw`UPDATE "Materials" SET "status" = ${status}, "resultUrl" = ${resultUrl} WHERE "id" = ${materialId}`;
        }
      }
      console.log(`[Webhook] Material ${materialId} successfully updated in database table "${tableName}" via Prisma fallback.`);
    }

    return NextResponse.json({ success: true, status: 200 });
  } catch (error: any) {
    console.error("[Webhook] Material update failed:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
