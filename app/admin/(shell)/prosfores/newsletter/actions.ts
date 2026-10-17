"use server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { LISTED } from "@/lib/data/db-catalog";
import { contentHash, validateSchedule } from "@/lib/newsletter/core";
import { aiCopy, draftFromCampaign, draftFromPromotion, newsletterFacts, productCards } from "@/lib/newsletter/draft";
import { cancelNewsletter, estimateAudience, renderForWeb, resumeNewsletter, scheduleNewsletter, sendTest, stopNewsletter } from "@/lib/newsletter/dispatch";
import { athensLocal, fromForm, isNight, safeHref, sanitizeNewsletter, type CopyField, type NewsletterForm } from "@/lib/newsletter/edit";

/**
 * Ενέργειες της σελίδας «Newsletter» των προσφορών. Όλες με δικαίωμα `marketing.newsletter.write`.
 * Audit: create / update / copy εδώ· test / schedule / send / cancel / stop / resume τα γράφει το lib/newsletter/dispatch.
 */
const PERM = "marketing.newsletter.write";
const LIST = "/admin/prosfores/newsletter";
const done = (id?: string) => { revalidatePath(LIST); if (id) revalidatePath(`${LIST}/${id}`); };
type Res = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Κάτι πήγε στραβά." });

// ---- δημιουργία ----

