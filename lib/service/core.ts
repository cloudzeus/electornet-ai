/**
 * Αιτήματα service (ServiceTicket): καταστάσεις, επιτρεπτές μεταβάσεις, πορεία (timeline), αρίθμηση και ποιο email
 * στέλνεται σε κάθε αλλαγή. Καθαρές συναρτήσεις — τις χρησιμοποιούν η ουρά service της διαχείρισης, η καρτέλα πελάτη
 * και ο λογαριασμός του πελάτη.
 */

export const TICKET_STATUSES = ["new", "scheduled", "in-progress", "waiting-parts", "done", "cancelled"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Νέο",
  scheduled: "Με ραντεβού",
  "in-progress": "Σε εξέλιξη",
  "waiting-parts": "Αναμονή ανταλλακτικών",
  done: "Ολοκληρώθηκε",
  cancelled: "Ακυρώθηκε",
};

/** Χρώμα της ετικέτας κατάστασης (Tailwind) — ίδιο στη διαχείριση και στον λογαριασμό. */
export const STATUS_TONE: Record<string, string> = {
  new: "bg-eu-yellow/50 text-eu-navy",
  scheduled: "bg-eu-chip text-eu-blue",
  "in-progress": "bg-eu-blue/10 text-eu-blue",
  "waiting-parts": "bg-eu-amber/20 text-eu-ink-2",
  done: "bg-eu-green/10 text-eu-green",
  cancelled: "bg-eu-surface text-eu-muted",
};

export const KIND_LABEL: Record<string, string> = {
  repair: "Επισκευή",
  "warranty-claim": "Βλάβη σε εγγύηση",
  installation: "Εγκατάσταση",
  delivery: "Παράδοση με ραντεβού",
  pickup: "Παραλαβή",
  appointment: "Ραντεβού service",
};

export const MODE_LABEL: Record<string, string> = { visit: "Επίσκεψη τεχνικού", pickup: "Παραλαβή από τον χώρο σου", store: "Στο κατάστημα" };

/** Οι ζώνες ώρας που προτείνονται στον πελάτη και στη διαχείριση. */
export const SLOTS = ["Πρωί 9–13", "Μεσημέρι 13–17", "Απόγευμα 17–21", "Σάββατο"] as const;

/** Από πού μπορεί να πάει ένα αίτημα. Τα κλειστά (done / cancelled) ξανανοίγουν μόνο ρητά. */
export const NEXT_STATUS: Record<TicketStatus, TicketStatus[]> = {
  new: ["scheduled", "in-progress", "cancelled"],
  scheduled: ["in-progress", "done", "new", "cancelled"],
  "in-progress": ["waiting-parts", "scheduled", "done", "cancelled"],
  "waiting-parts": ["in-progress", "scheduled", "done", "cancelled"],
  done: ["in-progress"],
  cancelled: ["new"],
};

export const isStatus = (s: unknown): s is TicketStatus => typeof s === "string" && (TICKET_STATUSES as readonly string[]).includes(s);
export const isOpen = (s: string) => s !== "done" && s !== "cancelled";
export function canMove(from: string, to: string) {
  if (from === to) return true;
  return isStatus(from) && isStatus(to) && NEXT_STATUS[from].includes(to);
}

/** Μία γραμμή της πορείας. `kind` λείπει στις παλιές εγγραφές (= αλλαγή κατάστασης / σημείωση προσωπικού). */
export interface TimelineEntry {
  at: string;
  status: string;
  note?: string;
  by?: string;
  kind?: "status" | "note" | "reschedule-request" | "customer-note" | "email" | "attachment";
  /** για «reschedule-request»: τι ζήτησε ο πελάτης */
  request?: { date?: string; slot?: string };
  /** για «email»: ποιο πρότυπο στάλθηκε */
  template?: string;
  /** σημείωση που φαίνεται και στον πελάτη (οι εσωτερικές όχι) */
  public?: boolean;
}

export function parseTimeline(v: unknown): TimelineEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is TimelineEntry => !!x && typeof x === "object" && typeof (x as TimelineEntry).at === "string");
}

/**
 * Εκκρεμές αίτημα αλλαγής ώρας από τον πελάτη: το τελευταίο «reschedule-request» χωρίς καμία ενέργεια του προσωπικού
 * μετά από αυτό (ό,τι δεν είναι από τον πελάτη ή αυτόματο email μετρά ως απάντηση).
 */
