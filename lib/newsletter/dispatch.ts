import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { emailCtx } from "@/lib/email/layout";
import { mailgunTarget, sendMail, transportReady } from "@/lib/email/send";
import { marketingAllowed } from "@/lib/promo/issue";
import { audit } from "@/lib/rbac/audit";
import { audienceOf, batches, contentHash, failRatio, recipientVariables, startCheck, validateSchedule, type AudienceRow, type Block } from "./core";
import { productCards } from "./draft";
import { renderNewsletter } from "./render";

/**
 * Μηχανή αποστολής newsletter (spec §5, §6, §9):
 * δοκιμή → προγραμματισμός (δικλείδες) → `tickNewsletters` ανά λεπτό από το cron: διεκδίκηση (scheduled → sending, μία φορά),
 * έναρξη (έλεγχοι, ανανέωση προϊόντων, κοινό σε ουρά `NewsletterRecipient`), πακέτα Mailgun (ή `sendMail` ένα-ένα).
 * Πραγματικές δοκιμές μόνο με `NEWSLETTER_TESTMODE=1` (Mailgun `o:testmode`).
 */

const BATCH = 1000; // Mailgun: έως 1.000 παραλήπτες ανά κλήση
const SINGLE_PER_TICK = 60; // χωρίς Mailgun API: ένα-ένα με sendMail
const MAX_ATTEMPTS = 3;
const MAX_TEST = 10;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const testmode = () => process.env.NEWSLETTER_TESTMODE === "1";
const athens = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

type Ok = { ok: boolean; error?: string };
type LogEntry = { at: string; event: string; text: string; by?: string | null };

/** Προσθήκη στο ιστορικό (`log`) χωρίς ανάγνωση-εγγραφή: ατομικό `||` στο jsonb. */
async function appendLog(id: string, event: string, text: string, by?: string | null) {
  const entry: LogEntry = { at: new Date().toISOString(), event, text, ...(by ? { by } : {}) };
  await db.$executeRaw`UPDATE "Newsletter" SET log = COALESCE(log, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb, "updatedAt" = now() WHERE id = ${id}`;
}

/** Μετάβαση κατάστασης μόνο από τις αναμενόμενες (ατομικά)· true αν έγινε. */
async function transition(id: string, from: string[], data: Prisma.NewsletterUpdateManyMutationInput, event: string, text: string, by?: string | null) {
  const r = await db.newsletter.updateMany({ where: { id, status: { in: from } }, data });
  if (r.count) await appendLog(id, event, text, by);
  return r.count > 0;
}

const blocksOf = (b: Prisma.JsonValue) => (Array.isArray(b) ? (b as unknown as Block[]) : []);
const productIdsOf = (blocks: Block[]) => [...new Set(blocks.flatMap((b) => (b.type === "products" ? b.ids : [])))];

// ---- προσφορά / καμπάνια ----

/** Προσφορά και καμπάνια του newsletter + λόγος που δεν επιτρέπεται η αποστολή (ή null). */
async function sourceCheck(n: { promotionId: string | null; campaignId: string | null }, now = new Date()) {
  const [promotion, campaign] = await Promise.all([
    n.promotionId ? db.promotion.findUnique({ where: { id: n.promotionId }, select: { status: true, held: true, endsAt: true, code: true, campaignId: true } }) : null,
    n.campaignId ? db.campaign.findUnique({ where: { id: n.campaignId }, select: { status: true, code: true, slug: true } }) : null,
  ]);
  const reason = n.promotionId && !promotion ? "Η προσφορά δεν υπάρχει πια." : n.campaignId && !campaign ? "Η καμπάνια δεν υπάρχει πια." : startCheck({ promotion, campaign }, now);
  return { promotion, campaign, reason };
}

