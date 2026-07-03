import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { requireEnv } from "@/lib/env";

/**
 * Symmetric encryption for third-party secrets at rest (e.g. Canva OAuth
 * tokens). AES-256-GCM; key is TOKEN_ENC_KEY (32 bytes, base64). Output is
 * base64url(iv ‖ authTag ‖ ciphertext) — a single opaque string per secret.
 *
 * Distinct from src/lib/engageTokens.ts, which SIGNS (HMAC) but does not hide.
 */

const IV_LEN = 12; // GCM standard nonce size
const TAG_LEN = 16;

function getKey(): Buffer {
  const key = Buffer.from(requireEnv("TOKEN_ENC_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENC_KEY must be 32 bytes of base64 (generate: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")",
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSecret(enc: string): string {
  const raw = Buffer.from(enc, "base64url");
  if (raw.length < IV_LEN + TAG_LEN + 1) throw new Error("encrypted payload too short");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("decryptSecret: authentication failed (wrong key or tampered payload)");
  }
}
