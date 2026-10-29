"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Globe, Hourglass, Images, Loader2, Pencil, Square, SquareCheck } from "lucide-react";
import { when, type FeedStateDTO, type PublishDTO, type PublishRowDTO } from "@/lib/catalog/xml-import/ui-core";
import { publish, publishPage } from "@/app/admin/(shell)/catalog/templates/xml/actions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const card = "rounded-xl border border-eu-line bg-white min-w-0";
const num = "tabular-nums";

const EMPTY: PublishDTO = { rows: [], total: 0, page: 1, pages: 1, counts: { products: 0, live: 0, draft: 0, waiting: 0 } };
type Only = "all" | "draft" | "live";

/**
 * Βήμα ⑤: **προετοιμασία → διορθώσεις → δημοσίευση.**
 *
 * Τα νέα είδη γεννιούνται ανενεργά: έχουν κωδικό, φωτογραφίες και χαρακτηριστικά, αλλά δεν φαίνονται στο site. Εδώ
 * φαίνονται όλα μαζί, ανοίγουν για διόρθωση στην καρτέλα τους, και δημοσιεύονται όταν ο χρήστης το αποφασίσει — ένα
 * προς ένα ή όλα μαζί.
 *
 * Η δημοσίευση δένει **πρώτα** τις φωτογραφίες: προϊόν που βγαίνει στον κόσμο χωρίς φωτογραφία είναι χειρότερο από
 * προϊόν που περιμένει λίγο ακόμη.
 */
