"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import { contentDimsAction, saveContentDimsAction } from "@/app/admin/(shell)/catalog/content-dims-actions";
import type { ContentDimsState } from "@/lib/catalog/dims-from-content";
import type { DimsHit, WeightHit } from "@/lib/catalog/dims-from-content-core";

const num = (n: number) => n.toLocaleString("el-GR", { maximumFractionDigits: 2 });
const nearCm = (a: number, b: number) => Math.abs(a - b) <= 2 || Math.abs(a - b) / Math.max(a, b) <= 0.03;
const nearKg = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= 0.05;

/** Συμφωνία μιας τιμής με τις υπόλοιπες πηγές: πόσες συμφωνούν, ποια διαφέρει πρώτη. */
function verdict<T>(all: T[], pick: (x: T) => number, label: (x: T) => string, v: number, near: (a: number, b: number) => boolean, unit: string) {
  const differ = all.filter((x) => !near(pick(x), v));
  const agree = all.length - differ.length;
  if (differ.length) return { tone: "warn" as const, text: `${label(differ[0])}: ${num(pick(differ[0]))} ${unit}${differ.length > 1 ? ` (+${differ.length - 1})` : ""}` };
  return agree > 1 ? { tone: "ok" as const, text: `${agree} πηγές συμφωνούν` } : { tone: "one" as const, text: "1 πηγή" };
}

/**
 * «Διαστάσεις και βάρος από το περιεχόμενο»: διαβάζει χαρακτηριστικά, περιγραφή, EPREL/web, απόδελτιώσεις και το δελτίο
 * EPREL (PDF), προτείνει την τιμή που συμφωνούν οι περισσότερες πηγές και δείχνει από πού βγήκε η καθεμία. Αποθηκεύει
 * μόνο με επιβεβαίωση και μόνο στο eshop (χειροκίνητες διαστάσεις + βάρος προϊόντος), ποτέ στο SoftOne.
 */
