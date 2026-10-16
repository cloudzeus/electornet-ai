/**
 * Καμπάνια: ο φάκελος που ομαδοποιεί προσφορές, landing pages και banners με κοινές ημερομηνίες και budget.
 * Καθαρή λογική (χωρίς βάση / δίκτυο): στόχοι, καταστάσεις, κωδικός, έλεγχοι, χρήση budget.
 * Προδιαγραφή: docs/superpowers/specs/2026-10-16-campaigns-approval-design.md
 */
export type CampaignGoal = "sales" | "clearance" | "acquisition" | "launch" | "seasonal";

export const CAMPAIGN_GOALS: Record<CampaignGoal, { label: string; help: string; measures: string }> = {
  sales: { label: "Αύξηση πωλήσεων", help: "Περισσότερες πωλήσεις σε προϊόντα ή κατηγορίες για μια περίοδο.", measures: "Μετράμε έσοδα, παραγγελίες και έσοδα ανά 1 € έκπτωσης." },
  clearance: { label: "Εκκαθάριση αποθέματος", help: "Να φύγει απόθεμα (παλιά μοντέλα, εκθεσιακά, αργή κίνηση).", measures: "Μετράμε τεμάχια που έφυγαν και απόθεμα που έμεινε." },
  acquisition: { label: "Νέοι πελάτες", help: "Πρώτη αγορά από νέους πελάτες (κουπόνια καλωσορίσματος, newsletter).", measures: "Μετράμε νέους πελάτες και κόστος ανά νέο πελάτη." },
  launch: { label: "Λανσάρισμα", help: "Νέο προϊόν ή νέα μάρκα, συχνά με δώρο ή συμμετοχή του κατασκευαστή.", measures: "Μετράμε τεμάχια του νέου προϊόντος και επισκέψεις στη landing page." },
  seasonal: { label: "Εποχική", help: "Black Friday, Χριστούγεννα, επιστροφή στα σχολεία, καλοκαίρι.", measures: "Μετράμε έσοδα σε σχέση με την ίδια περίοδο πέρσι και την προηγούμενη περίοδο." },
};

export type CampaignStatus = "draft" | "review" | "approved" | "scheduled" | "live" | "paused" | "ended" | "archived" | "rejected";
export type Tone = "neutral" | "info" | "good" | "warn" | "bad";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: "Πρόχειρη", tone: "neutral" },
  review: { label: "Για έγκριση", tone: "warn" },
  approved: { label: "Εγκρίθηκε", tone: "info" },
  scheduled: { label: "Προγραμματισμένη", tone: "info" },
  live: { label: "Σε εξέλιξη", tone: "good" },
  paused: { label: "Σε παύση", tone: "warn" },
  ended: { label: "Έληξε", tone: "neutral" },
  archived: { label: "Αρχείο", tone: "neutral" },
  rejected: { label: "Απορρίφθηκε", tone: "bad" },
};

/** Δημοσιευμένη καμπάνια: η κατάσταση βγαίνει από τις ημερομηνίες. */
export function liveState(start: Date, end: Date, now: Date): "scheduled" | "live" | "ended" {
  // πρώτα η λήξη: καμπάνια που τερματίστηκε πριν ξεκινήσει (λήξη < έναρξη) έχει λήξει
  if (now > end) return "ended";
  return now < start ? "scheduled" : "live";
}

/** Η κατάσταση που βλέπει ο χρήστης: «Προγραμματισμένη» / «Σε εξέλιξη» από τις ημερομηνίες· η «Λήξη» (και κάθε άλλη) μένει όπως αποθηκεύτηκε. */
export function displayStatus(stored: string, start: Date, end: Date, now: Date): CampaignStatus {
  return stored === "scheduled" || stored === "live" ? liveState(start, end, now) : (stored as CampaignStatus);
}

/** Μόνο πρόχειρα χωρίς δικές τους ημερομηνίες παίρνουν τις ημερομηνίες της καμπάνιας — ό,τι τρέχει ήδη δεν αλλάζει σιωπηλά. */
export const takesCampaignDates = (x: { status: string; startsAt: Date | null }) => x.status === "draft" && !x.startsAt;

/** Το μήνυμα μετά τη δημοσίευση: επιτυχία, μερική (η καμπάνια δημοσιεύτηκε, κάποιες προσφορές όχι) ή απόρριψη (τίποτα δεν άλλαξε). */
export function publishOutcome(r: { errors: string[]; published: number; pending: number; rejected: boolean }): { tone: "ok" | "warn" | "bad"; text: string } {
  if (r.rejected) return { tone: "bad", text: `Δεν δημοσιεύτηκε: ${r.errors.join(" ")}` };
  const parts = [`${r.published} σε ισχύ / προγραμματισμένες`, ...(r.pending ? [`${r.pending} ${r.pending === 1 ? "αναμένει" : "αναμένουν"} έγκριση`] : [])];
  if (!r.errors.length) return { tone: "ok", text: `Δημοσιεύτηκε: ${parts.join(" · ")}.` };
  return { tone: "warn", text: `Δημοσιεύτηκε με προβλήματα: ${parts.join(" · ")} · ${r.errors.length} ${r.errors.length === 1 ? "απέτυχε" : "απέτυχαν"}: ${r.errors.join(" ")}` };
}

