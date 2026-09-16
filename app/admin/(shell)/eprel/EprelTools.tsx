"use client";
import { useState, useTransition } from "react";
import { RefreshCw, Loader2, Search, Download, CloudUpload, Trash2, FileText, Image as ImageIcon, ExternalLink } from "lucide-react";
import { syncEprelGroups, refreshEprel, searchEprel, importEprel, mirrorEprel, removeEprel, setGroupActive } from "./actions";
import { scaleLabel } from "@/lib/eprel/normalize";

type Hit = { registrationNumber: string; modelIdentifier: string; supplierOrTrademark: string; energyClass: string | null; energyClassRange: string | null; annualKwh: number | null; status: string | null; onMarketEnd: string | Date | null };

const btn = "inline-flex items-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const small = "inline-flex items-center gap-1 rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-9 hover:border-eu-navy disabled:opacity-60";

/** Κεφαλίδα: ομάδες + ανανέωση. Αναζήτηση: φόρμα + αποτελέσματα + εισαγωγή. */
export function EprelTools({ mode, groups }: { mode: "header" | "search"; groups: { urlCode: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [group, setGroup] = useState(groups[0]?.urlCode ?? "");
  const [model, setModel] = useState("");
  const [brand, setBrand] = useState("");
  const [res, setRes] = useState<{ size: number; hits: Hit[] } | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());

  if (mode === "header") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await syncEprelGroups(); setMsg(r.ok ? `${r.fetched} ομάδες (${r.created} νέες).` : `Σφάλμα: ${r.error}`); })} className={secondary}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Ομάδες από το EPREL
        </button>
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await refreshEprel(); setMsg(r.ok ? `Ανανεώθηκαν ${r.updated} από ${r.fetched} παλαιότερες των 30 ημερών.` : `Σφάλμα: ${r.error}`); })} className={secondary}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Ανανέωση αποθηκευμένων
        </button>
        {msg && <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</span>}
      </span>
    );
  }

  const doSearch = () => start(async () => {
    setMsg(null);
    const r = await searchEprel(group, model, brand);
    if (!r.ok) { setMsg(r.error ?? "Σφάλμα"); setRes(null); return; }
    setRes({ size: r.size, hits: r.hits });
  });
  const doImport = async (reg: string) => {
    setBusy((b) => new Set(b).add(reg));
    const r = await importEprel(reg, true);
    setBusy((b) => { const n = new Set(b); n.delete(reg); return n; });
    if (r.ok) setDone((d) => new Set(d).add(reg)); else setMsg(r.error ?? "Η εισαγωγή απέτυχε.");
  };

  return (
    <div className="grid gap-3">
      <form onSubmit={(e) => { e.preventDefault(); doSearch(); }} className="flex flex-wrap items-end gap-2 rounded-2xl border border-eu-line bg-white p-3">
        <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink">Ομάδα
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-lg border border-eu-line px-2 min-h-10 text-[length:var(--fs-14)] font-normal bg-white min-w-[220px]">
            {groups.map((g) => <option key={g.urlCode} value={g.urlCode}>{g.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink flex-1 min-w-[200px]">Κωδικός μοντέλου
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="π.χ. WW90T534DAW ή OLED55C3*" className="rounded-lg border border-eu-line px-3 min-h-10 text-[length:var(--fs-14)] font-normal" />
        </label>
        <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink min-w-[160px]">Μάρκα
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="π.χ. Samsung" className="rounded-lg border border-eu-line px-3 min-h-10 text-[length:var(--fs-14)] font-normal" />
        </label>
        <button type="submit" disabled={pending || !group} className={primary}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Αναζήτηση στο EPREL</button>
      </form>
      {msg && <p className="m-0 rounded-xl bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">{msg}</p>}
      {res && (
        <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
          <div className="px-3 py-2 text-eu-muted text-[length:var(--fs-13)] border-b border-eu-line">{res.size.toLocaleString("el-GR")} αποτελέσματα στο EPREL{res.size > res.hits.length ? `, δείχνουμε τα πρώτα ${res.hits.length} — στένεψε την αναζήτηση` : ""}.</div>
          <table className="w-full text-[length:var(--fs-14)]">
            <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Αρ. EPREL</th><th className="py-2 px-3">Μοντέλο</th><th className="py-2 px-3">Μάρκα</th><th className="py-2 px-3">Κλάση</th><th className="py-2 px-3">kWh/έτος</th><th className="py-2 px-3">Κατάσταση</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {res.hits.map((h) => (
                <tr key={h.registrationNumber} className="border-t border-eu-line">
                  <td className="py-2 px-3 tabular-nums">{h.registrationNumber}</td>
                  <td className="py-2 px-3 font-bold text-eu-ink">{h.modelIdentifier}</td>
                  <td className="py-2 px-3">{h.supplierOrTrademark}</td>
                  <td className="py-2 px-3"><ClassBadge cls={h.energyClass} range={h.energyClassRange} /></td>
                  <td className="py-2 px-3 tabular-nums">{h.annualKwh ?? "—"}</td>
                  <td className="py-2 px-3 text-eu-ink-3">{h.onMarketEnd ? "Αποσύρθηκε" : h.status === "PUBLISHED" ? "Στην αγορά" : h.status ?? "—"}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    {done.has(h.registrationNumber) ? <span className="text-eu-green font-bold text-[length:var(--fs-13)]">Αποθηκεύτηκε</span> : (
                      <button type="button" disabled={busy.has(h.registrationNumber)} onClick={() => doImport(h.registrationNumber)} className={small}>{busy.has(h.registrationNumber) ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />} Εισαγωγή + αρχεία</button>
                    )}
                  </td>
                </tr>
              ))}
              {!res.hits.length && <tr><td colSpan={7} className="p-6 text-center text-eu-muted">Τίποτα — δοκίμασε λιγότερους χαρακτήρες με `*` στο τέλος.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Κλάση με την κλίμακά της: το χρώμα ακολουθεί την ετικέτα της ΕΕ. */
export function ClassBadge({ cls, range }: { cls: string | null; range: string | null }) {
  if (!cls) return <span className="text-eu-muted">—</span>;
  const c = cls.replace(/\+/g, "");
  const color: Record<string, string> = { A: "#00a651", B: "#4cb848", C: "#bfd730", D: "#fff200", E: "#fdb913", F: "#f37021", G: "#ed1c24" };
  return <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center justify-center min-w-8 min-h-7 px-1.5 rounded font-extrabold text-white text-[length:var(--fs-13)]" style={{ background: color[c] ?? "#666", color: c === "D" || c === "C" ? "#122a58" : "#fff" }}>{cls}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{scaleLabel(range)}</span></span>;
}

export function GroupToggle({ code, active }: { code: string; active: boolean }) {
  const [pending, start] = useTransition();
  return <input type="checkbox" checked={active} disabled={pending} onChange={(e) => start(async () => { await setGroupActive(code, e.target.checked); })} aria-label="Ενεργή ομάδα" className="size-4 accent-eu-navy" />;
}

export function StoredRow({ row }: { row: { registrationNumber: string; modelIdentifier: string; supplierOrTrademark: string; groupName: string; energyClass: string | null; energyClassRange: string | null; annualKwh: number | null; annualKwhBasis: string | null; nestedLabelSvg: string | null; labelSvgUrl: string | null; ficheUrl: string | null; labelAssetUrl: string | null; ficheAssetUrl: string | null; fetchedAt: string; linked: number; status: string | null; onMarketEnd: string | null } }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (gone) return null;
  return (
    <tr className="border-t border-eu-line align-top">
      <td className="py-2 px-3">{row.nestedLabelSvg ? <span className="inline-block w-16 [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: row.nestedLabelSvg }} /> : <ClassBadge cls={row.energyClass} range={row.energyClassRange} />}</td>
      <td className="py-2 px-3"><div className="font-bold text-eu-ink">{row.modelIdentifier}</div><div className="text-eu-muted text-[length:var(--fs-13)]">{row.supplierOrTrademark} · EPREL {row.registrationNumber}{row.linked ? ` · ${row.linked} προϊόν` : ""}</div></td>
      <td className="py-2 px-3 text-eu-ink-3">{row.groupName}</td>
      <td className="py-2 px-3"><ClassBadge cls={row.energyClass} range={row.energyClassRange} /></td>
      <td className="py-2 px-3 tabular-nums" title={row.annualKwhBasis ?? undefined}>{row.annualKwh ?? "—"}</td>
      <td className="py-2 px-3 whitespace-nowrap">
        <span className="inline-flex flex-wrap gap-1">
          {(row.labelAssetUrl ?? row.labelSvgUrl) && <a href={row.labelAssetUrl ?? row.labelSvgUrl ?? "#"} target="_blank" rel="noreferrer" className={`${small} no-underline ${row.labelAssetUrl ? "text-eu-green border-eu-green/40" : ""}`} title={row.labelAssetUrl ? "Ετικέτα στο CDN μας" : "Ετικέτα από το EPREL"}><ImageIcon className="size-3.5" aria-hidden /> Ετικέτα</a>}
          {(row.ficheAssetUrl ?? row.ficheUrl) && <a href={row.ficheAssetUrl ?? row.ficheUrl ?? "#"} target="_blank" rel="noreferrer" className={`${small} no-underline ${row.ficheAssetUrl ? "text-eu-green border-eu-green/40" : ""}`} title={row.ficheAssetUrl ? "Δελτίο στο CDN μας" : "Δελτίο από το EPREL"}><FileText className="size-3.5" aria-hidden /> Δελτίο</a>}
          {!row.labelAssetUrl && <button type="button" disabled={pending} onClick={() => start(async () => { const r = await mirrorEprel(row.registrationNumber); setMsg(r.ok ? "Αρχεία στο CDN." : r.error ?? "Απέτυχε"); })} className={small}>{pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CloudUpload className="size-3.5" aria-hidden />} Στο CDN</button>}
        </span>
        {msg && <div className="text-eu-muted text-[length:var(--fs-13)] mt-1">{msg}</div>}
      </td>
      <td className="py-2 px-3 text-eu-ink-3 whitespace-nowrap text-[length:var(--fs-13)]">{new Date(row.fetchedAt).toLocaleDateString("el-GR")}{row.onMarketEnd ? <div className="text-eu-red font-bold">Αποσύρθηκε</div> : null}</td>
      <td className="py-2 px-3 text-right whitespace-nowrap">
        <a href={`https://eprel.ec.europa.eu/screen/product/${row.registrationNumber}`} target="_blank" rel="noreferrer" aria-label="Άνοιγμα στο EPREL" className="inline-flex size-9 items-center justify-center rounded-full text-eu-muted hover:bg-eu-surface"><ExternalLink className="size-4" aria-hidden /></a>
        <button type="button" disabled={pending} onClick={() => { if (confirm(`Διαγραφή της καταχώρισης ${row.registrationNumber} από τη βάση μας;`)) start(async () => { await removeEprel(row.registrationNumber); setGone(true); }); }} aria-label="Διαγραφή" className="inline-flex size-9 items-center justify-center rounded-full text-eu-muted hover:bg-eu-red/10 hover:text-eu-red"><Trash2 className="size-4" aria-hidden /></button>
      </td>
    </tr>
  );
}
