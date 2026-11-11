// Καρτέλα προϊόντος (διαχείριση): σύγκριση με τον Κωτσόβολο — badge, γράφημα 30 ημερών, το ζευγάρι και η αλλαγή του.
import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { ourPrice } from "@/lib/competitors/run-core";
import { eur, gapText, kotView, theirPrice, wasPrice } from "@/lib/competitors/badge";
import { CompetitorBadge } from "./CompetitorBadge";
import { CompetitorChart } from "./CompetitorChart";
import { PairPicker } from "./PairPicker";

const COMP = "kotsovolos";
const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const HOW: Record<string, string> = {
  auto: "Ταίριαξε αυτόματα (μάρκα + μοντέλο ή ίδιο EAN)",
  manual: "Ορίστηκε από διαχειριστή",
  suggested: "Πρόταση — δεν μετρά ώσπου να την επιβεβαιώσεις",
};
const card = "grid content-start gap-3 rounded-2xl border border-eu-line bg-white p-4 @lg:p-5 min-w-0";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]";

export async function CompetitorPanel({ productId, canWrite }: { productId: string; canWrite: boolean }) {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { price: true, categoryId: true, offer: { select: { price: true } },
      competitorPrices: { where: { competitor: COMP }, include: { history: { orderBy: { at: "desc" }, take: 90 } } } },
  });
  if (!p) return null;
  const row = p.competitorPrices[0];
  const mapped = !!(await db.competitorCategoryMap.findUnique({ where: { competitor_categoryId: { competitor: COMP, categoryId: p.categoryId } }, select: { extPath: true } }))?.extPath;

  if (!row && !mapped) return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-eu-line bg-white px-4 py-3 text-[length:var(--fs-14)]">
      <span className="text-eu-ink-3"><b className="text-eu-ink">Κωτσόβολος:</b> η κατηγορία του προϊόντος δεν συγκρίνεται ακόμη.</span>
      <Link href="/admin/catalog/competitors" className="inline-flex min-h-11 items-center font-bold text-eu-blue hover:underline">Αντιστοίχιση κατηγοριών →</Link>
    </section>
  );

  const v = kotView(row);
  const paired = !!v?.extId && v.match !== "rejected" && v.match !== "lost";
  const firm = paired && (v.match === "auto" || v.match === "manual");
  const their = v ? theirPrice(v) : null;
  const was = v ? wasPrice(v) : null;
  const ours = ourPrice({ price: p.price, offer: p.offer });
  const gap = gapText(v);
  const history = (row?.history ?? []).map((h) => ({ t: h.at.getTime(), ours: h.ourPrice != null ? Number(h.ourPrice) : null, theirs: h.price != null ? Number(h.price) : null }));

  return (
    <section aria-label="Σύγκριση με τον Κωτσόβολο" className="grid gap-2.5 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-eu-line bg-white px-4 py-3">
        <span data-help="kotsovolos-badge" className="max-w-full"><CompetitorBadge price={v} size="lg" /></span>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)]">
          {gap ? `${gap} ` : ""}
          {ours != null && firm ? `Η τιμή μας τώρα ${eur(ours)}. ` : ""}
          {v?.checkedAt ? `Έλεγχος ${when(v.checkedAt)}.` : "Δεν έχει ελεγχθεί ακόμη."}
        </span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <div className={`${card} flex-[999_1_32rem]`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className={h3}>Τιμή μας και Κωτσόβολου</h3>
            <span className="text-eu-muted text-[length:var(--fs-12)]">30 ημέρες · από τον νυχτερινό έλεγχο</span>
          </div>
          <CompetitorChart history={history} now={Date.now()} />
        </div>

        <div data-help="kotsovolos-pair" className={`${card} flex-[1_1_20rem]`}>
          <h3 className={h3}>Το ζευγάρι στον Κωτσόβολο</h3>
          {paired ? (
            <div className="grid gap-1">
              {v.extUrl
                ? <a href={`https://www.kotsovolos.gr/${v.extUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 md:min-h-8 items-center gap-1.5 py-1 font-bold text-eu-blue hover:underline break-words text-[length:var(--fs-14)]">{v.extTitle ?? `Είδος ${v.extId}`}<ExternalLink className="size-4 shrink-0" aria-label="(ανοίγει σε νέα καρτέλα)" /></a>
                : <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{v.extTitle ?? `Είδος ${v.extId}`}</span>}
              <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{HOW[v.match] ?? v.match} · είδος <span className="font-mono">{v.extId}</span></span>
            </div>
          ) : (
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν υπάρχει ζευγάρι. Ψάξε το ίδιο προϊόν στη λίστα του Κωτσόβολου για να συγκρίνεται κάθε βράδυ.</p>
          )}
          {v?.lastError && (
            <p className="m-0 flex items-start gap-2 rounded-lg border border-eu-amber/40 bg-eu-amber/10 px-3 py-2 text-eu-ink text-[length:var(--fs-13)] break-words">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-eu-amber" aria-hidden />{v.lastError}
            </p>
          )}
          {paired && (
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[length:var(--fs-14)]">
              <dt className="text-eu-ink-3">Τιμή καταλόγου</dt>
              <dd className="m-0 font-bold tabular-nums">{v.listPrice == null ? "—" : was ? <s className="font-normal text-eu-muted">{eur(v.listPrice)}</s> : eur(v.listPrice)}</dd>
              <dt className="text-eu-ink-3">Τιμή προσφοράς</dt>
              <dd className="m-0 font-bold tabular-nums">{v.offerPrice != null ? eur(v.offerPrice) : "—"}</dd>
              <dt className="text-eu-ink-3">Διαθέσιμο online</dt>
              <dd className={`m-0 font-bold ${v.available ? "text-eu-green" : "text-eu-ink-3"}`}>{v.available ? "Ναι" : "Όχι — δεν μετρά στη μαζική αλλαγή"}</dd>
            </dl>
          )}
          {firm && v.available && their != null && their > 0.1 && (
            <div className="grid gap-1">
              {/* Ενεργοποιείται στη μαζική αλλαγή τιμών (Task 8) */}
              <button type="button" disabled aria-describedby={`kot-soon-${productId}`} title="έρχεται με τη μαζική αλλαγή"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-eu-navy bg-eu-navy px-4 font-bold text-white text-[length:var(--fs-14)] tabular-nums opacity-50 cursor-not-allowed">
                Πήγαινε στα {eur(Math.round((their - 0.1) * 100) / 100)} (−0,10 €)
              </button>
              <span id={`kot-soon-${productId}`} className="text-center text-eu-muted text-[length:var(--fs-12)]">έρχεται με τη μαζική αλλαγή</span>
            </div>
          )}
          <PairPicker productId={productId} view={v} canWrite={canWrite} />
        </div>
      </div>
    </section>
  );
}