export function ContentDimsPanel({ productId, canWrite }: { productId: string; canWrite: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState<ContentDimsState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dimSel, setDimSel] = useState<string | null>(null);
  const [kgSel, setKgSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    contentDimsAction(productId).then((r) => {
      if (!live) return;
      if (!r.ok) return setErr(r.error);
      setSt(r.state); setDimSel(r.state.proposal.bestDims); setKgSel(r.state.proposal.bestWeight);
    }, () => live && setErr("Η ανάγνωση απέτυχε. Δοκίμασε ξανά."));
    return () => { live = false; };
  }, [productId]);

  if (err) return <p role="alert" className="m-0 rounded-lg bg-eu-red/10 text-eu-red px-3 py-2 font-bold text-[length:var(--fs-14)]">{err}</p>;
  if (!st) return <p className="m-0 flex items-center gap-2 text-eu-ink-3 text-[length:var(--fs-14)] min-h-24" aria-busy><Loader2 className="size-4 animate-spin text-eu-blue" aria-hidden /> Διαβάζω χαρακτηριστικά, περιγραφές, απόδελτιώσεις και PDF…</p>;

  const { proposal: pr, current } = st;
  const dim = pr.dims.find((x) => x.sourceId === dimSel) ?? null;
  const kg = pr.weights.find((x) => x.sourceId === kgSel) ?? null;
  const tiles: { label: string; value: string | null; v: ReturnType<typeof verdict> | null }[] = [
    ...(["w", "h", "d"] as const).map((a) => ({ label: { w: "Πλάτος", h: "Ύψος", d: "Βάθος" }[a], value: dim ? `${num(dim[a])} εκ.` : null, v: dim ? verdict<DimsHit>(pr.dims, (x) => x[a], (x) => x.label, dim[a], nearCm, "εκ.") : null })),
    { label: "Βάρος", value: kg ? `${num(kg.kg)} κιλά` : null, v: kg ? verdict<WeightHit>(pr.weights, (x) => x.kg, (x) => x.label, kg.kg, nearKg, "κιλά") : null },
  ];
  const close = (el: HTMLElement) => el.closest("dialog")?.close();
  const save = () => {
    setSaving(true); setErr(null);
    saveContentDimsAction(productId, { dims: dim ? { w: dim.w, h: dim.h, d: dim.d, label: dim.label, raw: dim.raw } : undefined, weight: kg ? { kg: kg.kg, label: kg.label, raw: kg.raw } : undefined }).then(
      (r) => { setSaving(false); if (!r.ok) return setErr(r.error); setDone([dim && `διαστάσεις ${num(dim.w)} × ${num(dim.h)} × ${num(dim.d)} εκ.`, kg && `βάρος ${num(kg.kg)} κιλά`].filter(Boolean).join(" και ")); router.refresh(); },
      () => { setSaving(false); setErr("Η αποθήκευση απέτυχε. Δοκίμασε ξανά."); },
    );
  };
  const erp = current.erp && current.erp.w && current.erp.h && current.erp.l ? `${num(current.erp.w)} × ${num(current.erp.h)} × ${num(current.erp.l)} (Π×Υ×Μ)` : null;
  const row = "flex items-start gap-2.5 px-3 py-2 min-h-11 cursor-pointer hover:bg-eu-surface";

  return (
    <div className="grid gap-3 text-[length:var(--fs-14)]" data-help="product.content-dims">
      <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-chip/60 text-eu-ink px-3 py-2">
        <Info className="size-4 shrink-0 mt-0.5 text-eu-blue" aria-hidden />
        <span>Διάβασα: {st.read.length ? st.read.join(", ") : "καμία πηγή με κείμενο"}.{st.failed.length ? ` Δεν διαβάστηκε: ${st.failed.join(", ")}.` : ""} Τίποτα δεν αποθηκεύεται χωρίς επιβεβαίωση και τίποτα δεν γράφεται στο SoftOne.</span>
      </p>

      {pr.dims.length === 0 && pr.weights.length === 0 ? (
        <p className="m-0 rounded-lg border-2 border-dashed border-eu-line p-4 text-center text-eu-ink-3">Δεν βρέθηκαν διαστάσεις ή βάρος στο περιεχόμενο. Πρόσθεσε χαρακτηριστικό «Διαστάσεις» ή κάνε απόδελτίωση του φυλλαδίου.</p>
      ) : (
        <>
          <div className="grid gap-2 grid-cols-2 @lg:grid-cols-4" data-help="product.content-dims-values">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg bg-eu-surface px-3 py-2 min-w-0">
                <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{t.label}</div>
                <div className="font-heading font-bold text-eu-ink tabular-nums text-[length:var(--fs-20)]">{t.value ?? <span className="text-eu-muted font-normal">—</span>}</div>
                {t.v && <div className={`flex items-start gap-1 text-[length:var(--fs-12)] ${t.v.tone === "ok" ? "text-eu-green" : t.v.tone === "warn" ? "text-eu-amber" : "text-eu-ink-3"}`}>{t.v.tone === "ok" ? <Check className="size-3.5 shrink-0 mt-px" aria-hidden /> : t.v.tone === "warn" ? <AlertTriangle className="size-3.5 shrink-0 mt-px" aria-hidden /> : null}<span className="min-w-0 break-words">{t.v.text}</span></div>}
              </div>
            ))}
          </div>
          {pr.warning && <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 text-eu-ink px-3 py-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-eu-amber" aria-hidden />Έλεγξέ το: {pr.warning}</p>}

          <fieldset className="m-0 p-0 border-0 grid gap-1 min-w-0" data-help="product.content-dims-sources">
            <legend className="font-bold text-eu-ink mb-1">Από πού βγήκε κάθε τιμή</legend>
            <div className="rounded-lg border border-eu-line divide-y divide-eu-line-2 overflow-hidden">
              {pr.dims.map((x) => (
                <label key={`d-${x.sourceId}`} className={row}>
                  <input type="radio" name="cd-dims" checked={dimSel === x.sourceId} onChange={() => setDimSel(x.sourceId)} className="size-4 mt-0.5 accent-eu-navy shrink-0" />
                  <span className="grid min-w-0 flex-1"><b className="text-eu-ink">{x.label}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)] break-words">«{x.raw}»</span></span>
                  <span className="shrink-0 tabular-nums text-eu-ink-2 text-[length:var(--fs-13)]">{num(x.w)} × {num(x.h)} × {num(x.d)} εκ.</span>
                </label>
              ))}
              {pr.weights.map((x) => (
                <label key={`w-${x.sourceId}`} className={row}>
                  <input type="radio" name="cd-kg" checked={kgSel === x.sourceId} onChange={() => setKgSel(x.sourceId)} className="size-4 mt-0.5 accent-eu-navy shrink-0" />
                  <span className="grid min-w-0 flex-1"><b className="text-eu-ink">{x.label}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)] break-words">«{x.raw}»</span></span>
                  <span className="shrink-0 tabular-nums text-eu-ink-2 text-[length:var(--fs-13)]">{num(x.kg)} κιλά</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)]">
              {dimSel && <button type="button" onClick={() => setDimSel(null)} className="text-eu-blue font-bold hover:underline min-h-11 cursor-pointer bg-transparent border-0 p-0">Χωρίς διαστάσεις</button>}
              {kgSel && <button type="button" onClick={() => setKgSel(null)} className="text-eu-blue font-bold hover:underline min-h-11 cursor-pointer bg-transparent border-0 p-0">Χωρίς βάρος</button>}
            </div>
          </fieldset>
        </>
      )}

      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]" data-help="product.content-dims-current">
        Τώρα στο eshop: διαστάσεις {current.manual ? `${num(current.manual.w)} × ${num(current.manual.h)} × ${num(current.manual.d)} εκ. (χειροκίνητες)` : erp ? `από SoftOne ${erp}` : "καμία"} · βάρος {current.weightKg != null ? `${num(current.weightKg)} κιλά (eshop)` : current.erp?.kg ? `${num(current.erp.kg)} κιλά (SoftOne)` : "κενό"}
      </p>
      {done && <p role="status" className="m-0 flex items-start gap-2 rounded-lg bg-eu-green/12 text-eu-ink px-3 py-2"><Check className="size-4 shrink-0 mt-0.5 text-eu-green" aria-hidden />Αποθηκεύτηκαν στο eshop: {done}. Χρησιμοποιούνται από το AR, το «χωράει;» και την αποστολή.</p>}
      {err && st && <p role="alert" className="m-0 rounded-lg bg-eu-red/10 text-eu-red px-3 py-2 font-bold">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={(e) => close(e.currentTarget)} className="rounded-full px-4 min-h-11 font-bold text-eu-ink-2 hover:bg-eu-surface cursor-pointer">{done ? "Κλείσιμο" : "Ακύρωση"}</button>
        {canWrite && !done && <button type="button" disabled={saving || (!dim && !kg)} onClick={save} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">{saving && <Loader2 className="size-4 animate-spin" aria-hidden />}Αποθήκευση στο eshop</button>}
      </div>
    </div>
  );
}
