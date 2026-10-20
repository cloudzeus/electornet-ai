import { getBunny } from "@/lib/media/cdn";
import type { Finding } from "../rules";
import { athens } from "../execute";
import { BUNNY_ALLOWED } from "../policy";
import type { Check } from "../types";
import { bunnyOutcome, classifyObject, objectPath, svgThreat, underBase, capHit, type CapHit, type Flagged } from "./bunny-core";

/**
 * Bunny Storage: λίστα ΟΛΗΣ της ζώνης (όχι μόνο του basePath) αναδρομικά, έως 100.000 αρχεία (και 50.000 φακέλους — όριο ασφαλείας), και ανάγνωση των SVG
 * (< 1 MB) για script. Μόνο LIST / GET — καμία εγγραφή. Χρονικό όριο ~3′· ό,τι δεν πρόλαβε ή δεν διαβάστηκε (υποφάκελος,
 * SVG) → «μερική σάρωση» (warn). Μόνο αποτυχία στη ρίζα της ζώνης → error. Κρίσιμα μόνο όσα πρόσθεσε / άλλαξε κάποιος στο
 * διάστημα του ελέγχου (LastChanged ≥ since) — τα παλαιότερα επικίνδυνα σε ΕΝΑ warn (bunny-core.ts).
 */

/** λίστα: έως 150″· τα SVG έχουν δικό τους περιθώριο ως τα 185″ (το timeout του ελέγχου είναι 200″) */
const LIST_BUDGET_MS = 150_000;
const TOTAL_BUDGET_MS = 185_000;
const LIST_CONCURRENCY = 16;
const GET_CONCURRENCY = 8;
type Entry = { ObjectName: string; Path: string; IsDirectory: boolean; Length: number; LastChanged?: string };

async function pool<T>(items: T[] | (() => T | undefined), n: number, fn: (x: T) => Promise<void>, stop: () => boolean) {
  const next = typeof items === "function" ? items : (() => { let i = 0; return () => (i < items.length ? items[i++] : undefined); })();
  let active = 0;
  await new Promise<void>((resolve, reject) => {
    const pump = () => {
      if (stop()) { if (!active) resolve(); return; }
      let x: T | undefined;
      while (active < n && !stop() && (x = next()) !== undefined) { active++; fn(x).then(() => { active--; pump(); }, reject); }
      if (!active) resolve();
    };
    pump();
  });
}

export const bunnyCheck: Check = {
  key: "bunny",
  title: "Αρχεία στο Bunny Storage (CDN)",
  modes: ["full"],
  timeoutMs: 200_000,
  async run({ since, signal }) {
    const t0 = Date.now();
    const b = await getBunny();
    if (!b.zone || !b.storagePassword) return { status: "warn", complete: false, summary: "Το Bunny Storage δεν έχει ρυθμιστεί (ζώνη / κωδικός) — δεν ελέγχθηκε.", findings: [{ severity: "warn", title: "Το Bunny Storage δεν ελέγχθηκε", detail: "Λείπουν η ζώνη ή ο κωδικός αποθήκευσης στις Ρυθμίσεις → Bunny CDN." }] };
    const late = () => !!signal?.aborted || Date.now() - t0 > LIST_BUDGET_MS;
    const lateTotal = () => !!signal?.aborted || Date.now() - t0 > TOTAL_BUDGET_MS;
    const sig = () => (signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000));
    const url = (p: string) => `${b.storageHost}/${b.zone}/${p.split("/").map(encodeURIComponent).join("/")}`;
    const get = async (p: string) => {
      const res = await fetch(url(p), { headers: { AccessKey: b.storagePassword, Accept: p.endsWith("/") || !p ? "application/json" : "*/*" }, signal: sig(), cache: "no-store" });
      if (!res.ok) throw new Error(`Bunny Storage ${res.status} στο «/${p}»`);
      return res;
    };

    // 1) λίστα
    const queue: string[] = [""];
    let files = 0, dirs = 0, truncated = false, truncatedBy: CapHit | undefined;
    const svgs: { path: string; changed?: string }[] = [];
    const flagged: Flagged[] = [];
    const failedDirs: string[] = [];
    // ο φάκελος όπου γράφει η εφαρμογή (uploads, εικόνες, AR, αντίγραφα ασφαλείας)· κενός = όλη η ζώνη
    const bases = [b.basePath].filter((x) => x.replace(/\//g, ""));
    const outsideChanged: { path: string; changedAt: Date }[] = [];
    await pool(() => queue.shift(), LIST_CONCURRENCY, async (dir) => {
      let list: Entry[];
      // η ρίζα της ζώνης πρέπει να διαβαστεί (αλλιώς ο έλεγχος είναι error)· υποφάκελος που αποτυγχάνει = μη ελεγμένος
      if (!dir) list = (await (await get("")).json()) as Entry[];
      else try { list = (await (await get(`${dir}/`)).json()) as Entry[]; } catch { failedDirs.push(dir); return; }
      for (const o of list) {
        const hit = capHit(files, dirs, o.IsDirectory);
        if (hit) { truncated = true; truncatedBy ??= hit; break; }
        const p = objectPath(b.zone, o);
        if (o.IsDirectory) { dirs++; queue.push(p); continue; }
        files++;
        const c = classifyObject(p, o.Length);
        // το Bunny δίνει LastChanged σε UTC χωρίς «Z»
        const changedAt = o.LastChanged ? new Date(`${o.LastChanged.replace(/Z?$/, "Z")}`) : null;
        const at = changedAt && !Number.isNaN(changedAt.getTime()) ? changedAt : null;
        const when = at ? ` (τελευταία αλλαγή ${athens(at)})` : "";
        if (c.kind === "svg") svgs.push({ path: p, changed: when });
        else if (c.kind !== "ok") flagged.push({ path: p, kind: c.kind, reason: c.kind === "critical" ? `${c.reason}${when}` : c.reason, group: c.group, changedAt: at });
        // εκτός basePath: κάθε αρχείο που άλλαξε στο διάστημα (τα επικίνδυνα είναι ήδη κρίσιμα από μόνα τους)
        if (bases.length && c.kind !== "critical" && !underBase(p, bases) && (!at || at >= since)) outsideChanged.push({ path: p, changedAt: at ?? since });
      }
    }, () => truncated || late());
    const listIncomplete = !truncated && queue.length > 0; // σταμάτησε ο χρόνος με φακέλους που δεν διαβάστηκαν

    // 2) περιεχόμενο SVG
    const findings: Finding[] = [];
    let svgChecked = 0, svgFailed = 0;
    await pool(svgs, GET_CONCURRENCY, async (s) => {
      let text: string;
      try { text = await (await get(s.path)).text(); } catch { svgFailed++; return; }
      svgChecked++;
      const why = svgThreat(text);
      if (why) findings.push({ severity: "critical", title: "SVG με εκτελέσιμο κώδικα στο Bunny Storage", detail: `${s.path}: ${why}${s.changed ?? ""}. Ανοιγμένο απευθείας από το CDN εκτελεί κώδικα στο domain του CDN.`, evidence: s.path });
    }, lateTotal);

    return bunnyOutcome({ files, dirs, truncated, ...(truncatedBy ? { truncatedBy } : {}), listIncomplete, failedDirs, svgTotal: svgs.length, svgChecked, svgFailed, findings, flagged, since, allowed: BUNNY_ALLOWED, ...(bases.length ? { outsideChanged } : {}) });
  },
};