export interface CampaignDraft {
  id?: string;
  title: string;
  goal: CampaignGoal;
  brief?: string;
  startsAt: string | null;
  endsAt: string | null;
  budgetEur: number | null;
  ownerId?: string | null;
}

type PromoWindow = { id: string; name: string; startsAt: Date | null; endsAt: Date | null; status?: string };

/** Ώρα Ελλάδας (+2 / +3 με θερινή) σε λεπτά, για μια στιγμή. */
function athensOffsetMin(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Athens", timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 120;
}

/**
 * Ημερομηνία καμπάνιας yyyy-mm-dd → στιγμή, σε ώρα Ελλάδας: έναρξη 00:00, λήξη 23:59:59.999 της ημέρας.
 * Ό,τι δεν είναι σκέτη ημερομηνία διαβάζεται όπως είναι.
 */
export function campaignDay(v: string | null | undefined, edge: "start" | "end"): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), edge === "end" ? 23 : 0, edge === "end" ? 59 : 0, edge === "end" ? 59 : 0, edge === "end" ? 999 : 0);
  return new Date(utc - athensOffsetMin(new Date(utc)) * 60_000);
}
const day = (d: Date) => d.toLocaleDateString("el-GR", { day: "numeric", month: "short", timeZone: "Europe/Athens" });

/**
 * Έλεγχοι πριν την αποθήκευση (publish: false) ή τη δημοσίευση (publish: true). Λάθη εμποδίζουν, προειδοποιήσεις όχι.
 * Οι ημερομηνίες έρχονται ως yyyy-mm-dd (έναρξη στην αρχή της ημέρας, λήξη στο τέλος της).
 */
export function validateCampaign(d: CampaignDraft, promos: PromoWindow[], opts: { publish: boolean; now: Date }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (d.title.trim().length < 3) errors.push("Δώσε όνομα στην καμπάνια (τουλάχιστον 3 χαρακτήρες).");
  if (!(d.goal in CAMPAIGN_GOALS)) errors.push("Διάλεξε στόχο για την καμπάνια.");
  const start = campaignDay(d.startsAt, "start"), end = campaignDay(d.endsAt, "end");
  if (!start) errors.push("Βάλε ημερομηνία έναρξης.");
  if (!end) errors.push("Βάλε ημερομηνία λήξης.");
  if (start && end && end < start) errors.push("Η λήξη είναι πριν την έναρξη.");
  if (opts.publish && end && end < opts.now) errors.push("Η λήξη είναι στο παρελθόν — άλλαξε τις ημερομηνίες για να δημοσιευτεί.");
  if (d.budgetEur != null && !(d.budgetEur >= 0)) errors.push("Το budget δεν μπορεί να είναι αρνητικό.");
  if (!promos.length) (opts.publish ? errors : warnings).push("Η καμπάνια δεν έχει καμία προσφορά ακόμη.");
  if (start && end) {
    for (const p of promos) {
      const out = (p.startsAt && p.startsAt < start) || (p.endsAt && p.endsAt > end);
      if (out) warnings.push(`Η προσφορά «${p.name}» έχει δικές της ημερομηνίες (${p.startsAt ? day(p.startsAt) : "…"} – ${p.endsAt ? day(p.endsAt) : "…"}) εκτός της καμπάνιας.`);
      if (!p.endsAt && p.status && ["active", "scheduled", "paused"].includes(p.status)) warnings.push(`Η προσφορά «${p.name}» τρέχει ήδη χωρίς λήξη — δεν παίρνει αυτόματα τις ημερομηνίες της καμπάνιας· βάλε λήξη στην ίδια την προσφορά.`);
    }
  }
  return { errors, warnings };
}

/** KAM-<έτος>-<3ψήφιο>: ο επόμενος της χρονιάς. */
export function nextCampaignCode(existing: string[], year: number): string {
  const re = new RegExp(`^KAM-${year}-(\\d+)$`);
  const max = existing.reduce((m, c) => { const x = re.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `KAM-${year}-${String(max + 1).padStart(3, "0")}`;
}

/** Πόσο από το budget έχει δοθεί σε εκπτώσεις. Χωρίς budget (ή 0): μόνο το ποσό. */
export function budgetUse(spent: number, budget: number | null): { pct: number | null; over: boolean; left: number | null } {
  if (!budget || budget <= 0) return { pct: null, over: false, left: null };
  return { pct: Math.round((spent / budget) * 1000) / 10, over: spent > budget, left: Math.round((budget - spent) * 100) / 100 };
}
