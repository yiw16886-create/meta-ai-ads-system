/**
 * AES-256-GCM 加密/解密工具
 * 用于保护数据库中的 Facebook Access Token 等敏感字段
 *
 * 加密格式: base64(iv(12 bytes) + authTag(16 bytes) + ciphertext)
 */

import crypto from "crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 推荐 12 字节
const AUTH_TAG_LENGTH = 16; // GCM 认证标签 16 字节
const ENCRYPTION_PREFIX = "AES256GCM:";

/**
 * 检查是否启用了字段级加密
 * 当 ENCRYPTION_KEY 未设置时，自动降级为明文存储（个人使用场景下可接受）
 */
export function isEncryptionEnabled(): boolean {
  return !!config.encryptionKey && config.encryptionKey.trim() !== "";
}

function getKey(): Buffer {
  const keyHex = config.encryptionKey;
  if (!keyHex) {
    throw new Error("ENCRYPTION_KEY 环境变量未设置，无法进行加密操作");
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY 必须为 32 字节（64 位 hex），当前为 ${key.length} 字节`);
  }
  return key;
}

/**
 * 加密明文 Token
 */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (!plaintext || plaintext.trim() === "") return null;

  // 如果已经加密过，直接返回
  if (plaintext.startsWith(ENCRYPTION_PREFIX)) return plaintext;

  // 未启用加密时，直接返回明文（个人使用场景，数据库已受 Neon 安全保护）
  if (!isEncryptionEnabled()) {
    return plaintext;
  }

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag();

    // 格式: prefix + base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, "base64")]);
    return ENCRYPTION_PREFIX + combined.toString("base64");
  } catch (error) {
    console.error("[Crypto] 加密失败:", error);
    // 加密失败时返回原文（降级，避免数据丢失）
    return plaintext;
  }
}

/**
 * 解密密文 Token
 */
export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (!ciphertext || ciphertext.trim() === "") return null;

  // 如果未加密（没有前缀），直接返回原文
  if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) return ciphertext;

  // 未启用加密但遇到了加密格式的数据（密钥已移除场景），返回 null
  if (!isEncryptionEnabled()) {
    console.warn("[Crypto] 检测到加密 Token 但 ENCRYPTION_KEY 未设置，无法解密");
    return null;
  }

  try {
    const key = getKey();
    const combined = Buffer.from(ciphertext.slice(ENCRYPTION_PREFIX.length), "base64");

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("[Crypto] 解密失败，Token 可能已损坏或密钥不匹配:", error);
    // 解密失败返回 null（而不是返回密文，避免下游误用）
    return null;
  }
}

/**
 * 判断字符串是否已加密
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!(value && value.startsWith(ENCRYPTION_PREFIX));
}
