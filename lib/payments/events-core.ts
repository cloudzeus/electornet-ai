/**
 * Ιστορικό πληρωμής, ό,τι δεν χρειάζεται βάση: τι σημαίνει κάθε κωδικός αιτίας της Viva σε απλά ελληνικά, πώς τα γεγονότα
 * γίνονται «προσπάθειες», το χρονολόγιο της κάρτας «Πληρωμή» και οι αριθμοί της σελίδας «Αποτυχημένες πληρωμές».
 * Κωδικοί: developer.viva.com → Integration reference → Response codes (Event ID codes).
 */
export type PayEventKind = "started" | "failed" | "pending" | "paid" | "review";
export interface PayEvent {
  at: Date | string;
  kind: string;
  source: string;
  method?: string | null;
  pspOrder?: string | null;
  txId?: string | null;
  eventId?: number | null;
  card?: string | null;
}

export interface Reason { key: string; label: string; advice: string }

const R = (key: string, label: string, advice: string, codes: number[]) => ({ key, label, advice, codes });
const REASONS = [
  R("funds", "Ανεπαρκές υπόλοιπο", "Πρότεινε άλλη κάρτα, IRIS ή κατάθεση.", [10051]),
  R("expired", "Έληξε η κάρτα", "Χρειάζεται άλλη κάρτα.", [10054]),
  R("sca-left", "Έφυγε πριν βάλει τον κωδικό της τράπεζας", "Να ξαναδοκιμάσει και να περιμένει το μήνυμα της τράπεζάς του.", [2061]),
  R("sca-wrong", "Λάθος κωδικός τράπεζας (3-D Secure)", "Να ξαναδοκιμάσει: ο κωδικός έρχεται με SMS ή στην εφαρμογή της τράπεζάς του.", [2062, 12005]),
  R("card-data", "Λάθος στοιχεία κάρτας", "Να ξαναγράψει αριθμό, λήξη και CVV με προσοχή.", [10006, 10012, 10014, 10210, 10211, 10214, 10216]),
  R("limit", "Ξεπέρασε το όριο της κάρτας", "Να αυξήσει το όριο στην τράπεζά του ή να πληρώσει με άλλον τρόπο.", [10061]),
  R("blocked", "Η κάρτα είναι μπλοκαρισμένη", "Να μιλήσει με την τράπεζά του. Πρότεινε άλλον τρόπο πληρωμής.", [10004, 10007, 10041, 10043, 10046, 10059, 10062, 10078, 10083, 10212, 10222, 10223, 10224, 10226, 10227]),
  R("declined", "Η τράπεζα αρνήθηκε χωρίς εξήγηση", "Να μιλήσει με την τράπεζά του ή να πληρώσει με άλλον τρόπο.", [10001, 10005, 10057, 10058, 10063, 10065, 10070, 10093, 10215, 10301]),
  R("viva-rules", "Την έκοψαν οι κανόνες ασφαλείας της Viva", "Συνήθως προπληρωμένη κάρτα ή κάρτα εκτός Ευρώπης. Πρότεινε IRIS ή κατάθεση.", [2101, 2102, 2107, 2108, 2119]),
  R("technical", "Τεχνικό πρόβλημα στη Viva ή στην τράπεζα", "Δεν φταίει ο πελάτης. Αν επαναλαμβάνεται, δες την κατάσταση της Viva.", [307, 310, 2054, 6302, 6311, 6614, 6624, 6650, 7001, 10019, 10021, 10030, 10091, 10096, 10200, 10401, 101003, 101004]),
  R("cancelled", "Ακύρωσε ο ίδιος την πληρωμή", "Ρώτησέ τον αν θέλει άλλον τρόπο πληρωμής.", [101407]),
];
const BY_CODE = new Map(REASONS.flatMap((r) => r.codes.map((c) => [c, r] as const)));
/** Ο πελάτης άνοιξε τη σελίδα του παρόχου και δεν ήρθε ποτέ αποτέλεσμα. */
export const ABANDONED: Reason = { key: "abandoned", label: "Έφυγε χωρίς να πληρώσει", advice: "Δεν έγινε χρέωση. Στείλε του τον σύνδεσμο πληρωμής ή πάρε τον ένα τηλέφωνο." };
const UNKNOWN: Reason = { key: "unknown", label: "Απέτυχε στη Viva, χωρίς αιτία", advice: "Η Viva δεν έδωσε αιτία. Δες τη συναλλαγή στον λογαριασμό της Viva." };

