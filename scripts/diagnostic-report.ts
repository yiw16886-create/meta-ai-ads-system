import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function runDiagnosticReport() {
  console.log("================================================================");
  console.log("       DAILY INSIGHTS (`AdInsight`) DIAGNOSTIC REPORT          ");
  console.log("================================================================");
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // 1. Verify Table Schema and Columns
    console.log("----------------------------------------------------------------");
    console.log(" 1. TABLE SCHEMA & COLUMN DEFINITION VERIFICATION");
    console.log("----------------------------------------------------------------");

    // Discover table names in schema
    const tables: Array<{ table_name: string }> = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('AdInsight', 'daily_insights', 'ad_insights')
    `;

    const targetTableName = tables[0]?.table_name || "AdInsight";
    console.log(`Target Table Identified: "${targetTableName}"`);

    const columns: Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }> = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${targetTableName}'
      ORDER BY ordinal_position
    `);

    console.log(`Columns found (${columns.length}):`);
    columns.forEach(col => {
      console.log(` - ${col.column_name.padEnd(20)} | Type: ${col.data_type.padEnd(15)} | Nullable: ${col.is_nullable} | Default: ${col.column_default || "None"}`);
    });

    // Count total rows
    const totalCountResult: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM "${targetTableName}"
    `);
    const totalRows = Number(totalCountResult[0]?.count || 0);
    console.log(`\nTotal Records in "${targetTableName}": ${totalRows}`);

    // 2. Index & Constraint Verification
    console.log("\n----------------------------------------------------------------");
    console.log(" 2. UNIQUE INDEX & CONSTRAINT VERIFICATION");
    console.log("----------------------------------------------------------------");

    const indexes: Array<{
      indexname: string;
      indexdef: string;
    }> = await prisma.$queryRawUnsafe(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = '${targetTableName}'
    `);

    console.log(`Indexes defined on "${targetTableName}" (${indexes.length}):`);
    indexes.forEach(idx => {
      console.log(` - ${idx.indexname}: ${idx.indexdef}`);
    });

    // Check specifically for UNIQUE(accountId, date) or UNIQUE(account_id, date)
    const uniqueIndexMatch = indexes.find(idx => {
      const defUpper = idx.indexdef.toUpperCase();
      return (
        defUpper.includes("UNIQUE INDEX") &&
        ((defUpper.includes("ACCOUNTID") && defUpper.includes("DATE")) ||
         (defUpper.includes("ACCOUNT_ID") && defUpper.includes("DATE")))
      );
    });

    if (uniqueIndexMatch) {
      console.log(`\n✅ SCHEMA CHECK PASSED: UNIQUE index exists!`);
      console.log(`   Index Name: ${uniqueIndexMatch.indexname}`);
      console.log(`   Definition: ${uniqueIndexMatch.indexdef}`);
    } else {
      console.log(`\n⚠️ SCHEMA WARNING: UNIQUE(account_id, date) index was NOT detected in PostgreSQL indexes.`);
      console.log(`   Recommendation: Apply 'npx prisma db push' or create index manually.`);
    }

    // 3. Duplicate Rows Identification
    console.log("\n----------------------------------------------------------------");
    console.log(" 3. RESIDUAL DUPLICATE ROWS IDENTIFICATION");
    console.log("----------------------------------------------------------------");

    // Check account column name in schema
    const hasAccountIdCamel = columns.some(c => c.column_name === "accountId");
    const accountCol = hasAccountIdCamel ? `"accountId"` : `"account_id"`;

    const duplicates: Array<{
      account: string;
      date: string;
      dup_count: bigint;
      ids: string;
    }> = await prisma.$queryRawUnsafe(`
      SELECT ${accountCol} as account, "date", COUNT(*) as dup_count, string_agg(id::text, ', ' ORDER BY id ASC) as ids
      FROM "${targetTableName}"
      GROUP BY ${accountCol}, "date"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, "date" DESC
      LIMIT 100
    `);

    if (duplicates.length === 0) {
      console.log(`✅ DUPLICATE CHECK PASSED: Zero residual duplicate rows detected!`);
      console.log(`   The dataset is 100% clean across all (accountId, date) pairs.`);
    } else {
      const totalDuplicateGroups = duplicates.length;
      let totalRedundantRows = 0;
      duplicates.forEach(d => {
        totalRedundantRows += Number(d.dup_count) - 1;
      });

      console.log(`⚠️ DUPLICATES DETECTED: Found ${totalDuplicateGroups} duplicate group(s) with ${totalRedundantRows} redundant row(s)!\n`);
      console.log(`Sample Duplicate Records (Top ${Math.min(duplicates.length, 20)}):`);
      duplicates.slice(0, 20).forEach((dup, idx) => {
        console.log(` ${idx + 1}. Account: ${dup.account} | Date: ${dup.date} | Copies: ${dup.dup_count} | Row IDs: [${dup.ids}]`);
      });
    }

    // 4. Summary & Action Items
    console.log("\n----------------------------------------------------------------");
    console.log(" 4. DIAGNOSTIC SUMMARY & RECOMMENDATIONS");
    console.log("----------------------------------------------------------------");

    if (uniqueIndexMatch && duplicates.length === 0) {
      console.log(`STATUS: READY FOR FULL RE-SYNC 🚀`);
      console.log(` - Table schema is valid.`);
      console.log(` - UNIQUE index on (${accountCol}, date) is active.`);
      console.log(` - 0 duplicate records exist.`);
      console.log(` - Re-sync operations can safely proceed with UPSERT functionality.`);
    } else {
      console.log(`STATUS: ACTION REQUIRED BEFORE FULL RE-SYNC 🛠️`);
      if (duplicates.length > 0) {
        console.log(`\nCleanup SQL to remove duplicates while keeping the latest record (max ID):`);
        console.log(`----------------------------------------------------------------`);
        console.log(`DELETE FROM "${targetTableName}" a`);
        console.log(`USING "${targetTableName}" b`);
        console.log(`WHERE a.${accountCol} = b.${accountCol}`);
        console.log(`  AND a.date = b.date`);
        console.log(`  AND a.id < b.id;`);
        console.log(`----------------------------------------------------------------`);
      }
      if (!uniqueIndexMatch) {
        console.log(`\nSQL to manually create UNIQUE index if required:`);
        console.log(`CREATE UNIQUE INDEX "${targetTableName}_accountId_date_key" ON "${targetTableName}" (${accountCol}, "date");`);
      }
    }

    console.log("================================================================\n");

    return {
      tableName: targetTableName,
      totalRows,
      uniqueIndexExists: !!uniqueIndexMatch,
      uniqueIndexName: uniqueIndexMatch?.indexname || null,
      duplicateGroupsCount: duplicates.length,
      duplicates
    };
  } catch (error: any) {
    console.error("Diagnostic Report Generation Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDiagnosticReport().catch(err => {
    console.error("Execution failed:", err);
    process.exit(1);
  });
}
