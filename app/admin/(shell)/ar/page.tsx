import { Box } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { products } from "@/lib/data/fixtures/products";
import { dimsFor } from "@/lib/data/dims";
import { cutoutFor } from "@/lib/data/cutouts";
import { Pagination } from "@/components/admin/Pagination";
import { ArRow, type ArRowData } from "./ArRow";

export const metadata = { title: "AR · Δες το στον χώρο σου" };
export const dynamic = "force-dynamic";

const PAGE = 25;

/**
 * Ποια προϊόντα έχουν «Δες το στον χώρο σου» και με τι: τον όγκο που χτίζει
 * η γεννήτρια από διαστάσεις + φωτογραφία, ή δικό μας μοντέλο GLB (και
 * προαιρετικά USDZ για iPhone) ανεβασμένο στη βιβλιοθήκη πολυμέσων.
 */
export default async function ArAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  await requirePermission("catalog.products.read");
  const { q = "", f = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const settings = await db.productAr.findMany();
  const byId = new Map(settings.map((s) => [s.productId, s]));
  const rows: ArRowData[] = products
    .map((pr) => {
      const s = byId.get(pr.id);
      const dims = dimsFor(pr);
      return {
        id: pr.id, slug: pr.slug, brand: pr.brand, title: pr.title, image: pr.image, cutout: cutoutFor(pr.image),
        dims: dims ? { w: dims.w, h: dims.h, d: dims.d, source: dims.source } : null,
        enabled: s?.enabled ?? false, glbUrl: s?.glbUrl ?? null, usdzUrl: s?.usdzUrl ?? null, fitToDims: s?.fitToDims ?? true,
        modelBox: (s?.modelBox as { w: number; h: number; d: number } | null) ?? null,
      };
    })
    .filter((r) => !q || `${r.brand} ${r.title} ${r.id}`.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => (f === "on" ? r.enabled : f === "off" ? !r.enabled : f === "custom" ? !!r.glbUrl : f === "nodims" ? !r.dims || r.dims.source === "category" : true));
  const total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE));
  const slice = rows.slice((page - 1) * PAGE, page * PAGE);
  const href = (n: number) => `?${new URLSearchParams({ q, f, page: String(n) })}`;
  const enabled = settings.filter((s) => s.enabled).length, custom = settings.filter((s) => s.glbUrl).length;

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Box className="size-3.5" aria-hidden /> Επαυξημένη πραγματικότητα</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Δες το στον χώρο σου</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Το AR ενεργοποιείται ανά προϊόν. Χωρίς δικό μας μοντέλο, ο πελάτης βλέπει τον όγκο της συσκευής σε πραγματική κλίμακα με τη φωτογραφία της, από τις διαστάσεις (EPREL, ERP ή τυπικές). Με ανεβασμένο GLB του κατασκευαστή βλέπει το ίδιο το προϊόν σε 3D· το USDZ για iPhone είναι προαιρετικό, αλλιώς μετατρέπεται στη συσκευή.</p>
      </div>

      <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-13)] text-eu-ink-3"><b className="text-eu-ink">{enabled}</b> προϊόντα με AR από <b className="text-eu-ink">{products.length}</b> · <b className="text-eu-ink">{custom}</b> με δικό μας μοντέλο. Τα μοντέλα της γεννήτριας αποθηκεύονται στο Bunny CDN (φάκελος ar/).</p>

      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Αναζήτηση προϊόντος…" aria-label="Αναζήτηση" className="rounded-full border border-eu-line px-4 min-h-10 text-[length:var(--fs-14)] min-w-[240px]" />
        <select name="f" defaultValue={f} aria-label="Φίλτρο" className="rounded-full border border-eu-line px-3 min-h-10 text-[length:var(--fs-14)] bg-white">
          <option value="">Όλα</option><option value="on">Με AR</option><option value="off">Χωρίς AR</option><option value="custom">Με δικό μας μοντέλο</option><option value="nodims">Χωρίς δηλωμένες διαστάσεις</option>
        </select>
        <button className="rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)]">Φίλτρο</button>
      </form>

      <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
        <table className="w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">AR</th><th className="py-2 px-3">Προϊόν</th><th className="py-2 px-3">Διαστάσεις</th><th className="py-2 px-3">Φωτογραφία</th><th className="py-2 px-3">Μοντέλο</th><th className="py-2 px-3"></th></tr></thead>
          <tbody>{slice.map((r) => <ArRow key={r.id} row={r} />)}{!slice.length && <tr><td colSpan={6} className="p-8 text-center text-eu-muted">Κανένα προϊόν.</td></tr>}</tbody>
        </table>
        <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
      </div>
    </div>
  );
}
