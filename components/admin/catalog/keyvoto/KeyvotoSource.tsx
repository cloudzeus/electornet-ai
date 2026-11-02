"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { keyvotoUrl, parseKeyvotoUrl } from "@/lib/keyvoto/rows";
import { connect } from "@/app/admin/(shell)/catalog/templates/keyvoto/actions";

/**
 * Η «διεύθυνση» ενός feed Keyvoto: εκδότης και (προαιρετικά) ένας συγκεκριμένος κατάλογός του. Παίρνει τη θέση του
 * πεδίου URL στον οδηγό, και δίνει πίσω την ίδια μορφή (`keyvoto:<εκδότης>/<κατάλογος>`) ώστε από εκεί και κάτω ο
 * οδηγός να μη χρειάζεται να ξέρει τίποτα για PIM.
 */
export function KeyvotoSource({ value, onChange, disabled, label = "Πηγή Keyvoto" }: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [lists, setLists] = useState<{ publishers: { id: string; title: string }[]; catalogues: { id: string; name: string; publisher: string; products: number }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** ξεκινά φορτώνοντας: οι εκδότες έρχονται με την πρώτη απόδοση */
  const [loading, setLoading] = useState(true);

  const apply = (r: Awaited<ReturnType<typeof connect>>) => {
    setLoading(false);
    if (!r.ok) { setErr(r.message); setLists(null); return; }
    setErr(null);
    setLists({ publishers: r.publishers, catalogues: r.catalogues });
  };
  // Η απάντηση γράφει την κατάσταση μέσα στο `then` — όχι σύγχρονα μέσα στο effect.
  useEffect(() => {
    let alive = true;
    void connect().then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, []);
  const retry = () => { setLoading(true); setErr(null); void connect().then(apply); };

  const cur = parseKeyvotoUrl(value) ?? { publisher: "", catalogue: "" };
  const cats = (lists?.catalogues ?? []).filter((c) => c.publisher === cur.publisher);
  const sel = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)]";

  return (
    <div className="grid gap-2 min-w-0">
      <div className="grid gap-2 sm:grid-cols-2 min-w-0">
        <label className="grid gap-1 min-w-0">
          <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">{label} · εκδότης</span>
          <select value={cur.publisher} disabled={disabled || loading || !lists} onChange={(e) => onChange(e.target.value ? keyvotoUrl(e.target.value) : "")} className={sel}>
            <option value="">— διάλεξε εκδότη —</option>
            {(lists?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 min-w-0">
          <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Κατάλογος <span className="font-normal text-eu-muted">· προαιρετικά</span></span>
          <select value={cur.catalogue} disabled={disabled || !cur.publisher || !cats.length} onChange={(e) => onChange(keyvotoUrl(cur.publisher, e.target.value))} className={sel}>
            <option value="">Όλοι οι κατάλογοί του</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.products ? `${c.name} · ${c.products.toLocaleString("el-GR")} προϊόντα` : c.name}</option>)}
          </select>
        </label>
      </div>
      {loading && <p className="m-0 inline-flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Διαβάζουμε ποιοι εκδότες μοιράζονται περιεχόμενο μαζί μας…</p>}
      {err && (
        <p className="m-0 flex flex-wrap items-start gap-2 rounded-lg bg-eu-red/10 p-2 text-eu-red font-bold text-[length:var(--fs-13)]">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden /> <span className="min-w-0">{err}</span>
          <button type="button" onClick={retry} className="inline-flex items-center gap-1 underline min-h-11 md:min-h-9"><RefreshCw className="size-3.5" aria-hidden /> Ξαναδοκίμασε</button>
        </p>
      )}
      {!loading && !err && lists && !lists.publishers.length && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κανένας εκδότης ακόμη: ο προμηθευτής πρέπει πρώτα να μας γράψει στον κατάλογό του μέσα στο Keyvoto.</p>}
    </div>
  );
}