/** Αιτία σε απλά ελληνικά από τον κωδικό της Viva. Άγνωστος κωδικός: φαίνεται ο αριθμός, για να τον ψάξεις. */
export function reasonOf(eventId: number | null | undefined): Reason {
  if (eventId == null || eventId === 0) return UNKNOWN;
  const r = BY_CODE.get(eventId);
  return r ? { key: r.key, label: r.label, advice: r.advice } : { key: "other", label: `Απορρίφθηκε (κωδικός Viva ${eventId})`, advice: UNKNOWN.advice };
}
export const reasonLabel = (key: string) => (key === ABANDONED.key ? ABANDONED.label : key === UNKNOWN.key ? UNKNOWN.label : key === "other" ? "Άλλη αιτία" : REASONS.find((r) => r.key === key)?.label ?? key);

/** Η σελίδα πληρωμής της Viva λήγει στα 30′ (paymentTimeout 1800): μετά, προσπάθεια χωρίς αποτέλεσμα = έφυγε. */
export const ATTEMPT_MINUTES = 30;
const ms = (d: Date | string) => +new Date(d);

export type AttemptOutcome = "paid" | "pending" | "failed" | "abandoned" | "open";
export interface Attempt { startedAt: Date; endedAt: Date; method: string | null; source: string; pspOrder: string | null; outcome: AttemptOutcome; reason: Reason | null; failures: number }

/**
 * Γεγονότα → προσπάθειες. Κάθε «started» ανοίγει μία· τα αποτελέσματα μπαίνουν στην προσπάθεια με το ίδιο payment order,
 * αλλιώς στην τελευταία ανοιχτή. Αποτέλεσμα χωρίς «started» (π.χ. παραγγελία πριν από την καταγραφή) γίνεται δική του προσπάθεια.
 */
export function attemptsOf(events: PayEvent[], now: number = Date.now()): Attempt[] {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  const list: (Attempt & { kinds: string[] })[] = [];
  for (const e of sorted) {
    let a = e.kind === "started" ? undefined : (e.pspOrder ? [...list].reverse().find((x) => x.pspOrder === e.pspOrder) : undefined) ?? (e.pspOrder ? undefined : list[list.length - 1]);
    if (!a) {
      a = { startedAt: new Date(e.at), endedAt: new Date(e.at), method: e.method ?? null, source: e.source, pspOrder: e.pspOrder ?? null, outcome: "open", reason: null, failures: 0, kinds: [] };
      list.push(a);
    }
    if (e.kind === "started") continue;
    a.kinds.push(e.kind);
    a.endedAt = new Date(e.at);
    if (e.method) a.method = e.method;
    if (e.kind === "failed") { a.failures++; a.reason = reasonOf(e.eventId); }
  }
  return list.map(({ kinds, ...a }) => {
    const outcome: AttemptOutcome = kinds.includes("paid") ? "paid" : kinds.includes("pending") || kinds.includes("review") ? "pending" : kinds.includes("failed") ? "failed" : now - +a.startedAt > ATTEMPT_MINUTES * 60_000 ? "abandoned" : "open";
    return { ...a, outcome, reason: outcome === "failed" ? a.reason : outcome === "abandoned" ? ABANDONED : null };
  });
}

/** Η παραγγελία είχε πρόβλημα στην πληρωμή; Πόσες προσπάθειες, πόσες δεν πέρασαν και η τελευταία αιτία. */
export function payTrouble(events: PayEvent[], now: number = Date.now()): { attempts: number; missed: number; reason: Reason; lastAt: Date } | null {
  const at = attemptsOf(events, now), bad = at.filter((a) => a.outcome === "failed" || a.outcome === "abandoned");
  if (!bad.length) return null;
  const last = bad[bad.length - 1];
  return { attempts: at.length, missed: bad.length, reason: last.reason!, lastAt: last.outcome === "abandoned" ? new Date(+last.startedAt + ATTEMPT_MINUTES * 60_000) : last.endedAt };
}

export type Tone = "muted" | "bad" | "warn" | "good" | "info";
export interface TimelineRow { at: Date; tone: Tone; icon: "open" | "retry" | "x" | "left" | "clock" | "check" | "alert"; title: string; sub?: string }
const SHORT = (id: string) => (id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);

