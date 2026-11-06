/** Τα τεχνικά χαρακτηριστικά των προϊόντων του σκετς (πίνακας Spec + σύντομη περιγραφή), για να απαντά ο Ερμής σε «πόσο νερό;», «πόσο θόρυβο;»… */
import { db } from "../../lib/db";
import type { Snapshot } from "../../lib/skets/types";

export async function attachSpecs(snap: Snapshot) {
  const ids = snap.cats.flatMap((c) => c.candidates.map((p) => p.id));
  const [specs, prods] = await Promise.all([
    db.spec.findMany({ where: { productId: { in: ids } }, orderBy: [{ sortNo: "asc" }], select: { productId: true, groupName: true, key: true, value: true } }),
    db.product.findMany({ where: { id: { in: ids } }, select: { id: true, summary: true } }),
  ]);
  const summary = new Map(prods.map((p) => [p.id, p.summary?.trim() || ""]));
  for (const p of snap.cats.flatMap((c) => c.candidates)) {
    // πρώτα η ενεργειακή ετικέτα (νερό, ρεύμα, θόρυβος), μετά τα υπόλοιπα· ίδιο χαρακτηριστικό μία φορά
    const mine = specs.filter((s) => s.productId === p.id).sort((a, b) => Number(!/ενεργειακ/i.test(a.groupName)) - Number(!/ενεργειακ/i.test(b.groupName)));
    const seen = new Set<string>(), lines: string[] = [];
    for (const s of mine) {
      const k = s.key.replace(/\s*\(.*$|,.*$/, "").trim().toLowerCase();
      if (seen.has(k) || !s.value.trim()) continue;
      seen.add(k); lines.push(`${s.key}: ${s.value.trim().slice(0, 80)}`);
      if (lines.length >= 30) break;
    }
    p.specs = lines;
    const sm = summary.get(p.id); if (sm) p.summary = sm.slice(0, 400);
  }
}
