import crypto from "crypto";

const RAW_KEY = process.env.ENCRYPTION_KEY;

if (!RAW_KEY && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY is not set — required to store OAuth tokens safely.");
}

function key() {
  if (!RAW_KEY) throw new Error("ENCRYPTION_KEY is not configured");
  return crypto.createHash("sha256").update(RAW_KEY, "utf8").digest();
}

export function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decrypt(cipherText: string): string {
  const [version, ivEncoded, tagEncoded, payloadEncoded] = cipherText.split(":");
  if (version !== "v2" || !ivEncoded || !tagEncoded || !payloadEncoded) {
    throw new Error("Legacy token encryption is no longer accepted. Reconnect Shopify or QuickBooks.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
