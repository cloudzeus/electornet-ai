import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { NewLanding } from "@/components/admin/promos/LandingEditor";

export const metadata = { title: "Landing pages προσφορών" };
export const dynamic = "force-dynamic";

const ST: Record<string, string> = { draft: "Πρόχειρη", published: "Δημοσιευμένη", archived: "Αρχείο" };

export default async function LandingListPage({ searchParams }: { searchParams: Promise<{ promo?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { promo } = await searchParams;
  const [pages, promos] = await Promise.all([
    db.landingPage.findMany({ where: { status: { not: "archived" } }, orderBy: { updatedAt: "desc" } }),
    db.promotion.findMany({ where: { status: { in: ["active", "scheduled", "draft", "pending", "paused"] } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, code: true, status: true, endsAt: true } }),
  ]);
  const byId = new Map(promos.map((p) => [p.id, p]));
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="landing" active="landing" title="Landing pages" lead="Σελίδες προσφορών στο /prosfores/… φτιαγμένες από blocks: hero, αντίστροφη μέτρηση με την πραγματική λήξη, τα προϊόντα της προσφοράς (αυτόματα), κατηγορίες, κουπόνι, όροι, συχνές ερωτήσεις. Όταν η προσφορά λήξει, η σελίδα το λέει μόνη της." />
      <NewLanding initialPromo={promo} promos={promos.map((p) => ({ id: p.id, label: `${p.name} · ${p.code}` }))} />
      <div className="rounded-2xl border border-eu-line bg-white overflow-hidden">
        <table className="eu-rtable w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Σελίδα</th><th className="py-2 px-3">Προσφορά</th><th className="py-2 px-3">Κατάσταση</th><th className="py-2 px-3">Blocks</th><th className="py-2 px-3"></th></tr></thead>
          <tbody>
            {pages.map((p) => { const pr = p.promotionId ? byId.get(p.promotionId) : null; return (
              <tr key={p.id} className="border-t border-eu-line">
                <td className="py-2 px-3"><Link href={`/admin/prosfores/selides/${p.id}`} className="font-bold hover:text-eu-blue hover:underline">{p.title}</Link><div className="text-eu-muted font-mono text-[length:var(--fs-13)]">/prosfores/{p.slug}</div></td>
                <td data-label="Προσφορά" className="py-2 px-3">{pr ? <Link href={`/admin/prosfores/${pr.id}`} className="hover:underline">{pr.name}</Link> : "—"}</td>
                <td data-label="Κατάσταση" className="py-2 px-3">{ST[p.status] ?? p.status}</td>
                <td data-label="Blocks" className="py-2 px-3 tabular-nums">{(p.blocks as unknown[]).length}</td>
                <td className="py-2 px-3 text-right"><a href={`/prosfores/${p.slug}${p.status === "published" ? "" : "?preview=1"}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-bold text-eu-blue hover:underline min-h-11">Προβολή <ExternalLink className="size-3.5" aria-hidden /></a></td>
              </tr>
            ); })}
            {!pages.length && <tr><td colSpan={5} className="p-6 text-center text-eu-muted">Καμία σελίδα ακόμη.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
