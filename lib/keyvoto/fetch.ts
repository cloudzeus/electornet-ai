import "server-only";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { categoryNamesFor, categorySchema, getKeyvotoConfig, sharedContent, type KeyvotoConfig, type Publication } from "@/lib/keyvoto/client";
import { languageTags } from "@/lib/keyvoto/core";
import { keyvotoEnvelope, parseKeyvotoUrl, type KeyvotoItem } from "@/lib/keyvoto/rows";

/**
 * **Η «λήψη» ενός feed Keyvoto**: σελίδα-σελίδα όλο το περιεχόμενο ενός εκδότη (ή ενός καταλόγου του) σε ένα πακέτο,
 * που αποθηκεύεται σαν στιγμιότυπο όπως ακριβώς το XML ενός προμηθευτή. Έτσι η αντιστοίχιση, η λίστα ελέγχου και κάθε
 * νέα φόρτωση δουλεύουν **χωρίς** να ξαναρωτηθεί το Keyvoto.
 */

/** Δικλείδες: ένας κατάλογος με δεκάδες χιλιάδες προϊόντα δεν πρέπει να κρεμάσει τη διαχείριση. */
const MAX_PAGES = 400;
const MAX_ITEMS = 40_000;

const text = (v: unknown) => (v == null ? "" : String(v).trim());

const toItem = (p: Publication): KeyvotoItem => ({
  id: text(p.id), code: text(p.code), name: text(p.name), category: text(p.category),
  publisher: text(p.publisher), productStatus: text(p.productStatus), document: p.document ?? {},
  // για το ζευγάρωμα εσωτερικής / εξωτερικής μονάδας (`pairUnits`)
  contentId: text(p.contentId), relatives: (p.relatives ?? []).map((r) => text(r?.contentId)).filter(Boolean),
});

/**
 * Κλειδί χαρακτηριστικού → η ονομασία του, από το σχήμα κάθε κατηγορίας της λήψης (`noiselevel` → «Στάθμη Θορύβου [dB(A)]»).
 * Χωρίς αυτό ο χρήστης θα έβλεπε τα εσωτερικά κλειδιά του Keyvoto. Κατηγορία που δεν απαντά απλώς παραλείπεται.
 */
async function specLabels(c: KeyvotoConfig, categoryIds: string[], lang: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))].slice(0, 200)) {
    const schema = await categorySchema(c, id).catch(() => null) as { properties?: Record<string, { m_title?: Record<string, unknown> }> } | null;
    for (const [key, p] of Object.entries(schema?.properties ?? {})) {
      const t = p?.m_title ?? {};
      const title = String(t[lang] ?? t["el-GR"] ?? t["en-GB"] ?? "").trim();
      if (title && !out[key.trim()]) out[key.trim()] = title;
    }
  }
  return out;
}

export async function downloadKeyvoto(url: string): Promise<Buffer> {
  const src = parseKeyvotoUrl(url);
  if (!src?.publisher) throw new UserError("Η πηγή Keyvoto δεν έχει εκδότη — διάλεξε ξανά εκδότη και κατάλογο.");
  const c = await getKeyvotoConfig();
  if (!c) throw new UserError("Λείπουν τα στοιχεία του Keyvoto — συμπλήρωσέ τα στις Ρυθμίσεις → Keyvoto PIM.");
  if (!c.enabled) throw new UserError("Η διασύνδεση με το Keyvoto είναι κλειστή — άνοιξέ την στις Ρυθμίσεις → Keyvoto PIM.");

  const items: KeyvotoItem[] = [];
  let pages = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await sharedContent(c, {
      page, pageSize: c.pageSize, contentTypes: ["Product"],
      publishers: [src.publisher], catalogues: src.catalogue ? [src.catalogue] : undefined,
    }).catch((e: Error) => { throw new UserError(`Το Keyvoto δεν απάντησε στη σελίδα ${page}: ${e.message}`); });
    const rows = r.results ?? [];
    pages++;
    items.push(...rows.map(toItem));
    if (!rows.length || items.length >= MAX_ITEMS) break;
    if (r.totalPages && page >= r.totalPages) break;
  }
  if (!items.length) throw new UserError("Ο εκδότης δεν μοιράζεται κανένα προϊόν με αυτά τα κριτήρια.");
  if (items.length >= MAX_ITEMS) throw new UserError(`Ο κατάλογος ξεπερνά τα ${MAX_ITEMS.toLocaleString("el-GR")} προϊόντα (${pages} σελίδες) — διάλεξε συγκεκριμένο κατάλογο του εκδότη.`);
  // Οι κατηγορίες έρχονται ως κωδικοί· τις λύνουμε ΜΙΑ φορά εδώ και ταξιδεύουν μέσα στο πακέτο, ώστε η αντιστοίχιση
  // και κάθε ξαναδιάβασμα του στιγμιότυπου να δείχνουν ονομασίες χωρίς νέα κλήση. Αποτυχία εδώ δεν ρίχνει τη λήψη.
  const categories = await categoryNamesFor(c, items.map((x) => x.category ?? "")).catch(() => ({}));
  // η gallery ταξιδεύει μαζί: το στιγμιότυπο πρέπει να δίνει τις ίδιες διευθύνσεις και μήνες μετά
  const lang = languageTags(c.languages)[0] || "el-GR";
  const labels = await specLabels(c, items.map((x) => x.category ?? ""), lang).catch(() => ({}));
  return keyvotoEnvelope(items, new Date(), c.galleryBase, categories, labels, lang);
}
