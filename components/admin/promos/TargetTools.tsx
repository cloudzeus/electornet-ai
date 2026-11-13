"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, ExternalLink, FileSpreadsheet, Loader2, Minus, TrendingDown, TrendingUp, Upload, X } from "lucide-react";
import { promoCodesAction, targetPricesAction, type CodeMatch, type TargetPrice } from "@/app/admin/(shell)/prosfores/actions";

const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Προϊόντα προσφοράς από αρχείο: Excel / CSV (ή επικόλληση) με μία στήλη κωδικών — SKU, EAN ή κωδικός ERP.
 * Όσα βρεθούν μπαίνουν αμέσως στην προσφορά (ή στις εξαιρέσεις)· όσοι κωδικοί δεν βρέθηκαν φαίνονται για διόρθωση.
 */
export function CodesUpload({ exclude, onAdd }: { exclude: boolean; onAdd: (items: CodeMatch[]) => void }) {
  const [busy, start] = useTransition();
  const [res, setRes] = useState<{ found: CodeMatch[]; missing: string[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const run = (form: FormData) => start(async () => {
    setErr(null); setRes(null);
    const r = await promoCodesAction(form);
    if (!r.ok) { setErr(r.error); return; }
    setRes(r);
    if (r.found.length) onAdd(r.found);
  });
  const off = res ? res.found.filter((x) => !x.active).length : 0;
  return (
    <section data-help="promo.codes" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3" aria-label="Προϊόντα από αρχείο κωδικών">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid min-w-0 flex-1">
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4 text-eu-green" aria-hidden /> Έχεις λίστα κωδικών; Ανέβασε το Excel</span>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Μία στήλη με κωδικούς προϊόντων (SKU, EAN ή κωδικός SoftOne), έως 2.000. Όσα βρεθούν μπαίνουν {exclude ? "στις εξαιρέσεις" : "στην προσφορά"}.</span>
        </span>
        <input ref={file} type="file" accept=".xlsx,.csv,.txt" className="sr-only" aria-label="Αρχείο κωδικών" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("file", f); run(fd); e.target.value = ""; }} />
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}{busy ? "Διαβάζω…" : "Επιλογή αρχείου"}</button>
      </div>
      <details>
        <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 md:min-h-8 inline-flex items-center">ή επικόλλησε κωδικούς</summary>
        <div className="grid gap-2 pt-1">
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Κωδικοί προϊόντων, ένας ανά γραμμή" placeholder={"Ένας κωδικός ανά γραμμή\n55QNED72B6B.API\nRH98A9WO"} className="w-full rounded-xl border-2 border-eu-line px-3 py-2 text-[length:var(--fs-15)] bg-white font-mono" />
          <button type="button" disabled={busy || !paste.trim()} onClick={() => { const fd = new FormData(); fd.set("paste", paste); run(fd); }} className="justify-self-start rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip disabled:opacity-40">Προσθήκη κωδικών</button>
        </div>
      </details>
      {err && <p role="alert" className="m-0 flex items-start gap-2 rounded-xl bg-eu-red/10 px-3 py-2 text-eu-red font-bold text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{err}</p>}
      {res && (
        <div role="status" className="grid gap-2">
          <p className={`m-0 flex items-start gap-2 rounded-xl px-3 py-2 font-bold text-[length:var(--fs-14)] ${res.found.length ? "bg-eu-green/10 text-eu-green" : "bg-eu-amber/15 text-eu-ink"}`}>
            {res.found.length ? <CircleCheck className="size-4 mt-0.5 shrink-0" aria-hidden /> : <CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />}
            <span>{res.found.length ? `${res.found.length === 1 ? "Βρέθηκε 1" : `Βρέθηκαν ${res.found.length}`} από ${res.total} κωδικούς και ${res.found.length === 1 ? "μπήκε" : "μπήκαν"} ${exclude ? "στις εξαιρέσεις" : "στην προσφορά"}.` : `Κανένας από τους ${res.total} κωδικούς δεν βρέθηκε στον κατάλογο.`}{off > 0 && <span className="block font-normal text-eu-ink-2">{off} από αυτά είναι ανενεργά στο e-shop: η προσφορά τα πιάνει μόνο όταν ενεργοποιηθούν.</span>}</span>
          </p>
          {res.missing.length > 0 && (
            <div className="rounded-xl bg-eu-amber/15 px-3 py-2 grid gap-1">
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{res.missing.length === 1 ? "1 κωδικός δεν βρέθηκε — έλεγξε αν είναι σωστός:" : `${res.missing.length} κωδικοί δεν βρέθηκαν — έλεγξε αν είναι σωστοί:`}</span>
              <span className="font-mono text-eu-ink-2 text-[length:var(--fs-13)] break-words">{res.missing.slice(0, 60).join(" · ")}{res.missing.length > 60 ? ` · και άλλοι ${res.missing.length - 60}` : ""}</span>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(res.missing.join("\n"))} className="justify-self-start rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy">Αντιγραφή λίστας</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Τα επιλεγμένα προϊόντα με την τιμή μας, την τιμή με την προσφορά και την τιμή του Κωτσόβολου — για να φαίνεται
 * ΠΡΙΝ τη δημοσίευση αν η προσφορά μάς κάνει φθηνότερους. Πάνω: μπάρα με το σύνολο (φθηνότεροι / ίδια / ακριβότεροι / χωρίς σύγκριση).
 */
export function SelectedPrices({ ids, mechanism, reward, onRemove }: { ids: string[]; mechanism: string; reward: { percent?: number; amount?: number }; onRemove: (id: string) => void }) {
  const [rows, setRows] = useState<TargetPrice[] | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => { void targetPricesAction(ids).then((r) => { if (on) setRows(r); }).catch(() => { if (on) setRows([]); }); }, 350);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- μόνο όταν αλλάξει η λίστα των προϊόντων
  }, [key]);
  if (!ids.length) return null;
  // τιμή με την προσφορά: μόνο για έκπτωση % ή € — οι άλλοι μηχανισμοί (δώρο, 1+1…) δεν αλλάζουν την τιμή του τεμαχίου
  const promo = (p: number | null) => (p == null ? null : mechanism === "price-percent" && reward.percent ? Math.round(p * (100 - reward.percent)) / 100 : mechanism === "price-amount" && reward.amount ? Math.max(0, Math.round(p * 100 - reward.amount) / 100) : null);
  const verdict = (r: TargetPrice): { k: "win" | "tie" | "lose" | "none"; diff: number } => {
    const ours = promo(r.price) ?? r.price;
    if (!r.kot || ours == null) return { k: "none", diff: 0 };
    const diff = Math.round((ours - r.kot.price) * 100) / 100;
    return { k: Math.abs(diff) < 0.5 ? "tie" : diff < 0 ? "win" : "lose", diff };
  };
  const list = rows ?? [];
  const v = list.map((r) => ({ r, ...verdict(r) }));
  const n = { win: v.filter((x) => x.k === "win").length, tie: v.filter((x) => x.k === "tie").length, lose: v.filter((x) => x.k === "lose").length, none: v.filter((x) => x.k === "none").length };
  const SEG = [["win", "bg-eu-green", "φθηνότεροι"], ["tie", "bg-eu-blue", "ίδια τιμή"], ["lose", "bg-eu-red", "ακριβότεροι"], ["none", "bg-eu-line", "χωρίς σύγκριση"]] as const;
  const hasPromo = v.some((x) => promo(x.r.price) != null);
  return (
    <section data-help="promo.kot" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 @container" aria-label="Τιμές επιλεγμένων προϊόντων και Κωτσόβολος">
      <div className="grid gap-0.5">
        <h4 className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-15)]">Τα {ids.length} προϊόντα σου απέναντι στον Κωτσόβολο</h4>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{hasPromo ? "Η σύγκριση γίνεται με την τιμή ΜΕ την προσφορά." : "Η σύγκριση γίνεται με τη σημερινή τιμή μας (αυτός ο τύπος προσφοράς δεν αλλάζει την τιμή του τεμαχίου)."} Μόνο προϊόντα με επιβεβαιωμένο ζευγάρι.</span>
      </div>
      {rows === null ? <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Φέρνω τιμές…</span> : (
        <>
          {/* σύνολο: μία μπάρα, κάθε χρώμα με τον αριθμό και τη λέξη του (όχι μόνο χρώμα) */}
          <div className="grid gap-1.5">
            <div className="flex h-3 rounded-full overflow-hidden bg-eu-surface" role="img" aria-label={SEG.map(([k, , t]) => `${n[k]} ${t}`).join(", ")}>
              {SEG.map(([k, c]) => (n[k] ? <span key={k} className={`${c} [flex-grow:var(--n)]`} ref={(el) => { el?.style.setProperty("--n", String(n[k])); }} /> : null))}
            </div>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)]">
              {SEG.map(([k, c, t]) => <li key={k} className="inline-flex items-center gap-1.5 text-eu-ink-2"><span aria-hidden className={`size-2.5 rounded-full ${c}`} /><b className="tabular-nums text-eu-ink">{n[k]}</b> {t}</li>)}
            </ul>
            {n.lose > 0 && <p className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">Σε {n.lose} προϊόντα ο Κωτσόβολος μένει φθηνότερος και με την προσφορά — δες αν θέλεις μεγαλύτερη έκπτωση ή να τα βγάλεις.</p>}
          </div>
          <ul className="m-0 p-0 list-none grid divide-y divide-eu-line-2 border-t border-eu-line-2">
            {v.slice(0, 100).map(({ r, k, diff }) => {
              const pp = promo(r.price);
              return (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_7.5rem_11rem_auto] items-center gap-x-3 gap-y-1 py-2">
                  <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] line-clamp-2">{r.title}</span><span className="font-mono text-eu-muted text-[length:var(--fs-12)] truncate">{r.sku}</span></span>
                  <button type="button" onClick={() => onRemove(r.id)} aria-label={`Αφαίρεση ${r.title}`} className="@3xl:order-last size-11 md:size-9 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
                  <span className="col-span-2 @3xl:col-span-1 grid grid-cols-3 @3xl:contents gap-2 text-[length:var(--fs-14)] tabular-nums">
                    <span className="grid"><span className="text-eu-muted text-[length:var(--fs-12)]">Τιμή μας</span><span className={pp != null ? "text-eu-ink-3 line-through" : "font-bold text-eu-ink"}>{r.price != null ? eur(r.price) : "—"}</span></span>
                    <span className="grid"><span className="text-eu-muted text-[length:var(--fs-12)]">Με προσφορά</span><span className="font-bold text-eu-ink">{pp != null ? eur(pp) : "—"}</span></span>
                    <span className="grid"><span className="text-eu-muted text-[length:var(--fs-12)]">Κωτσόβολος</span>{r.kot ? (r.kot.url ? <a href={r.kot.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-eu-blue hover:underline">{eur(r.kot.price)} <ExternalLink className="size-3" aria-hidden /></a> : <span className="font-bold text-eu-ink">{eur(r.kot.price)}</span>) : <span className="text-eu-muted">—</span>}</span>
                  </span>
                  <span className={`col-span-2 @3xl:col-span-1 inline-flex items-center gap-1.5 font-bold text-[length:var(--fs-13)] ${k === "win" ? "text-eu-green" : k === "lose" ? "text-eu-red" : k === "tie" ? "text-eu-blue" : "text-eu-muted"}`}>
                    {k === "win" ? <TrendingDown className="size-4 shrink-0" aria-hidden /> : k === "lose" ? <TrendingUp className="size-4 shrink-0" aria-hidden /> : <Minus className="size-4 shrink-0" aria-hidden />}
                    {k === "win" ? `Φθηνότεροι κατά ${eur(-diff)}` : k === "lose" ? `Ακριβότεροι κατά ${eur(diff)}` : k === "tie" ? "Ίδια τιμή" : "Δεν υπάρχει ζευγάρι"}{r.kot && !r.kot.available ? " · εκεί εξαντλημένο" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {v.length > 100 && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Φαίνονται τα πρώτα 100 από {v.length}· το σύνολο πάνω μετρά όλα.</p>}
        </>
      )}
    </section>
  );
}
