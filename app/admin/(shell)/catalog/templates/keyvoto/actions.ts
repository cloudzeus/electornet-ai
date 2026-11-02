"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { documentFields, type DocField } from "@/lib/keyvoto/core";
import { catalogues, getKeyvotoConfig, publishers, sharedContent, testKeyvoto, tokenHeldUntil, type Publication } from "@/lib/keyvoto/client";

/**
 * Server actions της σελίδας «Keyvoto PIM». Μόνο αναγνώσεις: δοκιμή σύνδεσης και ένα **δείγμα** προϊόντων για να δούμε
 * τι ακριβώς στέλνει ο κάθε εκδότης. Τίποτα δεν αποθηκεύεται και κανένα προϊόν δεν αλλάζει — η εισαγωγή είναι άλλο βήμα.
 */

export interface KvConnection {
  ok: boolean;
  message: string;
  ms: number;
  publishers: { id: string; title: string }[];
  catalogues: { id: string; name: string; publisher: string }[];
  expiresAt: string | null;
}

export interface KvProduct {
  id: string;
  name: string;
  code: string;
  contentId: string;
  contentType: string;
  category: string;
  publisher: string;
  status: string;
  updated: string | null;
  image: string;
}

export interface KvSample {
  ok: boolean;
  message: string;
  total: number;
  shown: number;
  products: KvProduct[];
  fields: DocField[];
  /** το πρώτο έγγραφο ολόκληρο, μορφοποιημένο — για να φαίνεται η πραγματική δομή */
  raw: string;
}

const fail = (message: string) => ({ ok: false as const, message });

async function config() {
  const c = await getKeyvotoConfig();
  if (!c) throw new Error("Λείπουν τα στοιχεία σύνδεσης — συμπλήρωσέ τα στις Ρυθμίσεις → Keyvoto PIM.");
  if (!c.enabled) throw new Error("Η διασύνδεση με το Keyvoto είναι κλειστή — άνοιξέ την στις Ρυθμίσεις → Keyvoto PIM.");
  if (!c.businessAccountId) throw new Error("Λείπει το Business Account Id — συμπλήρωσέ το στις Ρυθμίσεις → Keyvoto PIM.");
  return c;
}

/** Token + ποιοι εκδότες και ποιοι κατάλογοι μοιράζονται περιεχόμενο μαζί μας. */
export async function connect(): Promise<KvConnection> {
  const user = await requirePermission("catalog.products.read");
  const t0 = Date.now();
  try {
    const c = await config();
    const r = await testKeyvoto(c);
    if (!r.ok) return { ok: false, message: r.message, ms: r.ms, publishers: [], catalogues: [], expiresAt: null };
    const [p, cat] = await Promise.all([publishers(c, 100), catalogues(c, 100)]);
    await audit(user.id, "keyvoto.connect", "Setting", "keyvoto", null, { ok: true });
    return {
      ok: true,
      message: `Σύνδεση OK — ${p.totalResults ?? (p.results ?? []).length} εκδότες, ${cat.totalResults ?? (cat.results ?? []).length} κατάλογοι.`,
      ms: Date.now() - t0,
      publishers: (p.results ?? []).map((x) => ({ id: String(x.businessAccountId ?? ""), title: String(x.title ?? x.businessAccountId ?? "—") })),
      catalogues: (cat.results ?? []).map((x) => ({ id: String(x.catalogueId ?? ""), name: String(x.name ?? "—"), publisher: String(x.publisher ?? "") })),
      expiresAt: tokenHeldUntil(c)?.toISOString() ?? null,
    };
  } catch (e) {
    return { ...fail(e instanceof Error ? e.message : String(e)), ms: Date.now() - t0, publishers: [], catalogues: [], expiresAt: null };
  }
}

export interface SampleInput {
  publisher?: string;
  catalogue?: string;
  search?: string;
  gtin?: string;
  pageSize?: number;
}

const text = (v: unknown) => (v == null ? "" : String(v));

/** Ένα δείγμα προϊόντων με ολόκληρο το έγγραφό τους — η βάση της αντιστοίχισης. */
export async function sample(input: SampleInput): Promise<KvSample> {
  const user = await requirePermission("catalog.products.read");
  const empty = { total: 0, shown: 0, products: [], fields: [], raw: "" };
  try {
    const c = await config();
    const size = Math.min(Math.max(Number(input.pageSize) || 5, 1), 50);
    const r = await sharedContent(c, {
      pageSize: size,
      contentTypes: ["Product"],
      publishers: input.publisher ? [input.publisher] : undefined,
      catalogues: input.catalogue ? [input.catalogue] : undefined,
      gtinCodes: input.gtin ? input.gtin.split(/[\s,]+/).filter(Boolean) : undefined,
      searchValue: input.search || undefined,
    });
    const rows: Publication[] = r.results ?? [];
    await audit(user.id, "keyvoto.sample", "Setting", "keyvoto", null, { n: rows.length, publisher: input.publisher ?? null });
    const docs = rows.map((x) => x.document).filter((d) => d != null);
    return {
      ok: true,
      message: rows.length ? `${r.totalResults ?? rows.length} προϊόντα ταιριάζουν· βλέπεις τα ${rows.length} πρώτα.` : "Κανένα προϊόν με αυτά τα κριτήρια.",
      total: r.totalResults ?? rows.length,
      shown: rows.length,
      products: rows.map((x) => ({
        id: text(x.id), name: text(x.name), code: text(x.code), contentId: text(x.contentId), contentType: text(x.contentType),
        category: text(x.category), publisher: text(x.publisher), status: text(x.productStatus),
        updated: x.documentUpdated ? new Date(x.documentUpdated).toISOString() : null, image: text(x.image),
      })),
      fields: documentFields(docs),
      raw: docs.length ? JSON.stringify(docs[0], null, 1).slice(0, 60_000) : "",
    };
  } catch (e) {
    return { ...empty, ...fail(e instanceof Error ? e.message : String(e)) };
  }
}
