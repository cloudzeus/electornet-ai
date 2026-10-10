import "server-only";
import { db } from "@/lib/db";
import { pickAd } from "@/lib/promo/landing";
import { renderZone } from "./render";
import { blockActive } from "./brand-store";
import { sectionActive, sectionDef, sectionExtras, sectionWidget, type HomeDoc } from "./home-sections";
import { blkKey, secKey } from "./home-diff";

/**
 * «Υγεία» της αρχικής για τον editor: ποιες ενότητες βγαίνουν κενές αυτή τη στιγμή (άρα δεν φαίνονται, αν και
 * είναι ενεργές) και τι πρέπει να ελεγχθεί πριν τη δημοσίευση. Αποδίδει με τον ίδιο μηχανισμό που αποδίδει το site.
 */
export type HealthIssue = { key: string; msg: string };
export type HomeHealth = { empty: Record<string, string>; issues: HealthIssue[] };

const WHY: Record<string, string> = {
  deals: "Δεν υπάρχουν προϊόντα να δείξει: διάλεξε προϊόντα ή μια προσφορά — αυτόματα δεν βρέθηκε κανένα σε έκπτωση.",
  services: "Όλες οι υπηρεσίες είναι κρυφές — άνοιξε το μάτι σε μία τουλάχιστον.",
  guides: "Όλοι οι οδηγοί είναι κρυφοί — άνοιξε το μάτι σε έναν τουλάχιστον.",
  campaigns: "Όλες οι καμπάνιες είναι κρυφές ή δεν υπάρχει καμία.",
  ticker: "Όλα τα μηνύματα είναι ανενεργά ή κενά.",
  news: "Δεν υπάρχουν νέα για να εμφανιστούν.",
  "ad-strip": "Δεν υπάρχει ενεργό banner στη θέση «home-strip» (Προσφορές → Διαφημιστικές θέσεις).",
};

const nothing = (n: unknown): boolean => n == null || n === false || (Array.isArray(n) && n.every(nothing));

export async function homeHealth(doc: HomeDoc): Promise<HomeHealth> {
  const now = new Date();
  const empty: Record<string, string> = {};
  const issues: HealthIssue[] = [];
  await Promise.all(doc.sections.map(async (s) => {
    const viewer = s.audience === "customer" ? "customer" : "guest";
    if (!sectionActive(s, now, viewer)) return;
    const key = secKey(s.id);
    if (s.id === "ad-strip") {
      const ad = await pickAd("home-strip", { count: false }).catch(() => null);
      if (!ad?.image) empty[key] = WHY["ad-strip"];
      return;
    }
    const w = sectionWidget(s);
    if (!w) return;
    const el = await renderZone({ id: s.id, label: sectionDef(s.id)!.label, slot: "main", widgets: [w, ...sectionExtras(s)] }, { now, device: "desktop", audience: viewer, saveData: false, bucket: 0 }).catch(() => null);
    if (nothing(el)) empty[key] = WHY[s.id] ?? "Δεν έχει περιεχόμενο αυτή τη στιγμή.";
  }));

  // πριν τη δημοσίευση
  for (const s of doc.sections) {
    const label = sectionDef(s.id)?.label ?? s.id;
    if (s.enabled !== false && s.schedule?.to && new Date(s.schedule.to) < now) issues.push({ key: secKey(s.id), msg: `«${label}»: η ημερομηνία λήξης πέρασε — δεν φαίνεται.` });
    const p = (s.props ?? {}) as Record<string, unknown>;
    if (s.id === "deals" && p.source === "products") {
      if (typeof p.endsAt === "string" && new Date(p.endsAt) < now) issues.push({ key: secKey(s.id), msg: `«${label}»: η λήξη της αντίστροφης μέτρησης πέρασε.` });
      const ids = Array.isArray(p.productIds) ? (p.productIds as string[]) : [];
      if (ids.length) {
        const rows = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, stock: true, active: true } }).catch(() => []);
        const by = new Map(rows.map((r) => [r.id, r]));
        const gone = ids.filter((id) => !by.get(id)?.active).length;
        const out = rows.filter((r) => r.active && r.stock <= 0).map((r) => r.title);
        if (gone) issues.push({ key: secKey(s.id), msg: `«${label}»: ${gone} ${gone === 1 ? "προϊόν δεν είναι πια ενεργό" : "προϊόντα δεν είναι πια ενεργά"}.` });
        if (out.length) issues.push({ key: secKey(s.id), msg: `«${label}»: χωρίς απόθεμα — ${out.slice(0, 3).join(", ")}${out.length > 3 ? ` και ${out.length - 3} ακόμη` : ""}.` });
      }
    }
    if (s.id === "campaigns" && Array.isArray(p.campaigns)) {
      for (const c of p.campaigns as { title?: string; image?: string; alt?: string; href?: string; hidden?: boolean }[]) {
        if (c.hidden) continue;
        if (!c.image) issues.push({ key: secKey(s.id), msg: `Καμπάνια «${c.title || "χωρίς τίτλο"}»: δεν έχει εικόνα.` });
        else if (!c.alt?.trim()) issues.push({ key: secKey(s.id), msg: `Καμπάνια «${c.title || "χωρίς τίτλο"}»: λείπει η περιγραφή της εικόνας (για τυφλούς και Google).` });
        if (!c.href) issues.push({ key: secKey(s.id), msg: `Καμπάνια «${c.title || "χωρίς τίτλο"}»: δεν έχει σύνδεσμο.` });
      }
    }
  }
  for (const b of doc.blocks) {
    if (b.enabled !== false && b.schedule?.to && new Date(b.schedule.to) < now && !blockActive(b, now)) issues.push({ key: blkKey(b.id), msg: `Component «${b.title || b.type}»: η ημερομηνία λήξης πέρασε — δεν φαίνεται.` });
  }
  return { empty, issues };
}
