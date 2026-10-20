import type { CheckResult } from "./rules";

/**
 * Μονάδες του ελέγχου ασφαλείας. ΚΑΘΑΡΟ αρχείο (μόνο τύποι). Ο runner (run.ts) τρέχει τους ελέγχους του mode παράλληλα,
 * με χρονικό όριο ο καθένας (execute.ts), και αποθηκεύει ένα SecurityReport.
 *   full  — καθημερινά, παράθυρο 24 ωρών· light — κάθε ώρα, παράθυρο μίας ώρας.
 */
export type AuditMode = "full" | "light";

export type AuditCtx = {
  mode: AuditMode;
  /** αρχή του παραθύρου (full: −24 ώρες, light: −1 ώρα) */
  since: Date;
  now: Date;
  /** ακυρώνεται όταν λήξει το χρονικό όριο του ελέγχου — οι μακριές σαρώσεις σταματούν σε αυτό */
  signal?: AbortSignal;
};

/**
 * Αποτέλεσμα ενός ελέγχου. `snapshot`: κατάσταση που κρατιέται στο report ώστε ο επόμενος έλεγχος να συγκρίνει με αυτήν
 * (π.χ. ποιοι είναι super-admin) — αλλαγές απευθείας στη βάση, χωρίς ίχνος στο ιστορικό ενεργειών, φαίνονται μόνο έτσι.
 */
export type CheckOutput = Omit<CheckResult, "key" | "title" | "ms"> & {
  snapshot?: unknown;
  /** false = μερική σάρωση (χρόνος, όριο, σφάλματα ανάγνωσης): το παράθυρο ΔΕΝ καλύφθηκε — δεν μετρά ως βάση του επόμενου light */
  complete?: boolean;
};

export type Check = {
  key: string;
  title: string;
  modes: AuditMode[];
  /** χρονικό όριο· ανά mode όταν διαφέρει (το light τρέχει κάθε ώρα με όριο 60″ για όλο τον έλεγχο) */
  timeoutMs: number | Record<AuditMode, number>;
  run(ctx: AuditCtx): Promise<CheckOutput>;
};

/** Όπως αποθηκεύεται στο SecurityReport.checks (το snapshot μόνο όταν υπάρχει). */
export type StoredCheck = CheckResult & { snapshot?: unknown; complete?: boolean };
