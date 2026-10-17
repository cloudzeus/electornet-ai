import type { Block } from "./core";

/**
 * Επεξεργασία newsletter στη διαχείριση — καθαρή λογική, χωρίς βάση ή node-only imports (τη χρησιμοποιεί και ο client):
 * φόρμα ↔ blocks, έλεγχος συνδέσμων και ορίων, ώρα Ελλάδας, καταστάσεις σε λέξεις.
 */

export type CopyField = "subject" | "preheader" | "intro" | "cta";
/** Προτεινόμενα όρια χαρακτήρων (spec §4) — μετρητές στον editor, δεν μπλοκάρουν την αποθήκευση. */
export const LIMITS: Record<CopyField, number> = { subject: 60, preheader: 110, intro: 400, cta: 24 };
/** Σκληρά όρια: πάνω από αυτά η αποθήκευση απορρίπτεται. */
export const HARD = { title: 200, subject: 150, preheader: 200, intro: 2000, cta: 60, headline: 200, sub: 300, alt: 200, href: 2000 } as const;
export const MAX_PRODUCTS = 12;

export const NEWSLETTER_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "good" | "warn" | "bad"; help: string }> = {
  draft: { label: "Πρόχειρο", tone: "neutral", help: "Επεξεργάζεται· δεν έχει σταλεί." },
  scheduled: { label: "Προγραμματισμένο", tone: "info", help: "Θα σταλεί αυτόματα στην ώρα του." },
  sending: { label: "Αποστέλλεται", tone: "info", help: "Στέλνεται σε πακέτα ανά λεπτό." },
  paused: { label: "Σε παύση", tone: "warn", help: "Η αποστολή σταμάτησε προσωρινά — δείτε τον λόγο." },
  sent: { label: "Στάλθηκε", tone: "good", help: "Ολοκληρώθηκε." },
  cancelled: { label: "Ακυρώθηκε", tone: "bad", help: "Δεν θα σταλεί (ή διακόπηκε)." },
};

/** Σύνδεσμος που επιτρέπεται σε κουμπί / εικόνα: http(s) με host, σχετικός του site «/…» (όχι «//»), mailto:. Αλλιώς null. */
export function safeHref(raw: string | null | undefined): string | null {
  const h = (raw ?? "").trim();
  if (!h || h.length > HARD.href) return null;
  if (h.startsWith("/")) return h.startsWith("//") || h.startsWith("/\\") ? null : h;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(h)) return h;
  if (/^https?:\/\//i.test(h)) {
    try { return new URL(h).hostname ? h : null; } catch { return null; }
  }
  return null;
}
/** Εικόνα: μόνο http(s) ή σχετική του site. */
const safeImage = (raw: string) => { const h = safeHref(raw); return h && !/^mailto:/i.test(h) ? h : null; };

/** Η φόρμα του editor: σταθερή σειρά hero → εισαγωγή → προϊόντα → κουμπί. Κενό μέρος = παραλείπεται. */
export type NewsletterForm = {
  title: string;
  subject: string;
  preheader: string;
  hero: { image: string; alt: string; href: string; headline: string; sub: string } | null;
  intro: string;
  productIds: string[];
  cta: { label: string; href: string } | null;
  segmentId: string | null;
};

/** blocks της βάσης → φόρμα (πρώτο block κάθε τύπου· τα κείμενα ενώνονται). */
export function toForm(n: { title: string; subject: string; preheader: string; blocks: unknown; audience: unknown }): NewsletterForm {
  const blocks = (Array.isArray(n.blocks) ? n.blocks : []) as Block[];
  const hero = blocks.find((b) => b.type === "hero") as Extract<Block, { type: "hero" }> | undefined;
  const cta = blocks.find((b) => b.type === "cta") as Extract<Block, { type: "cta" }> | undefined;
  const a = (n.audience && typeof n.audience === "object" ? n.audience : {}) as { segmentId?: unknown };
  return {
    title: n.title,
    subject: n.subject,
    preheader: n.preheader,
    hero: hero ? { image: hero.image ?? "", alt: hero.alt ?? "", href: hero.href ?? "", headline: hero.headline ?? "", sub: hero.sub ?? "" } : null,
    intro: blocks.filter((b) => b.type === "text").map((b) => (b as { body: string }).body).join("\n\n"),
    productIds: blocks.flatMap((b) => (b.type === "products" ? b.ids : [])),
    cta: cta ? { label: cta.label ?? "", href: cta.href ?? "" } : null,
    segmentId: typeof a.segmentId === "string" && a.segmentId ? a.segmentId : null,
  };
}