export async function createFromPromotion(promotionId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission(PERM);
  try {
    const { id } = await draftFromPromotion(promotionId, user.id);
    await audit(user.id, "newsletter.create", "Newsletter", id, null, { promotionId });
    done(id);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function createFromCampaign(campaignId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission(PERM);
  try {
    const { id } = await draftFromCampaign(campaignId, user.id);
    await audit(user.id, "newsletter.create", "Newsletter", id, null, { campaignId });
    done(id);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

/** «Αντίγραφο»: νέο πρόχειρο με το ίδιο περιεχόμενο και κοινό (μόνο segment — η λίστα δοκιμής `emails` δεν αντιγράφεται). */
export async function duplicate(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission(PERM);
  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n) return { ok: false, error: "Το newsletter δεν βρέθηκε." };
  const blocks = (Array.isArray(n.blocks) ? n.blocks : []) as unknown as Parameters<typeof contentHash>[0]["blocks"];
  const a = (n.audience && typeof n.audience === "object" && !Array.isArray(n.audience) ? n.audience : {}) as { segmentId?: unknown };
  const copy = await db.newsletter.create({
    data: {
      title: `${n.title} (αντίγραφο)`.slice(0, 200), promotionId: n.promotionId, campaignId: n.campaignId,
      subject: n.subject, preheader: n.preheader, blocks: n.blocks as Prisma.InputJsonValue,
      audience: typeof a.segmentId === "string" && a.segmentId ? { segmentId: a.segmentId } : {},
      status: "draft", contentHash: contentHash({ subject: n.subject, preheader: n.preheader, blocks }), createdById: user.id,
      log: [{ at: new Date().toISOString(), event: "copy", text: `Αντίγραφο του «${n.title}».`, by: user.id }],
    },
    select: { id: true },
  });
  await audit(user.id, "newsletter.copy", "Newsletter", copy.id, { from: id }, { id: copy.id });
  done(copy.id);
  return { ok: true, id: copy.id };
}

// ---- επεξεργασία ----

/**
 * Αποθήκευση πρόχειρου: έλεγχος (σύνδεσμοι, όρια, έως 12 προϊόντα), νέο `contentHash` — αν άλλαξε το περιεχόμενο,
 * η προηγούμενη δοκιμή δεν ισχύει πια. Το κοινό γράφεται `{}` ή `{ segmentId }`· μια υπάρχουσα λίστα δοκιμής `emails` κρατιέται.
 */
export async function saveNewsletter(id: string, form: NewsletterForm): Promise<{ ok: true; contentHash: string; tested: boolean } | { ok: false; errors: string[] }> {
  const user = await requirePermission(PERM);
  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n) return { ok: false, errors: ["Το newsletter δεν βρέθηκε."] };
  if (n.status !== "draft") return { ok: false, errors: ["Αλλάζει μόνο πρόχειρο newsletter — για νέα αποστολή φτιάξτε «Αντίγραφο»."] };
  const r = sanitizeNewsletter(form);
  if (!r.ok) return r;
  const v = r.value;
  if (v.audience.segmentId && !(await db.segment.findFirst({ where: { id: v.audience.segmentId, archived: false }, select: { id: true } }))) return { ok: false, errors: ["Το κοινό πελατών δεν βρέθηκε (ή αρχειοθετήθηκε)."] };
  const prev = (n.audience && typeof n.audience === "object" && !Array.isArray(n.audience) ? n.audience : {}) as { emails?: unknown };
  const audience = Array.isArray(prev.emails) ? { ...v.audience, emails: prev.emails.filter((e): e is string => typeof e === "string") } : v.audience;
  const hash = contentHash({ subject: v.subject, preheader: v.preheader, blocks: v.blocks });
  const upd = await db.newsletter.updateMany({
    where: { id, status: "draft" },
    data: { title: v.title, subject: v.subject, preheader: v.preheader, blocks: v.blocks as unknown as Prisma.InputJsonValue, audience, contentHash: hash },
  });
  if (!upd.count) return { ok: false, errors: ["Η κατάσταση του newsletter άλλαξε στο μεταξύ — ανανεώστε τη σελίδα."] };
  if (hash !== n.contentHash || n.title !== v.title || JSON.stringify(n.audience) !== JSON.stringify(audience)) {
    await audit(user.id, "newsletter.update", "Newsletter", id, { title: n.title, subject: n.subject, contentHash: n.contentHash, audience: n.audience }, { title: v.title, subject: v.subject, contentHash: hash, audience, testInvalidated: !!n.testHash && n.testHash !== hash });
  }
  done(id);
  return { ok: true, contentHash: hash, tested: !!n.testHash && n.testHash === hash };
}

/**
 * HTML για την προεπισκόπηση (iframe) — με τα τρέχοντα (και μη αποθηκευμένα) πεδία, χωρίς αποθήκευση.
 * Μη επιτρεπτοί σύνδεσμοι γίνονται «#»· οι σύνδεσμοι ανοίγουν σε νέα καρτέλα.
 */
export async function previewHtml(id: string, form?: NewsletterForm): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  await requirePermission(PERM);
  const n = await db.newsletter.findUnique({ where: { id }, select: { id: true, subject: true, preheader: true, blocks: true, promotionId: true, campaignId: true } });
  if (!n) return { ok: false, error: "Το newsletter δεν βρέθηκε." };
  try {
    let src = n;
    if (form) {
      const blocks = fromForm(form).blocks.map((b) => (b.type === "hero" ? { ...b, href: safeHref(b.href) ?? "#", image: b.image && safeHref(b.image) && !/^mailto:/i.test(b.image) ? b.image : null } : b.type === "cta" ? { ...b, href: safeHref(b.href) ?? "#" } : b.type === "products" ? { ...b, ids: b.ids.slice(0, 12) } : b));
      src = { ...n, subject: String(form.subject ?? ""), preheader: String(form.preheader ?? ""), blocks: blocks as unknown as Prisma.JsonValue };
    }
    const html = await renderForWeb(src);
    return { ok: true, html: html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">') };
  } catch (e) { return fail(e); }
}

/** «Ξαναγράψε με AI»: νέο κείμενο για ένα πεδίο μόνο από τα στοιχεία της προσφοράς (με έλεγχο γεγονότων)· δεν αποθηκεύει. */
export async function rewriteWithAi(id: string, field: CopyField, productIds: string[] = []): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requirePermission(PERM);
  if (!["subject", "preheader", "intro", "cta"].includes(field)) return { ok: false, error: "Άγνωστο πεδίο." };
  const n = await db.newsletter.findUnique({ where: { id }, select: { promotionId: true, campaignId: true, status: true } });
  if (!n) return { ok: false, error: "Το newsletter δεν βρέθηκε." };
  if (n.status !== "draft") return { ok: false, error: "Αλλάζει μόνο πρόχειρο newsletter." };
  try {
    const facts = await newsletterFacts({ promotionId: n.promotionId, campaignId: n.campaignId, blocks: [{ type: "products", ids: productIds.filter((x) => typeof x === "string").slice(0, 12) }] });
    const copy = await aiCopy(facts, field);
    return { ok: true, text: copy[field] };
  } catch (e) { return fail(e); }
}

/** Προϊόντα για προσθήκη: μόνο όσα φαίνονται στο site και έχουν τιμή (ίδιος κανόνας με το email). */
export async function searchProducts(q: string): Promise<{ id: string; title: string; brand: string; price: number; listPrice: number | null; image: string | null }[]> {
  await requirePermission(PERM);
  const s = q.trim();
  if (s.length < 2) return [];
  const rows = await db.product.findMany({ where: { AND: [LISTED, { OR: [{ title: { contains: s, mode: "insensitive" } }, { sku: { contains: s, mode: "insensitive" } }, { ean: s }, { erpCode: s }] }] }, take: 20, orderBy: { title: "asc" }, select: { id: true } });
  const cards = await productCards(rows.map((r) => r.id));
  return [...cards.entries()].map(([id, c]) => ({ id, title: c.title, brand: c.brand, price: c.price, listPrice: c.listPrice, image: c.image }));
}

// ---- δοκιμή / αποστολή ----

/** Δοκιμαστική αποστολή: πάντα στο email του χρήστη + προαιρετικά σε άλλους ενεργούς συναδέλφους. */
export async function testSend(id: string, extra: string[] = []): Promise<Res> {
  const user = await requirePermission(PERM);
  const me = await db.staff.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!me) return { ok: false, error: "Ο λογαριασμός σας δεν βρέθηκε." };
  const n = await db.newsletter.findUnique({ where: { id }, select: { status: true } });
  if (!n) return { ok: false, error: "Το newsletter δεν βρέθηκε." };
  if (n.status !== "draft") return { ok: false, error: "Δοκιμή γίνεται μόνο σε πρόχειρο newsletter." };
  const r = await sendTest(id, [me.email, ...extra.filter((e) => typeof e === "string")], user.id);
  done(id);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Η δοκιμή απέτυχε." };
}

