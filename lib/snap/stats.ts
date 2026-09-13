import "server-only";
import { db } from "@/lib/db";

const KIND_LABEL: Record<string, string> = { plyntiria: "Πλυντήρια", stegnotiria: "Στεγνωτήρια", psygeia: "Ψυγεία", "plyntiria-piaton": "Πλυντήρια πιάτων", koyzines: "Κουζίνες", "air-condition": "Κλιματιστικά", tileoraseis: "Τηλεοράσεις", skoypes: "Σκούπες", mikrosyskeves: "Μικροσυσκευές", smartphones: "Κινητά", laptops: "Laptops" };
const ACTION_LABEL: Record<string, string> = { replace: "Αντικατάσταση", register: "Συσκευές μου", service: "Αίτημα service", recycle: "Ανακύκλωση" };

/** Snap & Find for the radar: what people photograph, how old it is, what they did next. Last 30 days. */
export async function snapStats(days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db.snapScan.findMany({ where: { at: { gte: since } }, select: { kind: true, brand: true, ageYears: true, energyClass: true, action: true, confidence: true, matchedProductId: true, costUsd: true, customerId: true } }).catch(() => []);
  const total = rows.length;
  const recognised = rows.filter((r) => r.kind).length;
  const count = (key: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const kinds = count((r) => r.kind).map(([k, n]) => ({ key: k, label: KIND_LABEL[k] ?? k, n }));
  const brands = count((r) => r.brand?.trim() || null).slice(0, 8).map(([k, n]) => ({ label: k, n }));
  const actions = count((r) => r.action).map(([k, n]) => ({ key: k, label: ACTION_LABEL[k] ?? k, n }));
  const ages = rows.map((r) => r.ageYears).filter((x): x is number => typeof x === "number");
  const avgAge = ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null;
  const oldShare = ages.length ? Math.round((ages.filter((a) => a >= 10).length / ages.length) * 100) : null;
  const classes = count((r) => r.energyClass?.toUpperCase() || null).map(([k, n]) => ({ label: k, n }));
  const costUsd = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  return { days, total, recognised, matched: rows.filter((r) => r.matchedProductId).length, loggedIn: rows.filter((r) => r.customerId).length, kinds, brands, actions, avgAge, oldShare, classes, costUsd };
}