/** Φόρμα → blocks + κοινό (χωρίς έλεγχο — για την προεπισκόπηση· η αποθήκευση περνά από `sanitizeNewsletter`). */
export function fromForm(f: NewsletterForm): { blocks: Block[]; audience: { segmentId?: string } } {
  const blocks: Block[] = [];
  if (f.hero) blocks.push({ type: "hero", image: f.hero.image.trim() || null, alt: f.hero.alt.trim(), href: f.hero.href.trim(), headline: f.hero.headline.trim(), sub: f.hero.sub.trim() });
  if (f.intro.trim()) blocks.push({ type: "text", body: f.intro.trim() });
  const ids = [...new Set(f.productIds.filter((x) => typeof x === "string" && x))];
  if (ids.length) blocks.push({ type: "products", ids });
  if (f.cta) blocks.push({ type: "cta", label: f.cta.label.trim(), href: f.cta.href.trim() });
  return { blocks, audience: f.segmentId ? { segmentId: f.segmentId } : {} };
}

export type CleanNewsletter = { title: string; subject: string; preheader: string; blocks: Block[]; audience: { segmentId?: string } };

/**
 * Έλεγχος πριν από την αποθήκευση: υποχρεωτικά πεδία, σκληρά όρια, σύνδεσμοι (μόνο http(s), «/…», mailto:), έως 12 προϊόντα.
 * Τα προτεινόμενα όρια (60 / 110 / 400 / 24) δεν μπλοκάρουν.
 */
export function sanitizeNewsletter(f: NewsletterForm): { ok: true; value: CleanNewsletter } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n") : "");
  const one = (v: unknown) => str(v).replace(/\s+/g, " ").trim();
  const over = (v: string, max: number, name: string) => { if (v.length > max) errors.push(`${name}: έως ${max} χαρακτήρες (τώρα ${v.length}).`); };

  const title = one(f.title), subject = one(f.subject), preheader = one(f.preheader), intro = str(f.intro).trim();
  if (!title) errors.push("Δώστε εσωτερικό τίτλο.");
  if (!subject) errors.push("Δώστε θέμα.");
  over(title, HARD.title, "Τίτλος"); over(subject, HARD.subject, "Θέμα"); over(preheader, HARD.preheader, "Preheader"); over(intro, HARD.intro, "Εισαγωγή");

  let hero: NewsletterForm["hero"] = null;
  if (f.hero) {
    const image = one(f.hero.image), href = safeHref(f.hero.href);
    hero = { image: "", alt: one(f.hero.alt), href: href ?? "", headline: one(f.hero.headline), sub: one(f.hero.sub) };
    if (image) { const ok = safeImage(image); if (!ok) errors.push("Εικόνα κεφαλίδας: μόνο διεύθυνση https://… ή από τη βιβλιοθήκη."); else hero.image = ok; }
    if (!href) errors.push("Κεφαλίδα: ο σύνδεσμος πρέπει να είναι https://…, σελίδα του site (/…) ή mailto:.");
    if (!hero.headline) errors.push("Κεφαλίδα: δώστε τίτλο.");
    over(hero.headline, HARD.headline, "Τίτλος κεφαλίδας"); over(hero.sub, HARD.sub, "Υπότιτλος κεφαλίδας"); over(hero.alt, HARD.alt, "Περιγραφή εικόνας");
  }
  let cta: NewsletterForm["cta"] = null;
  if (f.cta) {
    const href = safeHref(f.cta.href);
    cta = { label: one(f.cta.label), href: href ?? "" };
    if (!cta.label) errors.push("Κουμπί: δώστε κείμενο (ή αφαιρέστε το κουμπί).");
    if (!href) errors.push("Κουμπί: ο σύνδεσμος πρέπει να είναι https://…, σελίδα του site (/…) ή mailto:.");
    over(cta.label, HARD.cta, "Κείμενο κουμπιού");
  }
  const ids = [...new Set((Array.isArray(f.productIds) ? f.productIds : []).filter((x): x is string => typeof x === "string" && !!x))];
  if (ids.length > MAX_PRODUCTS) errors.push(`Έως ${MAX_PRODUCTS} προϊόντα.`);
  const segmentId = typeof f.segmentId === "string" && f.segmentId.trim() ? f.segmentId.trim() : null;

  if (errors.length) return { ok: false, errors };
  const { blocks, audience } = fromForm({ title, subject, preheader, hero, intro, productIds: ids, cta, segmentId });
  return { ok: true, value: { title, subject, preheader, blocks, audience } };
}

