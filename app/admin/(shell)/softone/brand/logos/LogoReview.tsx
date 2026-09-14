"use client";
import { useState, useTransition } from "react";
import { Check, X, Loader2, RotateCcw, CloudUpload, ExternalLink } from "lucide-react";
import { decideSuggestion, decideMany, resetLogo } from "../../actions";

export interface LogoRow {
  id: string; name: string; code: string | null;
  domain: string | null; domainSuggest: string | null;
  logo: string | null; logoCdn: string | null; logoScore: number | null;
  logoStatus: string | null; logoSource: string | null;
}

/** Υψηλή / μέτρια / χαμηλή βεβαιότητα αντιστοίχισης ονόματος → domain. */
function Score({ v }: { v: number | null }) {
  if (v == null) return null;
  const [label, cls] = v >= 0.85 ? ["υψηλή", "bg-eu-green/12 text-eu-green"] : v >= 0.5 ? ["μέτρια", "bg-eu-yellow/25 text-eu-ink"] : ["χαμηλή", "bg-eu-surface-2 text-eu-ink-3"];
  return <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-13)] ${cls}`} title={`Βεβαιότητα ${Math.round(v * 100)}%`}>{label}</span>;
}

/**
 * Προεπισκόπηση λογοτύπου. Όταν το Brandfetch δεν έχει εικόνα για το domain,
 * ο σύνδεσμος γυρίζει 404 (το ζητάμε ρητά, αλλιώς σερβίρει το δικό του σήμα
 * σαν να είναι της μάρκας) — τότε δείχνουμε κείμενο αντί για σπασμένη εικόνα,
 * που είναι και η πληροφορία που χρειάζεται ο διαχειριστής για να απορρίψει.
 */
function Preview({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="grid place-items-center min-h-24 rounded-xl bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:14px_14px] p-2">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Λογότυπο ${name}`} loading="lazy" onError={() => setBroken(true)} className="max-h-20 max-w-full object-contain" />
      ) : <span className="text-eu-muted text-[length:var(--fs-13)]">{broken ? "Δεν βρέθηκε εικόνα" : "Χωρίς εικόνα"}</span>}
    </div>
  );
}

/**
 * Κάρτες ελέγχου: προεπισκόπηση λογοτύπου, όνομα μάρκας, domain και οι δύο
 * αποφάσεις. Η έγκριση κατεβάζει το αρχείο στο δικό μας CDN, οπότε παίρνει
 * λίγο χρόνο — η κάρτα δείχνει την πρόοδο και μετά βγαίνει από τη λίστα.
 */
export function LogoReview({ rows: initial, status }: { rows: LogoRow[]; status: string }) {
  const [rows, setRows] = useState(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [bulk, startBulk] = useTransition();

  const drop = (ids: string[]) => { setRows((rs) => rs.filter((r) => !ids.includes(r.id))); setSel((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; }); };
  const mark = (id: string, on: boolean) => setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });

  const decide = async (id: string, accept: boolean) => {
    mark(id, true);
    const r = await decideSuggestion(id, accept);
    mark(id, false);
    if (accept && r.ok && !r.saved) setNote(r.error ?? "Το αρχείο δεν κατέβηκε — έμεινε ο σύνδεσμος.");
    drop([id]);
  };

  const decideSelected = (accept: boolean) => {
    const ids = [...sel];
    if (!ids.length) return;
    startBulk(async () => {
      const r = await decideMany(ids, accept);
      setNote(accept ? `${r.saved} λογότυπα αποθηκεύτηκαν στο CDN${r.failed ? `, ${r.failed} χωρίς αρχείο` : ""}.` : `${r.count} απορρίφθηκαν.`);
      drop(ids);
    });
  };

  const back = async (id: string) => { mark(id, true); await resetLogo(id); mark(id, false); drop([id]); };

  if (!rows.length) return <p className="m-0 rounded-2xl border border-eu-line bg-white p-8 text-center text-eu-muted text-[length:var(--fs-15)]">Καμία μάρκα εδώ.</p>;

  return (
    <div className="grid gap-3">
      {status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-eu-line bg-white px-3 py-2">
          <label className="inline-flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)]">
            <input type="checkbox" checked={sel.size === rows.length && rows.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="size-4 accent-eu-navy" />
            Επιλογή όλων στη σελίδα
          </label>
          <span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{sel.size} επιλεγμένα</span>
          <span className="flex-1" />
          <button type="button" disabled={!sel.size || bulk} onClick={() => decideSelected(true)} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)] disabled:opacity-40">
            {bulk ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CloudUpload className="size-4" aria-hidden />} Έγκριση &amp; αποθήκευση στο CDN
          </button>
          <button type="button" disabled={!sel.size || bulk} onClick={() => decideSelected(false)} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-line px-4 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-40">
            <X className="size-4" aria-hidden /> Απόρριψη
          </button>
        </div>
      )}

      {note && <p className="m-0 rounded-xl bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">{note}</p>}

      <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] list-none p-0 m-0">
        {rows.map((r) => {
          const domain = r.domainSuggest ?? r.domain;
          const src = r.logo ?? r.logoCdn;
          const working = busy.has(r.id) || bulk;
          return (
            <li key={r.id} className={`grid gap-2 rounded-2xl border bg-white p-3 ${sel.has(r.id) ? "border-eu-navy" : "border-eu-line"}`}>
              <div className="flex items-start gap-2">
                {status === "pending" && <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} aria-label={`Επιλογή ${r.name}`} className="size-4 accent-eu-navy mt-1" />}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-eu-ink text-[length:var(--fs-15)] truncate" title={r.name}>{r.name}</div>
                  <div className="text-eu-muted text-[length:var(--fs-13)] truncate">{r.code ?? "—"}</div>
                </div>
                <Score v={r.logoScore} />
              </div>

              <Preview src={src} name={r.name} />

              {domain ? (
                <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] truncate no-underline hover:underline">{domain} <ExternalLink className="size-3.5 shrink-0" aria-hidden /></a>
              ) : <span className="text-eu-muted text-[length:var(--fs-13)]">Χωρίς domain</span>}

              {r.logo && <span className="text-eu-green font-bold text-[length:var(--fs-13)]">Αποθηκευμένο στο CDN μας</span>}

              <div className="flex flex-wrap gap-2">
                {status === "pending" ? (
                  <>
                    <button type="button" disabled={working} onClick={() => decide(r.id, true)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-eu-navy text-white px-3 min-h-10 font-bold text-[length:var(--fs-14)] disabled:opacity-50">
                      {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Έγκριση
                    </button>
                    <button type="button" disabled={working} onClick={() => decide(r.id, false)} className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50">
                      <X className="size-4" aria-hidden /> Όχι
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={working} onClick={() => back(r.id)} className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50">
                    {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />} Νέος έλεγχος
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