/** UTM: κωδικός καμπάνιας (του newsletter ή της προσφοράς του), αλλιώς της προσφοράς· γενικό newsletter → «newsletter». */
async function utmOf(src: Awaited<ReturnType<typeof sourceCheck>>): Promise<string> {
  let code = src.campaign ? src.campaign.code || src.campaign.slug : null;
  if (!code && src.promotion?.campaignId) {
    const c = await db.campaign.findUnique({ where: { id: src.promotion.campaignId }, select: { code: true, slug: true } });
    code = c ? c.code || c.slug : null;
  }
  code ||= src.promotion?.code ?? "newsletter";
  return `utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(code)}`;
}

// ---- κοινό ----

/** Πελάτες με τελευταία συναίνεση offers/newsletter (email) = «όχι». */
async function optedOutOf(customerIds: string[]): Promise<Set<string>> {
  if (!customerIds.length) return new Set();
  const rows = await db.consent.findMany({ where: { customerId: { in: customerIds }, topic: { in: ["offers", "newsletter"] }, channel: "email" }, orderBy: { at: "desc" }, select: { customerId: true, granted: true } });
  const latest = new Map<string, boolean>();
  for (const r of rows) if (r.customerId && !latest.has(r.customerId)) latest.set(r.customerId, r.granted);
  return new Set([...latest].filter(([, g]) => !g).map(([id]) => id));
}

