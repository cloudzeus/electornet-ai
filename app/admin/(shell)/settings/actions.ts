"use server";

import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { sectionByKey, isSecret } from "@/lib/settings/schema";
import { saveSetting, getSetting } from "@/lib/settings/store";
import { testSoftone, s1Login, type S1Config } from "@/lib/softone";

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
    if (f.type === "softone-objs") {
      for (const k of ["company", "branch", "module", "refid"]) values[k] = String(fd.get(k) ?? "").trim();
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
      const c: S1Config = { url: val("url") || val("serial"), appId: val("appId"), username: val("username"), password: sec("password"), company: val("company"), branch: val("branch"), module: val("module") || "0", refid: val("refid") };
      if (!c.url || !c.username || !c.password || !c.appId) return { ok: false, message: "Συμπλήρωσε URL, App ID, username και password." };
      const r = await testSoftone(c);
      await audit(user.id, "settings.test", "Setting", section, null, { ok: true, ms: r.ms });
      return { ok: true, message: `Συνδέθηκε στο SoftOne σε ${r.ms} ms.`, details: { Εταιρεία: r.company, Υποκατάστημα: r.branch, Χρήστης: r.user, Έκδοση: r.version, Serial: r.serial } };
    }
    if (def.test === "openrouter") {
      const key = sec("openrouterApiKey");
      if (!key) return { ok: false, message: "Δώσε OpenRouter API key." };
      const t0 = Date.now();
      const me = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
      if (me.status === 401) return { ok: false, message: "OpenRouter: μη έγκυρο κλειδί." };
      if (!me.ok) return { ok: false, message: `OpenRouter: ${me.status} ${me.statusText}` };
      const k = (await me.json()) as { data?: { label?: string; usage?: number; limit?: number | null; is_free_tier?: boolean } };
      const details: Record<string, string | number | null> = { Κλειδί: k.data?.label ?? "—", "Χρήση ($)": k.data?.usage != null ? Number(k.data.usage.toFixed(4)) : null, "Όριο ($)": k.data?.limit ?? "χωρίς όριο", Χρόνος: `${Date.now() - t0} ms` };
      const model = val("model");
      if (model) {
        const { chat } = await import("@/lib/ai/openrouter");
        const r = await chat({ feature: "test", messages: [{ role: "user", content: "Απάντησε μόνο: OK" }], maxTokens: 5, override: { apiKey: key, model } }).catch((e: Error) => ({ error: e.message }));
        details[`Μοντέλο ${model}`] = "error" in r ? `σφάλμα: ${r.error.slice(0, 120)}` : `${r.text.trim().slice(0, 20)} · ${r.ms} ms · $${r.costUsd.toFixed(5)}`;
      }
      return { ok: true, message: "Η σύνδεση με το OpenRouter λειτουργεί.", details };
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

/** Per-model markup (super-admin). `model` "*" is the default for unlisted models. */
export async function saveMarkup(rows: { model: string; markupPct: number | null; note?: string }[]): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const before = await db.aiModelPricing.findMany();
  await db.$transaction(
    rows.map((r) =>
      r.markupPct === null || Number.isNaN(r.markupPct)
        ? db.aiModelPricing.deleteMany({ where: { model: r.model } })
        : db.aiModelPricing.upsert({ where: { model: r.model }, update: { markupPct: r.markupPct, note: r.note || null, updatedBy: user.id }, create: { model: r.model, markupPct: r.markupPct, note: r.note || null, updatedBy: user.id } }),
    ),
  );
  await audit(user.id, "ai.markup.update", "AiModelPricing", "*", Object.fromEntries(before.map((b) => [b.model, b.markupPct])), Object.fromEntries(rows.filter((r) => r.markupPct !== null).map((r) => [r.model, r.markupPct])));
  revalidatePath("/admin/settings/ai-markup");
  return { ok: true, message: "Το markup αποθηκεύτηκε. Ισχύει για τις επόμενες κλήσεις." };
}

/** SoftOne step 1 (login) with the values in the form: returns the company / branch / module / refid combinations the user may pick. */
export async function softoneObjects(fd: FormData): Promise<{ ok: true; objs: { company: string; companyName: string; branch: string; branchName: string; module: string; moduleName: string; refid: string; refidName: string }[]; version: string | null } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const stored = await getSetting("softone");
  const val = (k: string) => String(fd.get(k) ?? stored.data[k] ?? "");
  const password = String(fd.get("password") || stored.secrets.password || "");
  const url = val("url") || val("serial");
  if (!url || !val("appId") || !val("username") || !password) return { ok: false, error: "Συμπλήρωσε URL, App ID, username και password." };
  try {
    const r = await s1Login({ url, appId: val("appId"), username: val("username"), password, company: "", branch: "", module: "", refid: "" });
    return {
      ok: true,
      version: r.ver ?? null,
      objs: (r.objs ?? []).map((o) => ({ company: String(o.COMPANY), companyName: o.COMPANYNAME ?? "", branch: String(o.BRANCH), branchName: o.BRANCHNAME ?? "", module: String(o.MODULE), moduleName: o.MODULENAME ?? "", refid: String(o.REFID), refidName: o.REFIDNAME ?? "" })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Αποτυχία login." };
  }
}
