/**
 * EPREL με τον κωδικό του Κωτσόβολου: για προϊόντα με ενεργειακή ετικέτα στην κατηγορία, ΧΩΡΙΣ δεμένο EPREL και με ζευγάρι
 * auto/manual στον Κωτσόβολο, δοκιμάζει ως επιπλέον μοντέλο τους κωδικούς προμηθευτή του Κωτσόβολου (μία ανάγνωση ανά προϊόν,
 * με τον pacer) και τους κωδικούς του τίτλου του. Το ταίριασμα είναι του υπάρχοντος matcher (findInEprel): ίδιοι κανόνες.
 *
 *   npx tsx --conditions=react-server scripts/eprel-from-competitor.ts                 # dry-run: τι θα δέσει, καμία εγγραφή
 *   npx tsx --conditions=react-server scripts/eprel-from-competitor.ts --apply [--budget 400]
 *
 * --apply γράφει όπως το match-eprel (storeEprelMatch: EprelProduct, EnergyLabel, Spec, ProductDimension + eprelStatus).
 * Δεν αλλάζει το modelCode (το χρησιμοποιεί το ταίριασμα με τον Κωτσόβολο).
 */
try { process.loadEnvFile(); } catch {}
import { db } from "../lib/db";
import { eprelGroupsFor, findInEprel, storeEprelMatch } from "../lib/catalog/eprel-match";
import { refreshDimStatus } from "../lib/catalog/product-dimensions";
import { hasEprelKey } from "../lib/eprel/client";
import { fetchProduct } from "../lib/competitors/kotsovolos/client";
import { createPacer, KotStopError } from "../lib/competitors/kotsovolos/pacer";
import { modelTokens } from "../lib/competitors/kotsovolos/core";
import { isOddResponse } from "../lib/competitors/run-core";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); const n = i > 0 ? Number(process.argv[i + 1]) : NaN; return Number.isFinite(n) && n > 0 ? n : d; };

async function main() {
  if (!hasEprelKey()) throw new Error("Λείπει το EPREL_API_KEY στο .env.");
  const apply = process.argv.includes("--apply"), budget = arg("budget", 400);
  const types = (await db.category.findMany({ where: { source: "softone", depth: 2, productCount: { gt: 0 } }, select: { id: true, name: true } }))
    .map((c) => ({ id: c.id, groups: eprelGroupsFor(c.name) })).filter((c): c is { id: string; groups: string[] } => !!c.groups);
  const groupsOf = new Map(types.map((t) => [t.id, t.groups]));
  const products = await db.product.findMany({
    where: { source: "softone", active: true, categoryId: { in: [...groupsOf.keys()] }, OR: [{ energy: null }, { energy: { eprelRegistrationNumber: null } }],
      competitorPrices: { some: { competitor: "kotsovolos", match: { in: ["auto", "manual"] }, extId: { not: null } } } },
    select: { id: true, sku: true, title: true, categoryId: true, brand: { select: { name: true } }, competitorPrices: { where: { competitor: "kotsovolos" }, select: { extId: true, extTitle: true } } },
  });
  console.log(`${products.length} προϊόντα με ζευγάρι στον Κωτσόβολο χωρίς δεμένο EPREL`);

  const pacer = createPacer({ budget, until: new Date(Date.now() + 4 * 3600_000) });
  let odd = 0, matched = 0, ambiguous = 0, none = 0, noCodes = 0, stopped: string | null = null;
  const touched: string[] = [];
  try {
    for (const p of products) {
      const cp = p.competitorPrices[0];
      const r = await fetchProduct(cp.extId!, pacer);
      if ("error" in r) { if (!isOddResponse(r.error)) odd = 0; else if (++odd >= 5) throw new KotStopError("blocked", "5 συνεχόμενες μη έγκυρες απαντήσεις"); }
      else odd = 0;
      const codes = [...new Set([...("error" in r ? [] : r.supplierCodes), ...modelTokens(cp.extTitle ?? "")].map((c) => c.trim().toUpperCase()))]
        .filter((c) => c.replace(/[^A-Z0-9]/g, "").length >= 5 && /\d/.test(c)).slice(0, 4);
      if (!codes.length) { noCodes++; continue; }
      let hit = null, amb: string[] | null = null;
      for (const code of codes) {
        const out = await findInEprel(p, code, p.brand.name, groupsOf.get(p.categoryId)!); // ο κωδικός μπαίνει όπως το μοντέλο της φωτογραφίας: πρώτος υποψήφιος
        if (out.status === "matched") { hit = { code, raw: out.raw }; break; }
        if (out.status === "ambiguous" && !amb) amb = out.candidates ?? [];
      }
      if (hit) {
        matched++;
        console.log(`  ✓ ${p.title.slice(0, 50)} · κωδικός ${hit.code} → ${hit.raw.modelIdentifier} (${hit.raw.eprelRegistrationNumber}, κλάση ${hit.raw.energyClass ?? "—"})`);
        if (apply) { await storeEprelMatch(p.id, hit.raw); await db.product.update({ where: { id: p.id }, data: { eprelStatus: "matched", eprelCheckedAt: new Date() } }); touched.push(p.id); }
      } else if (amb) { ambiguous++; console.log(`  ? ${p.title.slice(0, 50)} · αμφίβολο: ${amb.slice(0, 3).join(", ")}`); }
      else none++;
    }
  } catch (e) {
    if (!(e instanceof KotStopError)) throw e;
    stopped = `σταμάτησε (${e.reason})`;
  }
  if (touched.length) await refreshDimStatus(touched);
  console.log(`${apply ? "Δέθηκαν" : "dry-run: θα δέσουν"} ${matched} · αμφίβολα ${ambiguous} · όχι ${none} · χωρίς κωδικό ${noCodes} · αναγνώσεις Κωτσόβολου ${pacer.used}${stopped ? ` · ${stopped}` : ""}`);
}
main().then(() => db.$disconnect()).catch(async (e) => { console.error("ΣΦΑΛΜΑ:", (e as Error).message); await db.$disconnect(); process.exit(1); });
