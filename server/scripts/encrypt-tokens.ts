/**
 * Token 加密迁移脚本
 * 将数据库中已有的明文 Facebook Access Token 加密存储
 *
 * 使用方法: npx tsx server/scripts/encrypt-tokens.ts
 * 前置条件: 设置 ENCRYPTION_KEY 环境变量
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import prisma from "../../db/index.js";
import { encryptToken, isEncrypted, isEncryptionEnabled } from "../utils/crypto.js";

interface MigrationResult {
  model: string;
  field: string;
  total: number;
  encrypted: number;
  skipped: number;
  errors: number;
}

async function encryptField(
  model: any,
  field: string,
  idField: string,
  label: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    model: label,
    field,
    total: 0,
    encrypted: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const records = await model.findMany({
      where: { [field]: { not: null } },
      select: { [idField]: true, [field]: true },
    });

    result.total = records.length;

    for (const record of records) {
      const value = record[field];
      if (!value || value.trim() === "") {
        result.skipped++;
        continue;
      }

      if (isEncrypted(value)) {
        result.skipped++;
        continue;
      }

      try {
        const encrypted = encryptToken(value);
        if (encrypted && encrypted !== value) {
          await model.update({
            where: { [idField]: record[idField] },
            data: { [field]: encrypted },
          });
          result.encrypted++;
        } else {
          result.skipped++;
        }
      } catch (err) {
        console.error(`  加密失败 [${label} ${record[idField]}]:`, err);
        result.errors++;
      }
    }
  } catch (err) {
    console.error(`  查询失败 [${label}]:`, err);
    result.errors++;
  }

  return result;
}

async function main() {
  console.log("🔐 开始 Token 加密迁移...\n");

  // 检查是否启用了加密
  if (!isEncryptionEnabled()) {
    console.log("⚠️ ENCRYPTION_KEY 未设置，跳过加密迁移（Token 将以明文存储）");
    console.log("   如需启用加密，请设置 ENCRYPTION_KEY 环境变量后重新运行此脚本。");
    await prisma.$disconnect();
    return;
  }

  const results: MigrationResult[] = [];

  // 1. User.fb_access_token
  results.push(await encryptField(prisma.user, "fb_access_token", "id", "User.fb_access_token"));

  // 2. UserFacebookBinding.access_token
  results.push(await encryptField(prisma.userFacebookBinding, "access_token", "id", "UserFacebookBinding.access_token"));

  // 3. FacebookAccount.accessToken
  results.push(await encryptField(prisma.facebookAccount, "accessToken", "id", "FacebookAccount.accessToken"));

  // 4. AdAccount.fb_access_token
  results.push(await encryptField(prisma.adAccount, "fb_access_token", "id", "AdAccount.fb_access_token"));

  // 5. FacebookPage.access_token
  results.push(await encryptField(prisma.facebookPage, "access_token", "id", "FacebookPage.access_token"));

  // 6. FacebookBusinessManager.systemToken
  results.push(await encryptField(prisma.facebookBusinessManager, "systemToken", "id", "FacebookBusinessManager.systemToken"));

  // 汇总
  console.log("\n📊 迁移结果:");
  console.log("─".repeat(60));
  let totalEncrypted = 0;
  let totalErrors = 0;

  for (const r of results) {
    console.log(`  ${r.model}.${r.field}: ${r.encrypted}/${r.total} 已加密, ${r.skipped} 跳过, ${r.errors} 错误`);
    totalEncrypted += r.encrypted;
    totalErrors += r.errors;
  }

  console.log("─".repeat(60));
  console.log(`  总计: ${totalEncrypted} 个 Token 已加密, ${totalErrors} 个错误`);

  if (totalErrors > 0) {
    console.warn("\n⚠️ 存在加密错误，请检查上述错误信息。");
    process.exit(1);
  } else {
    console.log("\n✅ 迁移完成！");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("迁移失败:", err);
  process.exit(1);
});