/** Το χρονολόγιο της κάρτας «Πληρωμή», παλιότερο πρώτο. `label`: όνομα τρόπου πληρωμής σε απλά ελληνικά. */
export function payTimeline(events: PayEvent[], label: (method: string | null | undefined) => string, now: number = Date.now()): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => ms(a.at) - ms(b.at))) {
    const dup = e.txId ? `${e.txId}:${e.kind}` : "";
    if (dup && seen.has(dup)) continue;
    if (dup) seen.add(dup);
    const at = new Date(e.at), tx = [e.card, e.txId ? `συναλλαγή ${SHORT(e.txId)}` : ""].filter(Boolean).join(" · ") || undefined;
    if (e.kind === "started") rows.push(e.source === "retry" ? { at, tone: "muted", icon: "retry", title: `Πάτησε «Δοκίμασε ξανά»: ${label(e.method)}` } : { at, tone: "muted", icon: "open", title: `Άνοιξε η σελίδα πληρωμής: ${label(e.method)}` });
    else if (e.kind === "failed") rows.push({ at, tone: "bad", icon: "x", title: `Απορρίφθηκε: ${reasonOf(e.eventId).label}`, sub: tx });
    else if (e.kind === "pending") rows.push({ at, tone: "info", icon: "clock", title: "Η τράπεζα επεξεργάζεται την πληρωμή", sub: tx });
    else if (e.kind === "review") rows.push({ at, tone: "warn", icon: "alert", title: "Θέλει έλεγχο: το ποσό στη Viva δεν ταιριάζει με την παραγγελία", sub: tx });
    else if (e.kind === "paid") rows.push({ at, tone: "good", icon: "check", title: "Πληρώθηκε", sub: tx });
  }
  for (const a of attemptsOf(events, now)) if (a.outcome === "abandoned") rows.push({ at: new Date(+a.startedAt + ATTEMPT_MINUTES * 60_000), tone: "warn", icon: "left", title: ABANDONED.label, sub: "Έληξε η σελίδα της Viva. Δεν έγινε χρέωση." });
  return rows.sort((a, b) => +a.at - +b.at);
}

// ---------- σελίδα «Αποτυχημένες πληρωμές» ----------
export interface BoardOrder { id: string; number: string; total: number; status: string; payStatus: string | null; payMethod: string | null; events: PayEvent[] }
export type BoardOutcome = "paid" | "cancelled" | "unpaid";
export interface BoardRow { id: string; number: string; total: number; outcome: BoardOutcome; payMethod: string | null; attempts: number; missed: number; reason: Reason; lastAt: Date }

export const outcomeOf = (o: { status: string; payStatus: string | null }): BoardOutcome => (o.payStatus === "paid" || o.payStatus === "partially-refunded" || o.payStatus === "refunded" ? "paid" : o.status === "cancelled" ? "cancelled" : "unpaid");

/** Οι παραγγελίες με τουλάχιστον μία χαμένη προσπάθεια, νεότερη πρώτη, και πόσες παραγγελίες δοκίμασαν συνολικά. */
export function failureRows(orders: BoardOrder[], now: number = Date.now()): { tried: number; rows: BoardRow[] } {
  const rows: BoardRow[] = [];
  for (const o of orders) {
    const t = payTrouble(o.events, now);
    if (t) rows.push({ id: o.id, number: o.number, total: o.total, outcome: outcomeOf(o), payMethod: o.payMethod, attempts: t.attempts, missed: t.missed, reason: t.reason, lastAt: t.lastAt });
  }
  return { tried: orders.length, rows: rows.sort((a, b) => +b.lastAt - +a.lastAt) };
}

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Αιτίες με πλήθος, μεγαλύτερη πρώτη: μία ανά παραγγελία (η τελευταία της), ώστε το άθροισμα να είναι οι γραμμές της λίστας. */
export function reasonCounts(rows: BoardRow[]): { key: string; label: string; count: number }[] {
  const m = new Map<string, { key: string; label: string; count: number }>();
  for (const r of rows) { const k = r.reason.key; m.set(k, { key: k, label: reasonLabel(k), count: (m.get(k)?.count ?? 0) + 1 }); }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "el"));
}

/** Πολλές ίδιες απορρίψεις σε λίγη ώρα δείχνουν πρόβλημα στον πάροχο, όχι στους πελάτες. */
export const SPIKE = { minutes: 60, count: 5 };
export function spikeOf(events: PayEvent[], now: number = Date.now()): { reason: Reason; count: number } | null {
  const m = new Map<string, { reason: Reason; count: number }>();
  for (const e of events) {
    if (e.kind !== "failed" || now - ms(e.at) > SPIKE.minutes * 60_000 || now < ms(e.at)) continue;
    const r = reasonOf(e.eventId);
    m.set(r.key, { reason: r, count: (m.get(r.key)?.count ?? 0) + 1 });
  }
  const top = [...m.values()].sort((a, b) => b.count - a.count)[0];
  return top && top.count >= SPIKE.count ? top : null;
}

/** «•••• 4821 · Τράπεζα» από τα στοιχεία της Viva: μόνο τα 4 τελευταία ψηφία, ποτέ τα πρώτα 6. */
export function cardText(cardNumber?: string | null, bank?: string | null): string | null {
  const last = (cardNumber ?? "").replace(/\s/g, "").match(/(\d{4})$/)?.[1];
  const b = (bank ?? "").trim().slice(0, 40);
  return last ? `•••• ${last}${b ? ` · ${b}` : ""}` : b || null;
}