// ---- ώρα Ελλάδας ----

const TZ = "Europe/Athens";
const partsFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const parts = (d: Date) => Object.fromEntries(partsFmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
/** Διαφορά ώρας Ελλάδας − UTC (ms) τη στιγμή t. */
const offset = (t: number) => { const p = parts(new Date(t)); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60_000) * 60_000; };

/** Τιμή του `<input type="datetime-local">` (yyyy-mm-ddThh:mm) ως ώρα Ελλάδας ↔ Date. */
export const athensLocal = {
  toDate(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s ?? "");
    if (!m) return null;
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    let t = guess - offset(guess);
    t = guess - offset(t);
    return new Date(t);
  },
  fromDate(d: Date): string {
    const p = parts(d);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  },
};

/** 22:00–08:00 ώρα Ελλάδας. */
export function isNight(d: Date): boolean {
  const h = Number(parts(d).hour);
  return h >= 22 || h < 8;
}

export const CONTENT_CHANGED = "Το περιεχόμενο άλλαξε πριν την αποστολή· κάνε «Αντίγραφο», έλεγξε και ξαναδοκίμασε";

type ResumeInput = { status: string; started: boolean; queued: number; contentHash: string; testHash: string | null; blocks: unknown };

/**
 * Γιατί δεν επιτρέπεται «Συνέχεια» (ή null): μόνο σε παύση· μετά την έναρξη αν μένουν παραλήπτες στην ουρά.
 * Πριν την έναρξη (θα ξαναγίνουν οι έλεγχοι έναρξης) μόνο αν το περιεχόμενο είναι ακόμη αυτό της δοκιμής
 * (`contentHash` = `testHash`) και κανένα block προϊόντων δεν άδειασε — αλλιώς θα έφευγε κάτι που δεν δοκιμάστηκε.
 */
export function resumeBlock(n: ResumeInput): string | null {
  if (n.status !== "paused") return "Συνεχίζεται μόνο newsletter σε παύση.";
  if (n.started) return n.queued > 0 ? null : "Δεν έμεινε κανένας παραλήπτης στην ουρά — δεν υπάρχει κάτι να συνεχιστεί.";
  const blocks = (Array.isArray(n.blocks) ? n.blocks : []) as { type?: unknown; ids?: unknown }[];
  const emptyProducts = blocks.some((b) => b?.type === "products" && (!Array.isArray(b.ids) || !b.ids.length));
  return !n.testHash || n.contentHash !== n.testHash || emptyProducts ? CONTENT_CHANGED : null;
}

export const canResume = (n: ResumeInput): boolean => resumeBlock(n) === null;

/** Emails σε κείμενο (π.χ. ιστορικό) → «m•••@domain» — η σελίδα δεν δείχνει προσωπικά στοιχεία. */
export function maskEmails(text: string): string {
  return text.replace(/([^\s@<>(),;:"']+)@([^\s@<>(),;:"']+\.[^\s@<>(),;:"'.]+)/g, (_, user: string, domain: string) => `${user[0]}•••@${domain}`);
}
