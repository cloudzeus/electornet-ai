import type { Schedule } from "./due";

/** `idle` = δεν υπήρχε δουλειά: δεν γράφεται στο ιστορικό, για να μη σβήνει το τελευταίο ουσιαστικό μήνυμα. */
export interface JobResult { ok: boolean; message: string; idle?: boolean }
export interface JobDef {
  key: string;
  label: string;
  schedule: Schedule;
  /** Εργασίες της ίδιας ομάδας δεν τρέχουν ποτέ ταυτόχρονα */
  group: string;
  /** Μέγιστη διάρκεια — μετά το lock θεωρείται εγκαταλειμμένο (π.χ. ο server έπεσε στη μέση) */
  maxMin: number;
  /** `trigger` = «manual» από «Τρέξε τώρα»· οι περισσότερες εργασίες το αγνοούν */
  run: (trigger: "cron" | "manual") => Promise<JobResult>;
}

/** Οι αυτόματες εργασίες. Νέα εργασία = μία γραμμή εδώ· ο scheduler και η σελίδα συγχρονισμών τη βλέπουν μόνες τους. */
export const JOBS: JobDef[] = [
  {
    key: "db-backup", label: "Αντίγραφο ασφαλείας βάσης → Bunny Storage (κρυπτογραφημένο)", schedule: { dailyAt: [2, 30] }, group: "backup", maxMin: 10,
    run: async () => {
      const r = await (await import("@/lib/backup/run")).runBackup("cron");
      return { ok: r.ok, message: r.ok ? `${((r.bytes ?? 0) / 1024).toFixed(0)} KB${r.encrypted ? " · AES-256" : " · ΧΩΡΙΣ κρυπτογράφηση"} σε ${(r.ms / 1000).toFixed(0)}″${r.pruned ? ` · ${r.pruned} παλιά διαγράφηκαν` : ""}` : r.error ?? "Απέτυχε" };
    },
  },
  {
    key: "softone-catalog-delta", label: "Κατάλογος SoftOne → κατάστημα (αλλαγές)", schedule: { everyMin: 30 }, group: "softone-catalog", maxMin: 20,
    run: async () => (await import("@/lib/softone/catalog-job")).runCatalogJob("delta", "cron"),
  },
  {
    key: "softone-prices", label: "Τιμές SoftOne (Τιμή Web) → κατάστημα", schedule: { everyMin: 10 }, group: "softone-catalog", maxMin: 5,
    run: async () => (await import("@/lib/softone/catalog-job")).runPriceJob("cron"),
  },
  {
    key: "softone-dims", label: "Διαστάσεις & βάρος SoftOne (Βάρος, Μήκος, Πλάτος, Ύψος, Μάζα, Διάσταση 1-3) → κατάστημα", schedule: { everyMin: 10 }, group: "softone-catalog", maxMin: 8,
    run: async () => (await import("@/lib/catalog/dims-missing")).runDimsJob(),
  },
  {
    key: "softone-catalog-full", label: "Κατάλογος SoftOne → κατάστημα (πλήρης, εντοπίζει όσα αφαιρέθηκαν)", schedule: { dailyAt: [3, 30] }, group: "softone-catalog", maxMin: 40,
    run: async () => (await import("@/lib/softone/catalog-job")).runCatalogJob("full", "cron"),
  },
  {
    key: "softone-lookups", label: "Πίνακες αναφοράς SoftOne (ΦΠΑ, μονάδες, μάρκες…)", schedule: { dailyAt: [3, 0] }, group: "softone-lookups", maxMin: 20,
    run: async () => {
      const r = await (await import("@/lib/softone/lookups")).syncAllLookups("cron");
      const bad = r.filter((x) => !x.ok);
      return { ok: !bad.length, message: bad.length ? `${bad.length} από ${r.length} πίνακες απέτυχαν: ${bad.map((b) => `${b.kind} (${"error" in b ? b.error : "σφάλμα"})`).join(", ")}` : `${r.length} πίνακες ενημερώθηκαν χωρίς σφάλμα` };
    },
  },
  {
    key: "order-erp-stages", label: "Πορεία παραγγελιών στο SoftOne → ενημέρωση πελάτη (Παραγγελίες → Ρυθμίσεις ενημέρωσης)", schedule: { everyMin: 15 }, group: "order-erp-stages", maxMin: 12,
    run: async () => (await import("@/lib/orders/erp-stages")).runErpStages(),
  },
  {
    key: "unpaid-orders", label: "Απλήρωτες online παραγγελίες: email με σύνδεσμο πληρωμής στον πελάτη και ενημέρωση προσωπικού στα 30′, ακύρωση στις 24 ώρες", schedule: { everyMin: 5 }, group: "unpaid-orders", maxMin: 5,
    run: async () => {
      const m = await import("@/lib/payments/order-payment");
      const r = await m.remindUnpaidOnline(), c = await m.cancelUnpaidOnline(24);
      return { ok: true, message: `${r.sent} υπενθυμίσεις · ${c.cancelled} ακυρώσεις`, idle: !r.sent && !c.cancelled };
    },
  },
  {
    // shortcut: γενέθλια, προσωπικές προσφορές και newsletters τρέχουν ακόμη μόνο από το /api/cron/promos· αν το εξωτερικό cron δεν καλείται, θέλουν κι αυτά εργασία εδώ
    key: "cart-reminders", label: "Υπενθύμιση καλαθιού με email (Προσφορές → Κανόνες: πελάτες με λογαριασμό και συγκατάθεση)", schedule: { everyMin: 15 }, group: "cart-reminders", maxMin: 10,
    run: async () => {
      const r = await (await import("@/lib/promo/jobs")).runCartReminders({ force: true });
      return "skipped" in r ? { ok: true, message: "Κλειστή στους Κανόνες προσφορών", idle: true } : { ok: true, message: `${r.sent} υπενθυμίσεις από ${r.carts} καλάθια`, idle: !r.sent };
    },
  },
  {
    key: "category-ops", label: "Μετακινήσεις κατηγοριών προς SoftOne (συνέχεια μετά από διακοπή)", schedule: { everyMin: 1 }, group: "category-ops", maxMin: 6,
    run: async () => (await import("@/lib/catalog/category-ops")).runPendingOps(),
  },
  {
    key: "xml-feeds", label: "XML προμηθευτές: αυτόματη ενημέρωση, έλεγχος με SoftOne και εισαγωγή", schedule: { everyMin: 1 }, group: "xml-feeds", maxMin: 6,
    run: async () => {
      const [{ runChecks }, { drainAll }, { runAutoFeeds }] = await Promise.all([import("@/lib/catalog/xml-import/check"), import("@/lib/catalog/xml-import/queue"), import("@/lib/catalog/xml-import/auto")]);
      // αυτόματη ενημέρωση με το πρόγραμμα κάθε feed: λήψη → έλεγχος → (στο επόμενο πέρασμα) εφαρμογή στα υπάρχοντα
      const a = await runAutoFeeds();
      const c = await runChecks(120_000);
      const d = await drainAll(150_000);
      const auto = [a.started.length ? `Αυτόματη λήψη: ${a.started.join(", ")}` : null, a.applied.length ? `Εφαρμογή: ${a.applied.join(", ")}` : null, ...a.errors];
      const autoIdle = !a.started.length && !a.applied.length && !a.errors.length;
      return { ok: c.ok && d.ok && !a.errors.length, idle: autoIdle && !!c.idle && !!d.idle, message: [...auto, c.idle ? null : c.message, d.idle ? null : d.message].filter(Boolean).join(" · ") };
    },
  },
  {
    key: "competitor-kotsovolos", label: "Τιμές Κωτσόβολου (σύγκριση)", schedule: { dailyAt: [1, 0] }, group: "competitors", maxMin: 320,
    run: async (trigger) => (await import("@/lib/competitors/run")).runCompetitorJob(trigger),
  },
];

export const jobByKey = (key: string) => JOBS.find((j) => j.key === key);
