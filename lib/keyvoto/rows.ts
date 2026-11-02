import { flattenDocument } from "@/lib/keyvoto/core";
import type { ParsedFeed } from "@/lib/catalog/xml-import/parse-core";

/**
 * **Το περιεχόμενο του Keyvoto ως πίνακας** — καθαρή λογική, χωρίς δίκτυο ή βάση.
 *
 * Γιατί: ο οδηγός αντιστοίχισης, η λίστα ελέγχου και η εισαγωγή δουλεύουν ήδη με «επικεφαλίδες + γραμμές» (ό,τι βγάζει
 * ο `parseFeed` ενός XML). Το Keyvoto δίνει **ελεύθερο JSON** ανά προϊόν, διαφορετικό ανά εκδότη. Το ισιώνουμε σε
 * διαδρομές (`main.Χρώμα`, `images[].path`) και φτιάχνουμε τον ίδιο εικονικό πίνακα — έτσι από εκεί και κάτω τίποτα δεν
 * ξέρει αν η πηγή ήταν XML ή PIM, και ο χρήστης βλέπει τον ίδιο οδηγό.
 *
 * Οι επαναλήψεις (φωτογραφίες) γίνονται αριθμημένες στήλες, όπως ακριβώς τα επαναλαμβανόμενα tags ενός XML — ώστε να
 * δουλεύει αυτούσια η σειρά των φωτογραφιών με drag-and-drop.
 */

/** Τα προϊόντα μιας λήψης, όπως τα αποθηκεύουμε (συμπιεσμένα) στο στιγμιότυπο του feed. */
export interface KeyvotoItem {
  id?: string;
  code?: string;
  name?: string;
  category?: string;
  publisher?: string;
  productStatus?: string;
  document?: unknown;
}
export interface KeyvotoPack {
  keyvoto: 1;
  fetchedAt: string;
  items: KeyvotoItem[];
}

/** Οι στήλες που δεν έρχονται από το έγγραφο αλλά από τη σύνοψη της δημοσίευσης. */
const SUMMARY: [string, keyof KeyvotoItem][] = [
  ["Keyvoto: κωδικός", "code"],
  ["Keyvoto: όνομα", "name"],
  ["Keyvoto: κατηγορία", "category"],
  ["Keyvoto: εκδότης", "publisher"],
  ["Keyvoto: κατάσταση", "productStatus"],
];

const IMAGE = /image|img|photo|picture|φωτογραφ/i;
/** Τα χαρακτηριστικά του προϊόντος κάθονται στο `main` του εγγράφου (οδηγός Keyvoto για retailers). */
const SPEC_SECTION = "main.";

export const keyvotoEnvelope = (items: KeyvotoItem[], fetchedAt = new Date()): Buffer =>
  Buffer.from(JSON.stringify({ keyvoto: 1, fetchedAt: fetchedAt.toISOString(), items } satisfies KeyvotoPack), "utf8");

/** Είναι αυτά τα bytes πακέτο Keyvoto (και όχι XML); Κοιτάζει μόνο την αρχή — το πακέτο μπορεί να είναι δεκάδες MB. */
export function isKeyvotoBytes(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 64).toString("utf8").replace(/^﻿/, "").trimStart();
  return head.startsWith("{") && /^\{\s*"keyvoto"\s*:/.test(head);
}

const noIndex = (p: string) => p.replace(/\[\d+\]/g, "[]");

/** Το πακέτο μιας λήψης → ο ίδιος εικονικός πίνακας που δίνει ένα XML feed. */
export function parseKeyvotoRows(bytes: Buffer): ParsedFeed {
  const pack = JSON.parse(bytes.toString("utf8")) as KeyvotoPack;
  const items = pack.items ?? [];

  // ---- 1ο πέρασμα: ποιες διαδρομές υπάρχουν και πόσες φορές το πολύ ----
  const order: string[] = [];
  const maxCount = new Map<string, number>();
  const flat = items.map((it) => {
    const pairs = flattenDocument(it.document);
    const count = new Map<string, number>();
    const byPath = new Map<string, string[]>();
    for (const [path, value] of pairs) {
      const key = noIndex(path);
      if (!order.includes(key)) order.push(key);
      count.set(key, (count.get(key) ?? 0) + 1);
      byPath.set(key, [...(byPath.get(key) ?? []), value]);
    }
    for (const [k, n] of count) maxCount.set(k, Math.max(maxCount.get(k) ?? 0, n));
    return byPath;
  });

  // ---- επικεφαλίδες: σύνοψη, μετά οι διαδρομές (αριθμημένες όπου επαναλαμβάνονται) ----
  const headers: string[] = items.length ? SUMMARY.map(([h]) => h) : [];
  const cols: { path: string; at: number }[] = [];
  for (const path of order) {
    const n = maxCount.get(path) ?? 1;
    for (let i = 0; i < n; i++) { headers.push(n === 1 ? path : `${path} ${i + 1}`); cols.push({ path, at: i }); }
  }

  const matrix: string[][] = [headers];
  for (const [i, it] of items.entries()) {
    const byPath = flat[i];
    matrix.push([...SUMMARY.map(([, k]) => String(it[k] ?? "").trim()), ...cols.map((c) => byPath.get(c.path)?.[c.at] ?? "")]);
  }

  const specLabels = order.filter((p) => p.startsWith(SPEC_SECTION)).length;
  return {
    headers,
    matrix,
    counts: {
      products: items.length,
      tags: headers.length,
      categories: new Set(items.map((x) => (x.category ?? "").trim()).filter(Boolean)).size,
      specLabels,
      images: headers.filter((h) => IMAGE.test(h)).length,
    },
  };
}

// ---------- η πηγή ως «διεύθυνση» ----------

/**
 * Ένα feed Keyvoto δεν έχει διεύθυνση — έχει εκδότη (και προαιρετικά συγκεκριμένο κατάλογό του). Το γράφουμε ως
 * ψευδοδιεύθυνση ώστε να μπει αυτούσιο στο υπάρχον μοντέλο (`SupplierFeed.url`, στιγμιότυπα, χρονοπρογραμματισμός).
 */
export const KEYVOTO_SCHEME = "keyvoto:";
export const keyvotoUrl = (publisher: string, catalogue = "") =>
  `${KEYVOTO_SCHEME}${publisher.trim()}${catalogue.trim() ? `/${catalogue.trim()}` : ""}`;

export function parseKeyvotoUrl(url: string): { publisher: string; catalogue: string } | null {
  const u = (url ?? "").trim();
  if (!u.toLowerCase().startsWith(KEYVOTO_SCHEME)) return null;
  const [publisher = "", catalogue = ""] = u.slice(KEYVOTO_SCHEME.length).split("/");
  return { publisher: publisher.trim(), catalogue: catalogue.trim() };
}