export function openRescheduleRequest(tl: TimelineEntry[]): TimelineEntry | null {
  for (let i = tl.length - 1; i >= 0; i--) {
    const e = tl[i];
    if (e.kind === "reschedule-request") return e;
    if (e.by !== "customer" && e.kind !== "email") return null;
  }
  return null;
}

/** Τι βλέπει ο πελάτης από την πορεία: αλλαγές κατάστασης, δικά του μηνύματα, δημόσιες σημειώσεις — όχι εσωτερικές. */
export function customerTimeline(tl: TimelineEntry[]): { at: string; text: string; by: "customer" | "euronics" }[] {
  const out: { at: string; text: string; by: "customer" | "euronics" }[] = [];
  let last = "";
  for (const e of tl) {
    const mine = e.by === "customer";
    if (e.kind === "email") continue;
    if (e.kind === "reschedule-request") {
      out.push({ at: e.at, by: "customer", text: `Ζήτησες αλλαγή ώρας${e.request?.date ? `: ${fmtDay(e.request.date)}` : ""}${e.request?.slot ? `, ${e.request.slot}` : ""}${e.note ? ` — ${e.note}` : ""}` });
      continue;
    }
    if (e.kind === "customer-note" || e.kind === "attachment") {
      out.push({ at: e.at, by: "customer", text: e.note || "Πρόσθεσες φωτογραφίες" });
      continue;
    }
    const changed = e.status && e.status !== last;
    if (changed) last = e.status;
    const label = isStatus(e.status) ? STATUS_LABEL[e.status] : e.status;
    const note = mine || e.public ? e.note : undefined;
    if (changed) out.push({ at: e.at, by: mine ? "customer" : "euronics", text: note ? `${label} — ${note}` : label });
    else if (note) out.push({ at: e.at, by: mine ? "customer" : "euronics", text: note });
  }
  return out;
}

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "long" });
};

/** Επόμενος αριθμός SRV-xxxxx από τους υπάρχοντες (ο μεγαλύτερος + 1, τουλάχιστον 10001). */
export function nextTicketNumber(existing: (string | null | undefined)[]): string {
  let max = 10000;
  for (const s of existing) {
    const m = /^SRV-(\d+)$/.exec(s ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `SRV-${max + 1}`;
}

export interface TicketState { status: string; scheduledAt: Date | string | null; slot: string | null; technician: string | null }
export type TicketEmail = "appointment-confirmed" | "service-done" | "service-cancelled";

/** Ποιο email αξίζει να πάρει ο πελάτης για αυτή την αλλαγή (ή κανένα). */
export function emailFor(prev: TicketState, next: TicketState): TicketEmail | null {
  if (next.status === "cancelled" && prev.status !== "cancelled") return "service-cancelled";
  if (next.status === "done" && prev.status !== "done") return "service-done";
  if (!isOpen(next.status) || !next.scheduledAt) return null;
  const t = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);
  if (t(prev.scheduledAt) !== t(next.scheduledAt) || (prev.slot ?? "") !== (next.slot ?? "") || (prev.technician ?? "") !== (next.technician ?? "")) return "appointment-confirmed";
  return null;
}

/** Τα 4 βήματα που βλέπει ο πελάτης και σε ποιο βρίσκεται το αίτημα (−1 = ακυρώθηκε). */
export const CUSTOMER_STEPS = ["Καταχωρήθηκε", "Ραντεβού", "Σε εξέλιξη", "Ολοκληρώθηκε"] as const;
export function customerStep(status: string, scheduled: boolean): number {
  if (status === "cancelled") return -1;
  if (status === "done") return 3;
  if (status === "in-progress" || status === "waiting-parts") return 2;
  return scheduled || status === "scheduled" ? 1 : 0;
}

/** Συνημμένα αιτήματος (JSON): [{ url, thumb, kind, name }] */
export interface TicketAttachment { url: string; thumb?: string | null; kind: "image" | "video" | "file"; name?: string; at?: string; by?: string }
export function parseAttachments(v: unknown): TicketAttachment[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => (typeof x === "string" ? [{ url: x, kind: /\.(mp4|mov|webm)$/i.test(x) ? "video" as const : "image" as const }] : x && typeof x === "object" && typeof (x as TicketAttachment).url === "string" ? [x as TicketAttachment] : []));
}