/** Το κοινό τώρα: συνδρομητές ∪ πελάτες με συναίνεση (σε σελίδες των 5.000), προαιρετικά μόνο μέλη του κοινού (segment). */
async function loadAudience(n: { audience: Prisma.JsonValue }): Promise<{ rows: AudienceRow[] } | { error: string }> {
  const subscribers = await db.newsletterSubscriber.findMany({ select: { id: true, email: true, status: true, firstName: true, customerId: true } });
  const customers: { id: string; email: string | null; firstName: string | null; allowed: boolean; optedOut: boolean }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await db.customer.findMany({ where: { email: { not: null }, anonymisedAt: null }, select: { id: true, email: true, firstName: true }, orderBy: { id: "asc" }, take: 5000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (!page.length) break;
    const ids = page.map((c) => c.id);
    const [allowed, optedOut] = await Promise.all([marketingAllowed(ids), optedOutOf(ids)]);
    for (const c of page) customers.push({ id: c.id, email: c.email, firstName: c.firstName || null, allowed: allowed.has(c.id), optedOut: optedOut.has(c.id) });
    cursor = page[page.length - 1].id;
  }
  let segment: Set<string> | null = null;
  const segmentId = (n.audience as { segmentId?: unknown } | null)?.segmentId;
  if (typeof segmentId === "string" && segmentId) {
    const seg = await db.segment.findUnique({ where: { id: segmentId }, select: { rules: true } });
    if (!seg) return { error: "Το κοινό (segment) του newsletter δεν βρέθηκε." };
    const { membersOf } = await import("@/lib/promo/segments");
    segment = new Set((await membersOf(seg.rules as never, { limit: Number.MAX_SAFE_INTEGER })).map((m) => m.id));
  }
  return { rows: audienceOf({ subscribers, customers, segment }) };
}

// ---- Mailgun ----

type Mg = NonNullable<ReturnType<typeof mailgunTarget>>;
type BatchResult = { kind: "ok"; id: string | null } | { kind: "retry" | "fatal"; error: string };

/**
 * Μία κλήση Mailgun για πολλούς παραλήπτες: `to` ανά παραλήπτη + `recipient-variables` (unsub, name) — ο καθένας βλέπει μόνο τον εαυτό του.
 * 429 / 5xx / δίκτυο → «retry» (ξανά στο επόμενο λεπτό)· άλλο 4xx → «fatal» (π.χ. λάθος κλειδί / domain).
 * Ένα `EmailLog` ανά πακέτο.
 */
async function mailgunBatch(mg: Mg, p: { newsletterId: string; emails: string[]; vars: Record<string, { unsub: string; name: string }>; subject: string; html: string; text: string; template: string }): Promise<BatchResult> {
  const form = new URLSearchParams();
  form.append("from", mg.from);
  for (const e of p.emails) form.append("to", e);
  form.append("subject", p.subject);
  form.append("html", p.html);
  form.append("text", p.text);
  form.append("recipient-variables", JSON.stringify(p.vars));
  form.append("h:List-Unsubscribe", `<%recipient.unsub%>, <mailto:${mg.fromEmail}?subject=unsubscribe>`);
  form.append("h:List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
  form.append("o:tag", "newsletter");
  form.append("v:newsletter", p.newsletterId);
  form.append("o:tracking", "yes");
  form.append("o:tracking-opens", "yes");
  form.append("o:tracking-clicks", "yes");
  if (testmode()) form.append("o:testmode", "yes");
  const log = await db.emailLog.create({ data: { to: `Newsletter (${p.emails.length} παραλήπτες)`, subject: p.subject, template: p.template, provider: "mailgun", meta: { newsletterId: p.newsletterId, batch: p.emails.length, testmode: testmode() } } });
  let res: BatchResult;
  try {
    const r = await fetch(`${mg.base}/v3/${encodeURIComponent(mg.domain)}/messages`, { method: "POST", headers: { Authorization: mg.auth, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    if (r.ok) res = { kind: "ok", id: ((await r.json().catch(() => ({}))) as { id?: string }).id ?? null };
    else {
      const error = `Mailgun ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`;
      res = { kind: r.status === 429 || r.status >= 500 ? "retry" : "fatal", error };
    }
  } catch (e) {
    res = { kind: "retry", error: `Mailgun: ${e instanceof Error ? e.message : "σφάλμα δικτύου"}` };
  }
  await db.emailLog.update({ where: { id: log.id }, data: res.kind === "ok" ? { status: "sent", messageId: res.id } : { status: "failed", error: res.error } });
  return res;
}

const listUnsub = (url: string, fromEmail: string) => `<${url}>, <mailto:${fromEmail}?subject=unsubscribe>`;

// ---- δοκιμή ----

/**
 * Δοκιμαστική αποστολή σε διευθύνσεις προσωπικού (ενεργοί Staff), με τον ίδιο δρόμο της κανονικής αποστολής.
 * Θέμα «[ΔΟΚΙΜΗ] …»· η διαγραφή δείχνει στη σελίδα συνδρομής. Επιτυχία → testHash = contentHash (ξεκλειδώνει τον προγραμματισμό).
 */
export async function sendTest(id: string, to: string[], staffId: string): Promise<Ok> {
  const emails = [...new Set(to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return { ok: false, error: "Δώστε τουλάχιστον ένα email." };
  if (emails.length > MAX_TEST) return { ok: false, error: `Έως ${MAX_TEST} διευθύνσεις ανά δοκιμή.` };
  const bad = emails.find((e) => !EMAIL_RE.test(e));
  if (bad) return { ok: false, error: `Μη έγκυρο email: ${bad}` };
  const staff = new Set((await db.staff.findMany({ where: { email: { in: emails, mode: "insensitive" }, active: true }, select: { email: true } })).map((s) => s.email.toLowerCase()));
  const outsider = emails.find((e) => !staff.has(e));
  if (outsider) return { ok: false, error: `Η δοκιμή στέλνεται μόνο σε διευθύνσεις προσωπικού (${outsider}).` };

  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n) return { ok: false, error: "Το newsletter δεν βρέθηκε." };
  const blocks = blocksOf(n.blocks);
  const hash = contentHash({ subject: n.subject, preheader: n.preheader, blocks });
  const { data, secrets } = await getSetting("email");
  if (!transportReady(data, secrets)) return { ok: false, error: "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS)." };

  const [ctx, src, products] = await Promise.all([emailCtx(), sourceCheck(n), productCards(productIdsOf(blocks))]);
  const utm = await utmOf(src);
  const subject = `[ΔΟΚΙΜΗ] ${n.subject}`;
  const viewUrl = `${ctx.baseUrl}/newsletter/v/${n.id}`;
  const unsubPage = `${ctx.baseUrl}/newsletter`;
  let error: string | undefined;
  let mg: Mg | null = null;
  try { mg = mailgunTarget(data, secrets); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  if (!error && mg) {
    const r = renderNewsletter({ subject, preheader: n.preheader, blocks, products, ctx, utm, unsubscribe: "%recipient.unsub%", viewUrl });
    const vars = Object.fromEntries(emails.map((e) => [e, { unsub: unsubPage, name: "" }]));
    const res = await mailgunBatch(mg, { newsletterId: n.id, emails, vars, subject, html: r.html, text: r.text, template: "newsletter-test" });
    if (res.kind !== "ok") error = res.error;
  } else if (!error) {
    const r = renderNewsletter({ subject, preheader: n.preheader, blocks, products, ctx, utm, unsubscribe: unsubPage, viewUrl });
    const headers: Record<string, string> = { "List-Unsubscribe": listUnsub(unsubPage, String(data.fromEmail || "noreply@euronics.gr")), ...(testmode() ? { "X-Mailgun-Drop-Message": "yes" } : {}) };
    for (const e of emails) {
      const res = await sendMail({ to: e, subject, html: r.html, text: r.text, template: "newsletter-test", meta: { newsletterId: n.id }, headers });
      if (!res.ok) { error = "error" in res ? res.error : "Δεν έχει ρυθμιστεί αποστολή email."; break; }
    }
  }
  if (error) {
    await audit(staffId, "newsletter.test", "Newsletter", id, null, { to: emails, ok: false, error });
    return { ok: false, error };
  }
  await db.newsletter.update({ where: { id }, data: { testHash: hash, contentHash: hash, testSentAt: new Date(), testSentTo: emails.join(", ") } });
  await appendLog(id, "test", `Δοκιμαστική αποστολή σε ${emails.join(", ")}${testmode() ? " (testmode)" : ""}.`, staffId);
  await audit(staffId, "newsletter.test", "Newsletter", id, null, { to: emails, ok: true, testmode: testmode() });
  return { ok: true };
}

// ---- προγραμματισμός / ακύρωση / διακοπή ----

/**
 * «Αποστολή τώρα» (`"now"`: το παίρνει το επόμενο tick) ή προγραμματισμός (5′–30 ημέρες).
 * Δικλείδες: πρόχειρο, δοκιμή μετά την τελευταία αλλαγή, προσφορά/καμπάνια σε ισχύ, ρυθμισμένο email, τουλάχιστον ένας παραλήπτης.
 * Επιστρέφει την προεκτίμηση παραληπτών (ίδιος υπολογισμός με την έναρξη — ουρά δεν φτιάχνεται ακόμη).
 */
export async function scheduleNewsletter(id: string, at: Date | "now", staffId: string): Promise<{ ok: boolean; error?: string; recipients?: number }> {
  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n) return { ok: false, error: "Το newsletter δεν βρέθηκε." };
  if (n.status !== "draft") return { ok: false, error: "Μόνο πρόχειρο newsletter μπορεί να σταλεί ή να προγραμματιστεί." };
  const hash = contentHash({ subject: n.subject, preheader: n.preheader, blocks: blocksOf(n.blocks) });
  if (!n.testHash || n.testHash !== hash) return { ok: false, error: "Χρειάζεται δοκιμαστική αποστολή μετά την τελευταία αλλαγή." };
  const now = new Date();
  const src = await sourceCheck(n, now);
  if (src.reason) return { ok: false, error: src.reason };
  const { data, secrets } = await getSetting("email");
  if (!transportReady(data, secrets)) return { ok: false, error: "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS)." };
  let scheduledAt = now;
  if (at !== "now") {
    const v = validateSchedule(at, now);
    if (!v.ok) return { ok: false, error: v.error };
    scheduledAt = at;
  }
  const aud = await loadAudience(n);
  if ("error" in aud) return { ok: false, error: aud.error };
  if (!aud.rows.length) return { ok: false, error: "Δεν υπάρχει κανένας παραλήπτης με συναίνεση." };
  const when = at === "now" ? "Αποστολή τώρα" : `Προγραμματισμός για ${athens.format(scheduledAt)}`;
  const done = await transition(id, ["draft"], { status: "scheduled", scheduledAt, sentById: staffId, cancelReason: null }, "schedule", `${when} — περίπου ${aud.rows.length} παραλήπτες.`, staffId);
  if (!done) return { ok: false, error: "Η κατάσταση του newsletter άλλαξε στο μεταξύ — ανανεώστε τη σελίδα." };
  await audit(staffId, at === "now" ? "newsletter.send" : "newsletter.schedule", "Newsletter", id, { status: "draft" }, { status: "scheduled", scheduledAt, recipients: aud.rows.length });
  return { ok: true, recipients: aud.rows.length };
}

/** Ακύρωση όσο είναι προγραμματισμένο (δεν έχει ξεκινήσει). */
export async function cancelNewsletter(id: string, staffId: string): Promise<Ok> {
  const done = await transition(id, ["scheduled"], { status: "cancelled", cancelReason: "Ακυρώθηκε από διαχειριστή.", finishedAt: new Date() }, "cancel", "Ακυρώθηκε πριν την αποστολή.", staffId);
  if (!done) return { ok: false, error: "Ακυρώνεται μόνο newsletter που είναι προγραμματισμένο." };
  await audit(staffId, "newsletter.cancel", "Newsletter", id, { status: "scheduled" }, { status: "cancelled" });
  return { ok: true };
}

/** «Διακοπή» στη διάρκεια (ή σε παύση): όσοι είναι ακόμη στην ουρά γίνονται skipped. */
export async function stopNewsletter(id: string, staffId: string): Promise<Ok> {
  const done = await transition(id, ["sending", "paused"], { status: "cancelled", cancelReason: "Διακόπηκε από διαχειριστή.", finishedAt: new Date() }, "stop", "Η αποστολή διακόπηκε.", staffId);
  if (!done) return { ok: false, error: "Διακόπτεται μόνο newsletter που στέλνεται ή είναι σε παύση." };
  const skipped = await db.newsletterRecipient.updateMany({ where: { newsletterId: id, status: "queued" }, data: { status: "skipped" } });
  await audit(staffId, "newsletter.stop", "Newsletter", id, null, { status: "cancelled", skipped: skipped.count });
  return { ok: true };
}

// ---- εκτέλεση ----

/** Ατομική διεκδίκηση: scheduled → sending μόνο αν δεν το πήρε άλλος. Επιστρέφει όσα διεκδίκησε αυτή η κλήση. */
export async function claimDue(now: Date): Promise<string[]> {
  const due = await db.newsletter.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, select: { id: true }, orderBy: { scheduledAt: "asc" } });
  const claimed: string[] = [];
  for (const { id } of due) {
    const r = await db.newsletter.updateMany({ where: { id, status: "scheduled" }, data: { status: "sending" } });
    if (r.count) claimed.push(id);
  }
  return claimed;
}

/**
 * Έναρξη (μία φορά, για `sending` χωρίς startedAt): έλεγχος προσφοράς/καμπάνιας (→ cancelled), ανανέωση προϊόντων
 * (αφαιρέσεις στο log· block που άδειασε → paused), κοινό (0 → cancelled), ουρά παραληπτών.
 * `opts.audience` αντικαθιστά το κοινό — ΜΟΝΟ για scripts δοκιμής (ώστε να μη μπει ποτέ πραγματικός πελάτης στην ουρά).
 */
export async function startSending(id: string, opts: { audience?: AudienceRow[] } = {}): Promise<{ ok: boolean; status: string; recipients?: number; reason?: string }> {
  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n) return { ok: false, status: "missing" };
  if (n.status !== "sending" || n.startedAt) return { ok: false, status: n.status };
  const now = new Date();
  const src = await sourceCheck(n, now);
  if (src.reason) {
    await transition(id, ["sending"], { status: "cancelled", cancelReason: src.reason, finishedAt: now }, "cancel", `Δεν ξεκίνησε: ${src.reason}`);
    return { ok: false, status: "cancelled", reason: src.reason };
  }

  // προϊόντα: ξανά από τον κατάλογο — ό,τι δεν φαίνεται πια στο site ή δεν έχει τιμή φεύγει
  const blocks = blocksOf(n.blocks);
  const ids = productIdsOf(blocks);
  if (ids.length) {
    const cards = await productCards(ids);
    const removed = ids.filter((pid) => !cards.has(pid));
    if (removed.length) {
      const titles = new Map((await db.product.findMany({ where: { id: { in: removed } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]));
      for (const pid of removed) await appendLog(id, "product-removed", `Αφαιρέθηκε το προϊόν «${titles.get(pid) ?? pid}» — δεν φαίνεται πια στο site ή δεν έχει τιμή.`);
      const next = blocks.map((b) => (b.type === "products" ? { ...b, ids: b.ids.filter((pid) => cards.has(pid)) } : b));
      await db.newsletter.update({ where: { id }, data: { blocks: next as unknown as Prisma.InputJsonValue, contentHash: contentHash({ subject: n.subject, preheader: n.preheader, blocks: next }) } });
      if (next.some((b, i) => b.type === "products" && !b.ids.length && (blocks[i] as { ids: string[] }).ids.length)) {
        const reason = "Κανένα προϊόν του newsletter δεν είναι πια διαθέσιμο — η αποστολή δεν ξεκίνησε.";
        await transition(id, ["sending"], { status: "paused", cancelReason: reason }, "pause", reason);
        return { ok: false, status: "paused", reason };
      }
    }
  }

  const aud = opts.audience ? { rows: opts.audience } : await loadAudience(n);
  if ("error" in aud || !aud.rows.length) {
    const reason = "error" in aud ? aud.error : "Κανένας παραλήπτης με συναίνεση.";
    await transition(id, ["sending"], { status: "cancelled", cancelReason: reason, finishedAt: now }, "cancel", `Δεν ξεκίνησε: ${reason}`);
    return { ok: false, status: "cancelled", reason };
  }
  // token: cuid από το @default του σχήματος· skipDuplicates → ασφαλής επανάληψη αν κόπηκε στη μέση
  for (const chunk of batches(aud.rows, 5000)) {
    await db.newsletterRecipient.createMany({ data: chunk.map((r) => ({ newsletterId: id, email: r.email, subscriberId: r.subscriberId, customerId: r.customerId, firstName: r.firstName })), skipDuplicates: true });
  }
  const count = await db.newsletterRecipient.count({ where: { newsletterId: id } });
  if (!(await transition(id, ["sending"], { startedAt: now, recipientCount: count }, "start", `Ξεκίνησε η αποστολή σε ${count} παραλήπτες.`))) {
    // διακόπηκε όσο φτιαχνόταν η ουρά: ό,τι μπήκε μετά τη διακοπή δεν στέλνεται
    await db.newsletterRecipient.updateMany({ where: { newsletterId: id, status: "queued" }, data: { status: "skipped" } });
    return { ok: false, status: (await db.newsletter.findUnique({ where: { id }, select: { status: true } }))?.status ?? "missing" };
  }
  return { ok: true, status: "sending", recipients: count };
}

/** Μετρητές από τις γραμμές (όχι προσθέσεις): σωστοί και μετά από διπλές/κομμένες εκτελέσεις. */
async function recount(id: string) {
  const g = await db.newsletterRecipient.groupBy({ by: ["status"], where: { newsletterId: id }, _count: { _all: true } });
  const c = Object.fromEntries(g.map((x) => [x.status, x._count._all])) as Record<string, number>;
  await db.newsletter.update({ where: { id }, data: { sent: c.sent ?? 0, failed: c.failed ?? 0 } });
  return { sent: c.sent ?? 0, failed: c.failed ?? 0, queued: c.queued ?? 0 };
}

/** Αποτυχία προσπάθειας: attempts+1· στην 3η → failed. */
async function bump(rowIds: string[], error: string) {
  await db.newsletterRecipient.updateMany({ where: { id: { in: rowIds } }, data: { attempts: { increment: 1 }, error } });
  await db.newsletterRecipient.updateMany({ where: { id: { in: rowIds }, status: "queued", attempts: { gte: MAX_ATTEMPTS } }, data: { status: "failed" } });
}

const pause = (id: string, reason: string) => transition(id, ["sending"], { status: "paused", cancelReason: reason }, "pause", `Παύση: ${reason}`);

/**
 * Έως `maxBatches` πακέτα των 1.000 (Mailgun) ή έως 60 emails ένα-ένα (`sendMail`). 429 / 5xx → το πακέτο μένει στην ουρά
 * (attempts+1, μετά από 3 → failed)· άλλο 4xx → paused με το μήνυμα του παρόχου· > 20 % αποτυχίες → paused. Άδεια ουρά → sent.
 */
export async function sendBatches(id: string, maxBatches = 5): Promise<{ status: string; sent: number; failed: number; queued: number }> {
  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n || n.status !== "sending" || !n.startedAt) return { status: n?.status ?? "missing", sent: n?.sent ?? 0, failed: n?.failed ?? 0, queued: 0 };
  const { data, secrets } = await getSetting("email");
  let mg: Mg | null = null;
  try { mg = mailgunTarget(data, secrets); } catch (e) { await pause(id, e instanceof Error ? e.message : String(e)); }
  if (!mg && !transportReady(data, secrets)) await pause(id, "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS).");

  const blocks = blocksOf(n.blocks);
  const [ctx, src, products] = await Promise.all([emailCtx(), sourceCheck(n), productCards(productIdsOf(blocks))]);
  const utm = await utmOf(src);
  const viewUrl = `${ctx.baseUrl}/newsletter/v/${id}`;
  const stillSending = async () => (await db.newsletter.findUnique({ where: { id }, select: { status: true } }))?.status === "sending";

  if (mg) {
    const r = renderNewsletter({ subject: n.subject, preheader: n.preheader, blocks, products, ctx, utm, unsubscribe: "%recipient.unsub%", viewUrl });
    for (let i = 0; i < maxBatches && (await stillSending()); i++) {
      const rows = await db.newsletterRecipient.findMany({ where: { newsletterId: id, status: "queued" }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, email: true, token: true, firstName: true } });
      if (!rows.length) break;
      const res = await mailgunBatch(mg, { newsletterId: id, emails: rows.map((x) => x.email), vars: recipientVariables(rows, ctx.baseUrl), subject: n.subject, html: r.html, text: r.text, template: "newsletter" });
      const rowIds = rows.map((x) => x.id);
      if (res.kind === "ok") {
        await db.newsletterRecipient.updateMany({ where: { id: { in: rowIds } }, data: { status: "sent", messageId: res.id, sentAt: new Date(), attempts: { increment: 1 }, error: null } });
      } else if (res.kind === "retry") {
        await bump(rowIds, res.error);
        await appendLog(id, "retry", `Πακέτο ${rows.length} παραληπτών: ${res.error} — νέα προσπάθεια στο επόμενο λεπτό.`);
        break;
      } else {
        await pause(id, res.error);
        break;
      }
      const c = await recount(id);
      if (failRatio(c.sent, c.failed)) { await pause(id, `Πάνω από 20 % αποτυχίες (${c.failed} από ${c.sent + c.failed}).`); break; }
    }
  } else if (await stillSending()) {
    const fromEmail = String(data.fromEmail || "noreply@euronics.gr");
    const SENTINEL = "__NL_TOKEN__";
    const unsubOf = (token: string) => `${ctx.baseUrl}/api/newsletter/u/${token}`;
    const r = renderNewsletter({ subject: n.subject, preheader: n.preheader, blocks, products, ctx, utm, unsubscribe: unsubOf(SENTINEL), viewUrl });
    const rows = await db.newsletterRecipient.findMany({ where: { newsletterId: id, status: "queued" }, orderBy: { id: "asc" }, take: SINGLE_PER_TICK, select: { id: true, email: true, token: true } });
    for (const row of rows) {
      if (!(await stillSending())) break;
      const res = await sendMail({
        to: row.email, subject: n.subject, html: r.html.replaceAll(SENTINEL, row.token), text: r.text.replaceAll(SENTINEL, row.token), template: "newsletter",
        meta: { newsletterId: id, recipientId: row.id },
        headers: { "List-Unsubscribe": listUnsub(unsubOf(row.token), fromEmail), "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", ...(testmode() ? { "X-Mailgun-Drop-Message": "yes" } : {}) },
      });
      if (res.ok) await db.newsletterRecipient.update({ where: { id: row.id }, data: { status: "sent", messageId: res.messageId ?? null, sentAt: new Date(), attempts: { increment: 1 }, error: null } });
      else if (res.skipped) { await pause(id, "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS)."); break; }
      else await bump([row.id], res.error);
    }
    const c = await recount(id);
    if (failRatio(c.sent, c.failed)) await pause(id, `Πάνω από 20 % αποτυχίες (${c.failed} από ${c.sent + c.failed}).`);
  }

  const c = await recount(id);
  if (!c.queued) await transition(id, ["sending"], { status: "sent", finishedAt: new Date() }, "sent", `Ολοκληρώθηκε: ${c.sent} στάλθηκαν, ${c.failed} απέτυχαν.`);
  const status = (await db.newsletter.findUnique({ where: { id }, select: { status: true } }))?.status ?? "missing";
  return { status, ...c };
}

// ---- κλείδωμα ανάμεσα σε διεργασίες ----
// Μίσθωση σε γραμμή του Setting με λήξη (όπως το lib/promo/offers.ts): τα session advisory locks του Postgres δεν είναι
// αξιόπιστα πίσω από PgBouncer / pool του Prisma (το unlock μπορεί να πάει σε άλλη σύνδεση από το lock).
const LOCK = "newsletter-tick-lock";
async function acquireLock(ttlMs = 5 * 60_000) {
  const now = Date.now();
  await db.$executeRaw`INSERT INTO "Setting" (section, data, "updatedAt", "createdAt") VALUES (${LOCK}, '{"until":0}'::jsonb, now(), now()) ON CONFLICT (section) DO NOTHING`;
  const got = await db.$executeRaw`UPDATE "Setting" SET data = jsonb_build_object('until', ${now + ttlMs}::bigint), "updatedAt" = now() WHERE section = ${LOCK} AND COALESCE((data->>'until')::bigint, 0) < ${now}::bigint`;
  return got > 0;
}
async function releaseLock() {
  await db.$executeRaw`UPDATE "Setting" SET data = jsonb_build_object('until', 0), "updatedAt" = now() WHERE section = ${LOCK}`;
}

/** Ανά λεπτό από το cron: διεκδίκηση όσων ήρθε η ώρα τους → έναρξη → πακέτα για κάθε `sending`. Ένα tick τη φορά. */
export async function tickNewsletters(now = new Date()) {
  if (!(await acquireLock())) return { skipped: "locked" as const };
  try {
    const claimed = await claimDue(now);
    const out: Record<string, unknown> = {};
    // και όσα έμειναν «sending» χωρίς έναρξη (π.χ. κόπηκε η διεργασία μετά τη διεκδίκηση)
    for (const { id } of await db.newsletter.findMany({ where: { status: "sending", startedAt: null }, select: { id: true } })) {
      out[id] = await startSending(id).catch((e) => ({ error: String(e) }));
    }
    for (const { id } of await db.newsletter.findMany({ where: { status: "sending", startedAt: { not: null } }, select: { id: true } })) {
      out[id] = await sendBatches(id).catch((e) => ({ error: String(e) }));
    }
    return { claimed: claimed.length, newsletters: out };
  } finally {
    await releaseLock().catch(() => {});
  }
}
