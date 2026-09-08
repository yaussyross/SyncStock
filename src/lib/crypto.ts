import CryptoJS from "crypto-js";

// Access tokens/refresh tokens must never be stored in plaintext.
// This encrypts them before writing to Postgres and decrypts on read.
const KEY = process.env.ENCRYPTION_KEY!;

if (!KEY && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY is not set — required to store OAuth tokens safely.");
}

export function encrypt(value: string): string {
  return CryptoJS.AES.encrypt(value, KEY).toString();
}

export function decrypt(cipherText: string): string {
  const bytes = CryptoJS.AES.decrypt(cipherText, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