/**
 * Προεκτίμηση για το παράθυρο επιβεβαίωσης: πλήθος παραληπτών με το αποθηκευμένο κοινό, η ώρα (ώρα Ελλάδας) και αν πέφτει 22:00–08:00.
 * `at` = "now" ή η τιμή του πεδίου ημερομηνίας (yyyy-mm-ddThh:mm, ώρα Ελλάδας).
 */
export async function estimateRecipients(id: string, at: string = "now"): Promise<{ ok: true; recipients: number; night: boolean; when: string | null } | { ok: false; error: string }> {
  await requirePermission(PERM);
  let when: Date | null = null;
  if (at !== "now") {
    when = athensLocal.toDate(at);
    if (!when) return { ok: false, error: "Δώστε ημερομηνία και ώρα." };
    const v = validateSchedule(when, new Date());
    if (!v.ok) return { ok: false, error: v.error };
  }
  const r = await estimateAudience(id);
  if (!r.ok) return r;
  return { ok: true, recipients: r.recipients, night: isNight(when ?? new Date()), when: when?.toISOString() ?? null };
}

/** «Αποστολή τώρα» (`"now"`) ή προγραμματισμός (ώρα Ελλάδας). Οι δικλείδες ελέγχονται στο scheduleNewsletter. */
export async function schedule(id: string, at: string): Promise<{ ok: true; recipients: number } | { ok: false; error: string }> {
  const user = await requirePermission(PERM);
  let when: Date | "now" = "now";
  if (at !== "now") {
    const d = athensLocal.toDate(at);
    if (!d) return { ok: false, error: "Δώστε ημερομηνία και ώρα." };
    when = d;
  }
  const r = await scheduleNewsletter(id, when, user.id);
  done(id);
  return r.ok ? { ok: true, recipients: r.recipients ?? 0 } : { ok: false, error: r.error ?? "Δεν έγινε." };
}

export async function cancel(id: string): Promise<Res> {
  const user = await requirePermission(PERM);
  const r = await cancelNewsletter(id, user.id);
  done(id);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Δεν έγινε." };
}

export async function stop(id: string): Promise<Res> {
  const user = await requirePermission(PERM);
  const r = await stopNewsletter(id, user.id);
  done(id);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Δεν έγινε." };
}

export async function resume(id: string): Promise<Res> {
  const user = await requirePermission(PERM);
  const r = await resumeNewsletter(id, user.id);
  done(id);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Δεν έγινε." };
}