export function PublishStep({ state }: { state: FeedStateDTO }) {
  const [only, setOnly] = useState<Only>("draft");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PublishDTO>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [ask, setAsk] = useState<"all" | "picked" | null>(null);

  const [pending, startLoad] = useTransition();
  const load = useCallback((p = page, o = only) => {
    startLoad(async () => {
      const r = await publishPage(state.feedId, p, o);
      if ("error" in r) { setErr(r.error); return; }
      setErr(null); setData(r);
      if (r.page !== p) setPage(r.page);
    });
  }, [state.feedId, page, only]);

  useEffect(() => { load(page, only); }, [load, page, only]);

  const busy = pending || acting;
  const c = data.counts;
  const drafts = data.rows.filter((r) => !r.active);
  const allPicked = drafts.length > 0 && drafts.every((r) => picked.includes(r.itemId));

  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const pickPage = () => setPicked((xs) => (allPicked ? xs.filter((x) => !drafts.some((d) => d.itemId === x)) : [...new Set([...xs, ...drafts.map((d) => d.itemId)])]));

  const doPublish = async (which: string[] | "draft") => {
    setActing(true); setErr(null); setNote(null); setAsk(null);
    const r = await publish(state.feedId, which);
    setActing(false);
    if ("error" in r) { setErr(r.error); return; }
    setPicked([]);
    setNote(`${r.published} ${r.published === 1 ? "προϊόν δημοσιεύτηκε" : "προϊόντα δημοσιεύτηκαν"}${r.attached ? ` · ${r.attached} φωτογραφίες δέθηκαν` : ""}${r.skipped ? ` · ${r.skipped} ήταν ήδη στο site` : ""}.`);
    load(1, only);
  };

  const pills: { key: Only; label: string; n: number; help: string }[] = [
    { key: "draft", label: "Πρόχειρα", n: c.draft, help: "Έτοιμα, αλλά δεν φαίνονται στο site. Αυτά δημοσιεύονται." },
    { key: "live", label: "Στο site", n: c.live, help: "Φαίνονται στο eshop." },
    { key: "all", label: "Όλα", n: c.products, help: "Όλα τα προϊόντα που έβγαλε αυτό το feed." },
  ];

  return (
    <div className="grid gap-3 min-w-0">
      <section data-help="xml.publish.counts" className={`${card} grid gap-2 p-3`} aria-labelledby="xp-1">
        <div className="grid gap-1">
          <h3 id="xp-1" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Globe className="size-4 text-eu-blue" aria-hidden /> Προετοιμασία και δημοσίευση</h3>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)] max-w-[70ch]">Τα είδη που δημιουργήθηκαν από αυτό το feed <b>δεν φαίνονται στο site</b> μέχρι να τα δημοσιεύσεις. Άνοιξε όποιο θέλεις, διόρθωσε ό,τι χρειάζεται και μετά βγάλ&apos; τα στον κόσμο — ένα προς ένα ή όλα μαζί. Η δημοσίευση δένει πρώτα τις φωτογραφίες.</p>
        </div>
        <dl className="m-0 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))]">
          {([["Προϊόντα", c.products], ["Πρόχειρα", c.draft], ["Στο site", c.live], ["Σε αναμονή έγκρισης", c.waiting]] as [string, number][]).map(([l, n]) => (
            <div key={l} className="grid gap-0.5 rounded-lg bg-eu-surface/60 px-3 py-2">
              <dt className="text-eu-muted text-[length:var(--fs-12)]">{l}</dt>
              <dd className={`m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] ${num}`}>{n.toLocaleString("el-GR")}</dd>
            </div>
          ))}
        </dl>
        {c.waiting > 0 && (
          <p className="m-0 flex gap-2 items-start text-eu-ink-3 text-[length:var(--fs-13)]">
            <Hourglass className="size-4 shrink-0 mt-0.5" aria-hidden />
            <span className="min-w-0">{c.waiting.toLocaleString("el-GR")} {c.waiting === 1 ? "είδος μπήκε αλλά δεν έχει ακόμη προϊόν" : "είδη μπήκαν αλλά δεν έχουν ακόμη προϊόν"}: περιμένουν έγκριση στα <Link href="/admin/catalog/templates/nea-eidi" className="font-bold text-eu-blue hover:underline">Νέα είδη</Link>. Οι φωτογραφίες τους είναι ήδη στη βιβλιοθήκη και δένονται μόλις γεννηθεί το προϊόν.</span>
          </p>
        )}
      </section>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {note && <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]"><Check className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{note}</span></p>}

      <div role="group" aria-label="Φίλτρα" className="flex flex-wrap gap-1.5 min-w-0">
        {pills.map((p) => (
          <button key={p.key} type="button" onClick={() => { setOnly(p.key); setPage(1); }} aria-pressed={only === p.key} title={p.help} disabled={busy && only !== p.key}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] border-2 focus-visible:outline-2 focus-visible:outline-eu-blue ${only === p.key ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink-2 hover:border-eu-blue"} ${p.n === 0 ? "opacity-60" : ""}`}>
            {p.label} <span className={num}>{p.n.toLocaleString("el-GR")}</span>
          </button>
        ))}
      </div>

      {c.draft > 0 && (
        <div data-help="xml.publish.actions" className={`${card} grid gap-2 p-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => setAsk("all")}>
              {acting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Globe className="size-4" aria-hidden />} Δημοσίευσε και τα {c.draft.toLocaleString("el-GR")}
            </button>
            {picked.length > 0 && <button type="button" className={secondary} disabled={busy} onClick={() => setAsk("picked")}>Δημοσίευσε τα {picked.length} επιλεγμένα</button>}
            {picked.length > 0 && <button type="button" className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} disabled={busy} onClick={() => setPicked([])}>Καθάρισε την επιλογή</button>}
          </div>
          {ask && (
            <div role="alertdialog" aria-label="Επιβεβαίωση δημοσίευσης" className="grid gap-2 rounded-lg border-2 border-eu-navy bg-eu-chip/40 p-3">
              <p className="m-0 text-eu-ink text-[length:var(--fs-14)]">
                {ask === "all"
                  ? `Θα γίνουν ορατά στο eshop ${c.draft.toLocaleString("el-GR")} προϊόντα αυτού του feed.`
                  : `Θα γίνουν ορατά στο eshop ${picked.length} ${picked.length === 1 ? "προϊόν" : "προϊόντα"}.`}
                {" "}Μπορείς να τα αποσύρεις ανά πάσα στιγμή από την καρτέλα του προϊόντος.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy} onClick={() => doPublish(ask === "all" ? "draft" : picked)}>Ναι, δημοσίευσέ τα</button>
                <button type="button" className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} onClick={() => setAsk(null)}>Άκυρο</button>
              </div>
            </div>
          )}
        </div>
      )}

      <section className={`${card} grid gap-0 overflow-hidden`} aria-label="Προϊόντα του feed">
        {drafts.length > 0 && (
          <div className="flex items-center gap-2 border-b border-eu-line px-3 py-2">
            <button type="button" onClick={pickPage} disabled={busy} className="inline-flex items-center gap-1.5 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:underline">
              {allPicked ? <SquareCheck className="size-4" aria-hidden /> : <Square className="size-4" aria-hidden />} {allPicked ? "Ξε-επίλεξε τη σελίδα" : "Επίλεξε τη σελίδα"}
            </button>
            <span className="text-eu-muted text-[length:var(--fs-12)]">({drafts.length} πρόχειρα σε αυτή τη σελίδα)</span>
          </div>
        )}
        {pending && !data.rows.length ? (
          <p className="m-0 p-4 text-eu-ink-3 text-[length:var(--fs-14)]"><Loader2 className="size-4 inline animate-spin" aria-hidden /> Φορτώνει…</p>
        ) : !data.rows.length ? (
          <p className="m-0 p-4 text-eu-ink-3 text-[length:var(--fs-14)]">
            {c.products === 0 ? "Κανένα προϊόν δεν έχει δημιουργηθεί από αυτό το feed ακόμη. Τρέξε την εισαγωγή στη λίστα ελέγχου." : "Καμία γραμμή σε αυτό το φίλτρο."}
          </p>
        ) : (
          <ul className="m-0 p-0 list-none grid gap-0 min-w-0">
            {data.rows.map((r: PublishRowDTO) => (
              <li key={r.itemId} className="grid gap-1.5 border-b border-eu-line last:border-b-0 p-3 min-w-0">
                <div className="flex flex-wrap items-start gap-2 min-w-0">
                  {!r.active && (
                    <button type="button" onClick={() => toggle(r.itemId)} aria-pressed={picked.includes(r.itemId)} aria-label={`Επιλογή ${r.sku}`} disabled={busy}
                      className="shrink-0 grid place-items-center size-11 md:size-9 rounded-lg text-eu-ink-2 hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue">
                      {picked.includes(r.itemId) ? <SquareCheck className="size-5" aria-hidden /> : <Square className="size-5" aria-hidden />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1 grid gap-0.5">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{r.name || r.sku}</span>
                    <span className={`text-eu-muted text-[length:var(--fs-12)] ${num} [overflow-wrap:anywhere]`}>
                      {r.sku}{r.mtrl ? ` · MTRL ${r.mtrl}` : ""}{r.images ? ` · ${r.images} ${r.images === 1 ? "φωτογραφία" : "φωτογραφίες"}` : " · χωρίς φωτογραφία"}
                    </span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${r.active ? "bg-eu-green/12 text-eu-ink" : "bg-eu-surface text-eu-ink-2"}`}>
                    {r.active ? <Globe className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}{r.active ? "Στο site" : "Πρόχειρο"}
                  </span>
                  <Link href={`/admin/catalog/products/${r.productId}`} className="shrink-0 inline-flex items-center gap-1 min-h-11 md:min-h-9 px-2 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline">
                    <Images className="size-4" aria-hidden /> Άνοιξε
                  </Link>
                </div>
                {!r.images && !r.active && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Χωρίς φωτογραφία: σκέψου το πριν το δημοσιεύσεις.</p>}
              </li>
            ))}
          </ul>
        )}
        {data.pages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-eu-line px-3 py-2">
            <button type="button" className={`${btn} text-eu-ink-2 hover:bg-eu-surface`} disabled={busy || data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft className="size-4" aria-hidden /> Προηγούμενη</button>
            <span className={`text-eu-ink-3 text-[length:var(--fs-13)] ${num}`}>Σελίδα {data.page} από {data.pages}</span>
            <button type="button" className={`${btn} text-eu-ink-2 hover:bg-eu-surface`} disabled={busy || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Επόμενη <ChevronRight className="size-4" aria-hidden /></button>
          </div>
        )}
      </section>

      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Το feed έτρεξε τελευταία {when(state.lastRunAt)}.</p>
    </div>
  );
}
