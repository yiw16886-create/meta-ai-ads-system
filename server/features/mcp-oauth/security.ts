import crypto from "crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("base64url");
}

export function verifyS256(verifier: string, challenge: string) {
  const actual = Buffer.from(hashSecret(verifier));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function validPkceValue(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}
