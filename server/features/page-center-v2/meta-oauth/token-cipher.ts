import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function encryptionKey(environment: NodeJS.ProcessEnv = process.env) {
  const encoded = environment.PAGE_CENTER_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("PAGE_CENTER_TOKEN_ENCRYPTION_KEY_MISSING");

  const key = /^[a-f\d]{64}$/i.test(encoded)
    ? Buffer.from(encoded, "hex")
    : Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("PAGE_CENTER_TOKEN_ENCRYPTION_KEY_INVALID");
  return key;
}

export function assertPageCenterTokenEncryptionConfigured(
  environment: NodeJS.ProcessEnv = process.env,
) {
  encryptionKey(environment);
}

export function encryptPageCenterToken(
  plaintext: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!plaintext) throw new Error("PAGE_CENTER_TOKEN_EMPTY");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(environment), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPageCenterToken(
  sealed: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = sealed.split(".");
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error("PAGE_CENTER_TOKEN_CIPHERTEXT_INVALID");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(environment),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PAGE_CENTER_")) throw error;
    throw new Error("PAGE_CENTER_TOKEN_DECRYPTION_FAILED");
  }
}
