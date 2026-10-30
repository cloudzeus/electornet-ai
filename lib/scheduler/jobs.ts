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
  run: () => Promise<JobResult>;
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
    key: "category-ops", label: "Μετακινήσεις κατηγοριών προς SoftOne (συνέχεια μετά από διακοπή)", schedule: { everyMin: 1 }, group: "category-ops", maxMin: 6,
    run: async () => (await import("@/lib/catalog/category-ops")).runPendingOps(),
  },
  {
    key: "xml-feeds", label: "XML προμηθευτές: έλεγχος με SoftOne και εισαγωγή (συνέχεια μετά από διακοπή)", schedule: { everyMin: 1 }, group: "xml-feeds", maxMin: 6,
    run: async () => {
      const [{ runChecks }, { drainAll }] = await Promise.all([import("@/lib/catalog/xml-import/check"), import("@/lib/catalog/xml-import/queue")]);
      const c = await runChecks(120_000);
      const d = await drainAll(150_000);
      return { ok: c.ok && d.ok, idle: !!c.idle && !!d.idle, message: [c.idle ? null : c.message, d.idle ? null : d.message].filter(Boolean).join(" · ") };
    },
  },
];

export const jobByKey = (key: string) => JOBS.find((j) => j.key === key);
