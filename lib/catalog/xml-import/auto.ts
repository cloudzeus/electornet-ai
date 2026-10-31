import "server-only";
import { db } from "@/lib/db";
import { feedBytes } from "@/lib/catalog/xml-import/snapshot";
import { runFeed, loadFeed, isMapped } from "@/lib/catalog/xml-import/feed";
import { startCheck } from "@/lib/catalog/xml-import/check";
import { enqueuePending } from "@/lib/catalog/xml-import/queue";
import { feedDue, normSchedule } from "@/lib/catalog/xml-import/schedule-core";

/**
 * Αυτόματη ενημέρωση (upsert) από το XML, με το πρόγραμμα του πρώτου βήματος του οδηγού:
 * λήψη (σεβόμενη το όριο του προμηθευτή) → «Έλεγχος με SoftOne» → όταν τελειώσει, «Εφαρμογή αλλαγών» στα **υπάρχοντα** είδη.
 * Τα νέα είδη δεν μπαίνουν ποτέ από εδώ: μένουν στα «Νέα είδη» για επιλογή και έγκριση.
 */
export async function runAutoFeeds(now = new Date()): Promise<{ started: string[]; applied: string[]; errors: string[] }> {
  const feeds = await db.supplierFeed.findMany({ where: { active: true }, select: { id: true, schedule: true, minFetchMin: true, lastAutoAt: true, autoPending: true, checkStatus: true, supplier: { select: { name: true } } } });
  const started: string[] = [], applied: string[] = [], errors: string[] = [];
  for (const f of feeds) {
    const name = f.supplier.name;
    try {
      // 1. ο έλεγχος της προηγούμενης αυτόματης λήψης τελείωσε → εφαρμογή
      if (f.autoPending && f.checkStatus !== "running") {
        await db.supplierFeed.update({ where: { id: f.id }, data: { autoPending: false } });
        if (f.checkStatus === "done") { const n = await enqueuePending(f.id); applied.push(`${name}: ${n}`); }
        else errors.push(`${name}: ο έλεγχος απέτυχε — δεν εφαρμόστηκε τίποτα`);
        continue;
      }
      if (f.autoPending || f.checkStatus === "running") continue;
      // 2. σειρά του;
      const sched = normSchedule(f.schedule, f.minFetchMin);
      if (!feedDue(sched, f.lastAutoAt, now)) continue;
      await db.supplierFeed.update({ where: { id: f.id }, data: { lastAutoAt: now } });
      const feed = await loadFeed(f.id);
      if (!isMapped(feed.cfg)) continue;
      await runFeed(f.id, async (url) => (await feedBytes(url, { intent: "fresh", minFetchMin: f.minFetchMin })).bytes);
      await startCheck(f.id, { policy: feed.policy, priceMode: feed.priceMode === "retail" ? "retail" : "cost" });
      await db.supplierFeed.update({ where: { id: f.id }, data: { autoPending: true } });
      started.push(name);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { started, applied, errors };
}
