import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM for secret settings. Key = sha256(SETTINGS_KEY || AUTH_SECRET). Rotate by re-saving sections. */
function key() {
  const src = process.env.SETTINGS_KEY || process.env.AUTH_SECRET;
  if (!src) throw new Error("SETTINGS_KEY or AUTH_SECRET must be set to store secrets");
  return createHash("sha256").update(src).digest();
}

export function encryptJson(obj: Record<string, string>): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptJson(s: string | null | undefined): Record<string, string> {
  if (!s) return {};
  const [v, iv, tag, enc] = s.split(".");
  if (v !== "v1") return {};
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8"));
  } catch {
    return {};
  }
}
