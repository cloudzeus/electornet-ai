import { syncCatalog, type Trigger } from "@/lib/softone/catalog";
import { projectCatalog } from "@/lib/softone/project";
import { projectSetStock, syncSets } from "@/lib/softone/sets";
import { refreshProductDocs, embedStale } from "@/lib/vector/index";

const STEP: Record<string, string> = { "cat-webcat": "κατηγορίες web", "cat-specs": "ομάδες χαρακτηριστικών", "cat-items": "είδη", "cat-offers": "προσφορές / Εξαίρεση Web" };

/**
 * Ο πλήρης κύκλος καταλόγου: ανάγνωση από το SoftOne (μόνο ανάγνωση) → προβολή στο κατάστημα
 * (με την «Εξαίρεση Web») → ευρετήριο Ερμή → set ειδών. Τον καλούν το `/api/cron/softone-catalog`
 * και ο εσωτερικός scheduler. Επιστρέφει και ένα μήνυμα για άνθρωπο.
 */
export async function runCatalogJob(mode: "delta" | "full", trigger: Trigger) {
  const sync = await syncCatalog(mode, trigger);
  const failed = sync.filter((x) => !x.ok);
  if (failed.length) {
    return { ok: false, mode, sync, project: null, index: null, sets: null, message: `Ο συγχρονισμός σταμάτησε στο βήμα «${STEP[failed[0].kind] ?? failed[0].kind}»: ${failed[0].error ?? "άγνωστο σφάλμα"}. Το κατάστημα δεν άλλαξε.` };
  }
  // Χωρίς επιτυχή συγχρονισμό δεν αγγίζουμε ούτε το κατάστημα ούτε το ευρετήριο
  const project = await projectCatalog(trigger);
  const index = { docs: await refreshProductDocs(), emb: await embedStale(3000) };
  // «Set ειδών» (bundles): μέλη και απόθεμα → το απόθεμα του set στο προϊόν. Ανεξάρτητο — αποτυχία εδώ δεν σταματά τον κατάλογο.
  const sets = await syncSets(trigger).then(async (r) => ({ ...r, stockUpdated: r.ok ? await projectSetStock() : 0 })).catch((e) => ({ ok: false, error: String(e) }));
  const items = sync.find((x) => x.kind === "cat-items");
  const p = project.result?.products;
  const ok = project.ok !== false && !index.emb.error;
  const parts = [
    `${mode === "full" ? "Πλήρης" : "Σύντομος"} συγχρονισμός: ${items?.fetched ?? 0} είδη διαβάστηκαν (${items?.created ?? 0} νέα, ${items?.updated ?? 0} αλλαγμένα${items?.missing ? `, ${items.missing} λείπουν` : ""})`,
    project.ok ? `κατάστημα: ${p?.created ?? 0} νέα, ${p?.updated ?? 0} ενημερώθηκαν, ${p?.deactivated ?? 0} αποσύρθηκαν` : `η προβολή στο κατάστημα απέτυχε: ${project.error}`,
    index.emb.error ? `ευρετήριο Ερμή: ${index.emb.error}` : null,
    sets.ok === false ? `set ειδών: ${sets.error ?? "σφάλμα"}` : null,
  ].filter(Boolean);
  return { ok, mode, sync, project, index, sets, message: parts.join(" · ") };
}
