import Link from "next/link";
import { GitBranch, Search, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { findDocs, type DocMatch } from "@/lib/softone/order-chain";
import { SoftonePanel } from "@/components/admin/orders/chain/OrderTabs";
import { docChainAction } from "../actions";

export const metadata = { title: "SoftOne · Πορεία παραστατικού" };
export const dynamic = "force-dynamic";

/** Η πορεία οποιουδήποτε παραστατικού στο SoftOne, από τον αριθμό του (FINCODE) ή το FINDOC. Μόνο αναγνώσεις. */
export default async function DocChainPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  await requirePermission("orders.read");
  const { q = "", f } = await searchParams;
  let matches: DocMatch[] | null = [], failed = false;
  if (q) try { matches = await findDocs(q); } catch (e) { console.error("[softone/chain]", e); failed = true; }
  const pick = matches?.find((m) => m.findoc === Number(f)) ?? matches?.[0];
  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><GitBranch className="size-3.5" aria-hidden /> SoftOne ERP</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Πορεία παραστατικού</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Γράψε τον αριθμό μιας παραγγελίας eshop ή οποιουδήποτε παραστατικού (FINCODE, π.χ. απόδειξη, δελτίο) ή το FINDOC του. Βλέπεις όλη τη διαδρομή του στο SoftOne: από την παραγγελία ως το τιμολόγιο και τυχόν πιστωτικό. Μόνο ανάγνωση.</p>
      </div>
      <form method="get" data-help="softone.chain.search" className="flex flex-wrap gap-2">
        <label className="flex-1 min-w-[220px] relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
          <input name="q" defaultValue={q} required maxLength={40} placeholder="π.χ. 100234 ή ΑΛΠ-000512" aria-label="Αριθμός παραστατικού ή FINDOC" className="w-full rounded-full border border-eu-line bg-white pl-9 pr-3 min-h-11 text-[length:var(--fs-14)]" />
        </label>
        <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-5 min-h-11">Εμφάνιση πορείας</button>
      </form>
      {q && (failed ? <Note>Δεν απάντησε το SoftOne. Δοκίμασε ξανά σε λίγο.</Note>
        : matches === null ? <Note>Ο αριθμός έχει χαρακτήρες που δεν επιτρέπονται. Γράψε μόνο γράμματα, ψηφία, παύλα, κάθετο ή τελεία.</Note>
        : !pick ? <Note>Δεν βρέθηκε παραστατικό με αριθμό ή FINDOC «{q}». Έλεγξε τον αριθμό· αν είναι παραγγελία eshop, ίσως δεν έχει σταλεί ακόμη στο SoftOne.</Note>
        : (
          <>
            {matches!.length > 1 && (
              <div data-help="softone.chain.matches" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                <span className="text-eu-ink-3">Βρέθηκαν {matches!.length} παραστατικά με αυτόν τον αριθμό:</span>
                {matches!.map((m) => (
                  <Link key={m.findoc} href={`?q=${encodeURIComponent(q)}&f=${m.findoc}`} aria-current={m.findoc === pick.findoc ? "true" : undefined} className={`rounded-full border px-3 min-h-9 inline-flex items-center ${m.findoc === pick.findoc ? "border-eu-navy text-eu-navy font-bold bg-eu-chip" : "border-eu-line text-eu-ink hover:border-eu-navy"}`}>{m.fincode} · {m.date.slice(0, 10)}</Link>
                ))}
              </div>
            )}
            <SoftonePanel key={pick.findoc} load={docChainAction.bind(null, pick.findoc)} number={pick.fincode} />
          </>
        ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="m-0 rounded-2xl border border-eu-amber/40 bg-eu-amber/10 p-4 text-eu-ink text-[length:var(--fs-14)] inline-flex gap-2 items-start"><AlertTriangle className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden />{children}</p>;
}
