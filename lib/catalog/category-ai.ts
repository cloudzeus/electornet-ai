import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { groupOfCategory } from "@/lib/catalog/supplier-sheet";
import { categoryOptions } from "@/lib/catalog/foreign-import/options";
import { CAT_BATCH, CAT_MAX, CAT_SYSTEM, catUser, readGuesses, type CatAsk, type CatGuess, type CatOption } from "@/lib/catalog/category-ai-core";

export type { CatAsk, CatGuess } from "@/lib/catalog/category-ai-core";

/**
 * Πρόταση κατηγορίας ανά προϊόν, **μόνο όταν το ζητήσει ο χρήστης** (κάθε πάτημα είναι κλήσεις AI με κόστος). Στόχοι είναι
 * οι κατηγορίες που δίνουν ομάδα χαρακτηριστικών (οι «τύποι προϊόντος» του SoftOne): μόνο με αυτές δημιουργείται νέο είδος.
 * Ίδιος μηχανισμός για κάθε δρόμο εισαγωγής — Excel, XML, Keyvoto — γιατί όλοι καταλήγουν σε «όνομα + μάρκα → κατηγορία».
 * Τίποτα δεν γράφεται εδώ: επιστρέφονται προτάσεις και ο καλών τις δείχνει για αποδοχή.
 */
/** Οι κατηγορίες του eshop που αντιστοιχούν σε ομάδα χαρακτηριστικών του SoftOne — μόνο αυτές μπορεί να πάρει ένα είδος. */
export async function groupedCategories(): Promise<CatOption[]> {
  const [paths, cats] = await Promise.all([categoryOptions(), db.category.findMany({ where: { erpCode: { startsWith: "s1:g:" } }, select: { id: true, erpCode: true } })]);
  const pathOf = new Map(paths.map((p) => [p.id, p.path]));
  return cats.map((c) => ({ id: c.id, path: pathOf.get(c.id) ?? "", groupS1Id: groupOfCategory(c.erpCode) ?? 0 })).filter((o) => o.path && o.groupS1Id > 0).sort((a, b) => a.path.localeCompare(b.path, "el"));
}

export async function suggestProductCategories(asks: CatAsk[]): Promise<{ guesses: CatGuess[]; asked: number; left: number; /** οι κατηγορίες από τις οποίες διάλεξε το AI — για να διορθώσει ο χρήστης μια πρόταση με το χέρι */ options: { id: string; name: string }[] }> {
  const list = asks.filter((a) => a.name.trim());
  if (!list.length) throw new UserError("Κανένα προϊόν δεν έχει όνομα για να προταθεί κατηγορία.");
  const cfg = await getAi();
  if (!cfg) throw new UserError("Το AI δεν έχει ρυθμιστεί (Ρυθμίσεις → AI) — διάλεξε την κατηγορία με το χέρι.");
  if (await overBudget(cfg)) throw new UserError("Το ημερήσιο όριο του AI έχει εξαντληθεί — δοκίμασε αύριο ή διάλεξε την κατηγορία με το χέρι.");

  const options = await groupedCategories();
  if (!options.length) throw new UserError("Δεν υπάρχουν κατηγορίες με ομάδα χαρακτηριστικών για να προταθούν.");

  const now = list.slice(0, CAT_MAX);
  const guesses: CatGuess[] = [];
  let answered = 0;
  for (let i = 0; i < now.length; i += CAT_BATCH) {
    const part = now.slice(i, i + CAT_BATCH);
    const r = await chat({ feature: "category-suggest", messages: [{ role: "system", content: CAT_SYSTEM }, { role: "user", content: JSON.stringify(catUser(options, part)) }], json: true, maxTokens: Math.max(cfg.maxTokens, 2500), reasoning: "low", timeoutMs: 45000 }).catch(() => null);
    const j = r ? parseJson<unknown>(r.text) : null;
    if (!j) continue;
    answered++;
    guesses.push(...readGuesses(j, options, part));
  }
  if (!answered) throw new UserError("Το AI δεν απάντησε — δοκίμασε ξανά σε λίγο.");
  return { guesses, asked: now.length, left: list.length - now.length, options: options.map((o) => ({ id: o.id, name: o.path })) };
}
