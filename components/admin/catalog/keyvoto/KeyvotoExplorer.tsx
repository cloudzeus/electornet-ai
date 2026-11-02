"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Loader2, Plug, Search } from "lucide-react";
import { connect, sample, type KvConnection, type KvSample } from "@/app/admin/(shell)/catalog/templates/keyvoto/actions";

/**
 * Το «παράθυρο» στο Keyvoto: δοκιμή σύνδεσης και δείγμα προϊόντων με όλα τα πεδία του εγγράφου τους. Είναι το πρώτο
 * βήμα — ό,τι φαίνεται εδώ ως «πεδία» είναι αυτό που θα αντιστοιχιστεί αργότερα στα δικά μας, όπως στα XML feeds.
 */

const card = "rounded-xl border border-eu-line bg-white p-3 grid gap-3 min-w-0";
const label = "grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink min-w-0";
const input = "min-h-11 rounded-lg border border-eu-line px-3 font-normal text-[length:var(--fs-14)] text-eu-ink bg-white w-full min-w-0";
const button = "min-h-11 inline-flex items-center justify-center gap-2 rounded-lg px-4 font-bold text-[length:var(--fs-14)] disabled:opacity-60";

export function KeyvotoExplorer({ configured, enabled, account }: { configured: boolean; enabled: boolean; account: string }) {
  const [conn, setConn] = useState<KvConnection | null>(null);
  const [data, setData] = useState<KvSample | null>(null);
  const [busy, setBusy] = useState<"" | "conn" | "sample">("");
  const [f, setF] = useState({ publisher: "", catalogue: "", search: "", gtin: "", pageSize: 5 });

  const run = async (what: "conn" | "sample") => {
    setBusy(what);
    try {
      if (what === "conn") { setConn(await connect()); setData(null); }
      else setData(await sample(f));
    } finally { setBusy(""); }
  };

  const cats = conn?.catalogues.filter((c) => !f.publisher || c.publisher === f.publisher) ?? [];

  if (!configured) {
    return (
      <div data-help="keyvoto.setup" className={card}>
        <p className="m-0 text-eu-ink text-[length:var(--fs-14)]">Δεν υπάρχουν ακόμη στοιχεία σύνδεσης. Η Keyvoto δίνει <b>client_id</b>, <b>client_secret</b> και το <b>Business Account Id</b> του καταστήματος· μπαίνουν μία φορά στις ρυθμίσεις.</p>
        <Link href="/admin/settings/keyvoto" className={`${button} bg-eu-blue text-white w-fit`}>Ρυθμίσεις Keyvoto</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 min-w-0">
      <section data-help="keyvoto.connect" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] inline-flex items-center gap-2"><Plug className="size-4.5 text-eu-blue" aria-hidden /> Σύνδεση</h3>
          <button type="button" onClick={() => run("conn")} disabled={!!busy || !enabled} className={`${button} bg-eu-blue text-white`}>
            {busy === "conn" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plug className="size-4" aria-hidden />} Δοκιμή σύνδεσης
          </button>
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Λογαριασμός <span className="font-mono text-eu-ink">{account || "—"}</span>. Η δοκιμή ζητά ένα token και διαβάζει ποιοι προμηθευτές μοιράζονται περιεχόμενο μαζί μας. {enabled ? "" : "Η διασύνδεση είναι κλειστή στις ρυθμίσεις."}</p>
        {conn && (
          <div className={`grid gap-2 rounded-lg p-3 ${conn.ok ? "bg-eu-surface" : "bg-eu-red/10"}`}>
            <p className="m-0 font-bold text-[length:var(--fs-14)] inline-flex items-start gap-2 text-eu-ink">
              {conn.ok ? <CheckCircle2 className="size-4.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4.5 text-eu-red shrink-0 mt-0.5" aria-hidden />}
              <span className="min-w-0">{conn.message}</span>
            </p>
            {conn.ok && (
              <>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{conn.ms} ms · το token ισχύει έως {conn.expiresAt ? new Date(conn.expiresAt).toLocaleString("el-GR") : "—"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {conn.publishers.map((p) => <span key={p.id} className="rounded-full bg-eu-chip text-eu-navy px-2.5 py-1 text-[length:var(--fs-13)]">{p.title}</span>)}
                  {!conn.publishers.length && <span className="text-eu-muted text-[length:var(--fs-13)]">Κανένας εκδότης ακόμη — ο προμηθευτής πρέπει να μας γράψει στον κατάλογό του.</span>}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section data-help="keyvoto.sample" className={card}>
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] inline-flex items-center gap-2"><Search className="size-4.5 text-eu-blue" aria-hidden /> Δείγμα προϊόντων</h3>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Φέρνει λίγα προϊόντα με ολόκληρο το περιεχόμενό τους, για να δεις τι στέλνει ο κάθε εκδότης πριν στηθεί η αντιστοίχιση. Δεν αποθηκεύεται τίποτα.</p>
        <div className="grid gap-3 @2xl:grid-cols-2">
          <label className={label}>Εκδότης
            <select value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value, catalogue: "" })} className={input} disabled={!conn?.ok}>
              <option value="">Όλοι</option>
              {conn?.publishers.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className={label}>Κατάλογος
            <select value={f.catalogue} onChange={(e) => setF({ ...f, catalogue: e.target.value })} className={input} disabled={!cats.length}>
              <option value="">Όλοι</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={label}>Αναζήτηση
            <input value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} className={input} placeholder="π.χ. ψυγείο" />
          </label>
          <label className={label}>Barcode (GTIN)
            <input value={f.gtin} onChange={(e) => setF({ ...f, gtin: e.target.value })} className={input} placeholder="ένα ή πολλά, χωρισμένα με κόμμα" inputMode="numeric" />
          </label>
          <label className={label}>Πόσα προϊόντα
            <input type="number" min={1} max={50} value={f.pageSize} onChange={(e) => setF({ ...f, pageSize: Number(e.target.value) })} className={input} />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={() => run("sample")} disabled={!!busy} className={`${button} bg-eu-navy text-white w-full @2xl:w-fit`}>
              {busy === "sample" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} Φέρε δείγμα
            </button>
          </div>
        </div>

        {data && (
          <div className="grid gap-3 min-w-0">
            <p className={`m-0 rounded-lg p-3 text-[length:var(--fs-14)] ${data.ok ? "bg-eu-surface text-eu-ink" : "bg-eu-red/10 text-eu-red font-bold"}`}>{data.message}</p>
            {!!data.products.length && (
              <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
                {data.products.map((p) => (
                  <li key={p.id} className="rounded-lg border border-eu-line p-2.5 grid gap-1 min-w-0">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{p.name || "—"}</span>
                    <span className="text-eu-muted text-[length:var(--fs-13)] break-words">{[p.code, p.category].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="text-eu-muted text-[length:var(--fs-12)]">{p.status || "—"}{p.updated ? ` · ενημερώθηκε ${new Date(p.updated).toLocaleDateString("el-GR")}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {!!data.fields.length && (
              <div data-help="keyvoto.fields" className="grid gap-2 min-w-0">
                <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Τα πεδία του περιεχομένου <span className="font-normal text-eu-muted">· {data.fields.length} σε {data.shown} προϊόντα — αυτά θα αντιστοιχιστούν στα δικά μας</span></h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[length:var(--fs-13)]">
                    <thead><tr className="text-left text-eu-muted"><th className="py-1.5 pr-3 font-bold">Πεδίο</th><th className="py-1.5 pr-3 font-bold">Σε πόσα</th><th className="py-1.5 font-bold">Δείγματα</th></tr></thead>
                    <tbody>
                      {data.fields.map((x) => (
                        <tr key={x.path} className="border-t border-eu-line align-top">
                          <td className="py-1.5 pr-3 font-mono text-eu-ink break-all">{x.path}</td>
                          <td className="py-1.5 pr-3 tabular-nums text-eu-muted whitespace-nowrap">{x.n}/{data.shown}</td>
                          <td className="py-1.5 text-eu-muted break-words">{x.samples.join(" · ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {data.raw && (
              <details className="rounded-lg border border-dashed border-eu-line-2 p-3">
                <summary className="font-bold text-eu-ink text-[length:var(--fs-14)] cursor-pointer min-h-11 flex items-center">Το πρώτο προϊόν όπως ακριβώς έρχεται</summary>
                <pre className="m-0 mt-2 overflow-x-auto text-[length:var(--fs-12)] text-eu-ink-3 whitespace-pre">{data.raw}</pre>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
