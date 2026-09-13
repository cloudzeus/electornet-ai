"use server";

import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { sectionByKey, isSecret } from "@/lib/settings/schema";
import { saveSetting, getSetting } from "@/lib/settings/store";
import { testSoftone, type S1Config } from "@/lib/softone";

export type ActionResult = { ok: boolean; message: string; details?: Record<string, string | number | null> };

export async function saveSection(section: string, fd: FormData): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const def = sectionByKey(section);
  if (!def) return { ok: false, message: "Άγνωστη ενότητα." };
  const values: Record<string, string | number | boolean> = {};
  const secrets: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of def.fields) {
    const raw = fd.get(f.key);
    if (isSecret(f)) {
      const v = String(raw ?? "");
      if (fd.get(`${f.key}__clear`) === "on") secrets[f.key] = "__clear__";
      else if (v) secrets[f.key] = v;
      continue;
    }
    if (f.type === "toggle") values[f.key] = raw === "on";
    else if (f.type === "number") values[f.key] = raw === null || raw === "" ? "" : Number(raw);
    else values[f.key] = String(raw ?? "").trim();
    if (f.required && (values[f.key] === "" || values[f.key] === undefined)) errors.push(f.label);
    if (f.type === "url" && values[f.key] && !/^https?:\/\//.test(String(values[f.key]))) errors.push(`${f.label}: πρέπει να ξεκινά με http(s)://`);
  }
  if (errors.length) return { ok: false, message: `Έλεγξε: ${errors.join(", ")}` };
  const r = await saveSetting(section, values, secrets, user.id);
  await audit(user.id, "settings.update", "Setting", section, r.before, { ...r.after, _secretsSet: r.secretKeys });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Αποθηκεύτηκε." };
}

/** «Δοκιμή σύνδεσης» — uses the values in the form (unsaved) merged over stored secrets. */
export async function testSection(section: string, fd: FormData): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const def = sectionByKey(section);
  if (!def?.test) return { ok: false, message: "Δεν υπάρχει δοκιμή για την ενότητα." };
  const stored = await getSetting(section);
  const val = (k: string) => String(fd.get(k) ?? stored.data[k] ?? "");
  const sec = (k: string) => String(fd.get(k) || stored.secrets[k] || "");
  try {
    if (def.test === "softone") {
      const c: S1Config = { serial: val("serial"), appId: val("appId"), username: val("username"), password: sec("password"), company: val("company"), branch: val("branch"), module: val("module") || "0", refid: val("refid") };
      if (!c.serial || !c.username || !c.password || !c.appId) return { ok: false, message: "Συμπλήρωσε serial, App ID, username και password." };
      const r = await testSoftone(c);
      await audit(user.id, "settings.test", "Setting", section, null, { ok: true, ms: r.ms });
      return { ok: true, message: `Συνδέθηκε στο SoftOne σε ${r.ms} ms.`, details: { Εταιρεία: r.company, Υποκατάστημα: r.branch, Χρήστης: r.user, Έκδοση: r.version, Serial: r.serial } };
    }
    if (def.test === "anthropic") {
      const key = sec("anthropicApiKey");
      if (!key) return { ok: false, message: "Δώσε Anthropic API key." };
      const res = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { ok: false, message: `Anthropic: ${res.status} ${res.statusText}` };
      const j = (await res.json()) as { data?: { id: string }[] };
      return { ok: true, message: "Το κλειδί είναι έγκυρο.", details: { Μοντέλα: j.data?.length ?? 0 } };
    }
    if (def.test === "bunny") {
      const zone = val("storageZone");
      const pw = sec("storagePassword");
      if (!zone || !pw) return { ok: false, message: "Δώσε storage zone και password." };
      const region = val("storageRegion");
      const host = `https://${region ? `${region}.` : ""}storage.bunnycdn.com`;
      const t0 = Date.now();
      const res = await fetch(`${host}/${zone}/`, { headers: { AccessKey: pw, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (res.status === 401) return { ok: false, message: "Bunny Storage: λάθος password ή zone." };
      if (!res.ok) return { ok: false, message: `Bunny Storage: ${res.status} ${res.statusText}` };
      const list = (await res.json()) as { ObjectName: string; IsDirectory: boolean }[];
      const details: Record<string, string | number | null> = { Zone: zone, Endpoint: host, "Αντικείμενα (root)": list.length, Χρόνος: `${Date.now() - t0} ms` };
      const acct = sec("accountApiKey");
      const pz = val("pullZoneId");
      if (acct && pz) {
        const r2 = await fetch(`https://api.bunny.net/pullzone/${pz}`, { headers: { AccessKey: acct, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        details["Pull zone"] = r2.ok ? ((await r2.json()) as { Name?: string }).Name ?? pz : `σφάλμα ${r2.status}`;
      }
      return { ok: true, message: "Η σύνδεση με το Bunny λειτουργεί.", details };
    }
    if (def.test === "smtp") {
      const host = val("smtpHost");
      const port = Number(val("smtpPort") || 587);
      if (val("transport") !== "smtp") return { ok: false, message: "Η δοκιμή αφορά μόνο SMTP· οι πάροχοι API ελέγχονται στην πρώτη αποστολή." };
      if (!host) return { ok: false, message: "Δώσε SMTP host." };
      const net = await import("node:net");
      const ok = await new Promise<boolean>((resolve) => {
        const s = net.createConnection({ host, port, timeout: 6000 }, () => { s.end(); resolve(true); });
        s.on("error", () => resolve(false));
        s.on("timeout", () => { s.destroy(); resolve(false); });
      });
      return ok ? { ok: true, message: `Ο SMTP server ${host}:${port} απαντά.` } : { ok: false, message: `Δεν ανοίγει σύνδεση στο ${host}:${port}.` };
    }
    return { ok: false, message: "Άγνωστη δοκιμή." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Αποτυχία δοκιμής." };
  }
}

/** API keys: generated once, only the hash is stored. */
export async function createApiKey(fd: FormData): Promise<ActionResult & { key?: string }> {
  const user = await requireSuperAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const scopes = String(fd.get("scopes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!name) return { ok: false, message: "Δώσε όνομα κλειδιού." };
  const key = `eu_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const row = await db.apiKey.create({ data: { name, prefix: key.slice(0, 11), hash, scopes, createdBy: user.id } });
  await audit(user.id, "apikey.create", "ApiKey", row.id, null, { name, scopes, prefix: row.prefix });
  revalidatePath("/admin/settings/api-keys");
  return { ok: true, message: "Το κλειδί δημιουργήθηκε. Αντίγραψέ το τώρα, δεν θα εμφανιστεί ξανά.", key };
}

export async function toggleApiKey(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const row = await db.apiKey.update({ where: { id }, data: { active } });
  await audit(user.id, active ? "apikey.enable" : "apikey.revoke", "ApiKey", id, null, { name: row.name, active });
  revalidatePath("/admin/settings/api-keys");
  return { ok: true, message: active ? "Ενεργοποιήθηκε." : "Ανακλήθηκε." };
}
