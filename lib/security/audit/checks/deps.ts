import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Finding } from "../rules";
import { statusOf } from "../rules";
import type { Check } from "../types";
import { chunks, depsSummary, mapOsv, OSV_MAX_DETAILS, parseLock, toOsvQueries, type OsvEntry, type OsvVuln } from "../osv";

/**
 * Βιβλιοθήκες: τα πακέτα παραγωγής του package-lock.json του build που τρέχει (process.cwd()) → OSV querybatch (παρτίδες
 * 1.000) → λεπτομέρειες μόνο για όσες ευπάθειες βρέθηκαν (έως 50, με χρονικό όριο). Μόνο αναγνώσεις (POST querybatch είναι
 * ερώτημα, όχι εγγραφή). OSV μη διαθέσιμο → error, ποτέ ok.
 */

const OSV = "https://api.osv.dev/v1";
const FETCH_MS = 15_000;
const DETAILS_BUDGET_MS = 45_000;
const DETAILS_CONCURRENCY = 8;

const sig = (signal?: AbortSignal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_MS)]) : AbortSignal.timeout(FETCH_MS));
/** fetch με 2 επαναλήψεις σε σφάλμα δικτύου / 429 / 5xx. */
async function osvFetch(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    if (signal?.aborted) break;
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: sig(signal), cache: "no-store" });
      if (res.ok) return await res.json();
      last = new Error(`OSV HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw last instanceof Error ? last : new Error(String(last ?? "OSV: ακύρωση"));
}

/** Το package-lock.json του build: στον φάκελο της εφαρμογής (και δύο επίπεδα πάνω όταν τρέχει από .next/standalone). */
async function readLock(): Promise<{ json: unknown; shown: string }> {
  const cwd = process.cwd();
  const cands = [path.join(cwd, "package-lock.json"), ...(/[\\/]\.next[\\/]standalone$/.test(cwd) ? [path.join(cwd, "..", "..", "package-lock.json")] : [])];
  for (const p of cands) {
    try { return { json: JSON.parse(await readFile(p, "utf8")), shown: path.relative(cwd, p) || "package-lock.json" }; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Το ${p} δεν διαβάστηκε: ${(e as Error).message}`);
    }
  }
  throw new Error(`Δεν βρέθηκε package-lock.json στο ${cwd}`);
}

const fail = (summary: string, detail: string) => ({ status: "error" as const, complete: false, summary, findings: [{ severity: "error" as const, title: "Οι βιβλιοθήκες δεν ελέγχθηκαν", detail }] });

export const depsCheck: Check = {
  key: "deps",
  title: "Βιβλιοθήκες (γνωστές ευπάθειες — OSV)",
  modes: ["full"],
  timeoutMs: 120_000,
  async run({ signal }) {
    let lock: { json: unknown; shown: string };
    let pkgs;
    try { lock = await readLock(); pkgs = parseLock(lock.json); } catch (e) {
      return fail("Δεν διαβάστηκε το package-lock.json — οι βιβλιοθήκες δεν ελέγχθηκαν.", (e as Error).message);
    }
    if (!pkgs.length) return fail("Το package-lock.json δεν έχει πακέτα παραγωγής — οι βιβλιοθήκες δεν ελέγχθηκαν.", `${lock.shown}: κανένα πακέτο εκτός devDependencies.`);

    // 1) querybatch: μόνο ids ανά πακέτο (με τη σειρά των ερωτημάτων)
    const ids: { id: string }[][] = [];
    let paged = 0;
    try {
      for (const part of chunks(toOsvQueries(pkgs))) {
        const r = (await osvFetch(`${OSV}/querybatch`, { method: "POST", body: JSON.stringify({ queries: part }) }, signal)) as { results?: { vulns?: { id: string }[]; next_page_token?: string }[] };
        if (!Array.isArray(r.results) || r.results.length !== part.length) throw new Error(`OSV: απάντηση με ${r.results?.length ?? 0} αποτελέσματα για ${part.length} ερωτήματα`);
        for (const x of r.results) { ids.push(x.vulns ?? []); if (x.next_page_token) paged++; }
      }
    } catch (e) {
      return fail("Το OSV (osv.dev) δεν απάντησε — οι βιβλιοθήκες δεν ελέγχθηκαν.", `${(e as Error).message}. Ο έλεγχος θα ξαναγίνει στο επόμενο πλήρες report.`);
    }

    // 2) λεπτομέρειες μόνο των ευπαθειών που βρέθηκαν (έως OSV_MAX_DETAILS, με χρονικό όριο)
    const unique = [...new Set(ids.flat().map((v) => v.id))].sort();
    const want = unique.slice(0, OSV_MAX_DETAILS);
    const details = new Map<string, OsvVuln>();
    const t0 = Date.now();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(DETAILS_CONCURRENCY, want.length) }, async () => {
      while (next < want.length && !signal?.aborted && Date.now() - t0 < DETAILS_BUDGET_MS) {
        const id = want[next++];
        try { details.set(id, (await osvFetch(`${OSV}/vulns/${encodeURIComponent(id)}`, { method: "GET" }, signal)) as OsvVuln); } catch { /* → άγνωστη σοβαρότητα */ }
      }
    }));

    const entries: OsvEntry[] = pkgs.map((pkg, i) => ({ pkg, vulns: ids[i].map((v) => details.get(v.id) ?? { id: v.id }) }));
    const { findings, tally } = mapOsv(entries);
    const extra: Finding[] = paged ? [{ severity: "warn", title: "Μερικά αποτελέσματα από το OSV", detail: `Για ${paged} πακέτα το OSV επέστρεψε μόνο την πρώτη σελίδα ευπαθειών — μπορεί να λείπουν κάποιες.` }] : [];
    const all = [...findings, ...extra];
    return { status: statusOf(all), summary: depsSummary(tally, { lockPath: lock.shown, detailsRead: details.size, detailsWanted: unique.length }), findings: all, complete: !paged };
  },
};
