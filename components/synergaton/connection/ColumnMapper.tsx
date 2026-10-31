"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Check, CircleDot, Info, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { suggestFieldMap } from "@/app/synergaton/actions";
import { applyMapping, checkMapping, MAP_FIELDS, type FieldMapping, type MapField } from "@/lib/partner-portal/connection-types";
import { Badge, btn, Callout, focusRing } from "../ui";
import { inputCls } from "../wizard";

export type MapSource = "auto" | "manual" | "ai" | "saved";
const SRC: Record<MapSource, [string, "info" | "brand" | "good" | "neutral"]> = { auto: ["Αυτόματα", "info"], manual: ["Με το χέρι", "neutral"], ai: ["Πρόταση βοηθού", "brand"], saved: ["Αποθηκευμένο", "good"] };
const GROUP_LABEL = { id: "Αναγνώριση προϊόντος — ένα από τα δύο", required: "Υποχρεωτικό", optional: "Προαιρετικά" } as const;
/** χρώμα ανά πεδίο: ίδιο στην κάρτα πεδίου και στην ετικέτα της στήλης (+ κείμενο, όχι μόνο χρώμα) */
const HUE: Record<MapField, string> = { sku: "bg-[#e7efff] text-[#123a8c] border-[#b9cdf5]", ean: "bg-[#e6f6ef] text-[#0f5b3a] border-[#b4e0c9]", qty: "bg-[#fff4cc] text-[#6b4d00] border-[#f2d675]", location: "bg-[#f3e9ff] text-[#5a2a8c] border-[#d7c0f2]", mpn: "bg-eu-surface-2 text-eu-ink-2 border-eu-line", brand: "bg-eu-surface-2 text-eu-ink-2 border-eu-line", title: "bg-eu-surface-2 text-eu-ink-2 border-eu-line" };
const label = (k: MapField) => MAP_FIELDS.find((f) => f.key === k)!.label;

/**
 * Αντιστοίχιση στηλών: αριστερά τα πεδία μας (με δείγμα τιμών κάτω από κάθε επιλογή), δεξιά οι ζωντανοί έλεγχοι και
 * «τι θα διαβάσουμε» από το δείγμα· από κάτω οι στήλες του αρχείου τους ως κάρτες, με την ίδια ετικέτα χρώματος/κειμένου.
 * Αλλάζει από όποια πλευρά βολεύει — μία κατάσταση.
 */
export function ColumnMapper({ columns, preview, map, src, onChange }: {
  columns: string[];
  preview: Record<string, string>[];
  map: FieldMapping;
  src: Partial<Record<MapField, MapSource>>;
  onChange: (map: FieldMapping, src: Partial<Record<MapField, MapSource>>) => void;
}) {
  const [ai, setAi] = useState<{ map: FieldMapping; notes: Partial<Record<MapField, string>>; summary: string } | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const checks = useMemo(() => checkMapping(map, columns, preview), [map, columns, preview]);
  const result = useMemo(() => applyMapping(map, preview), [map, preview]);
  const errors = checks.filter((c) => !c.ok && c.level === "error").length, warns = checks.filter((c) => !c.ok && c.level === "warn").length;
  const fieldOf = (col: string) => (Object.entries(map) as [MapField, string][]).find(([, c]) => c === col)?.[0];
  const samples = (col?: string) => (col ? [...new Set(preview.map((r) => (r[col] ?? "").trim()).filter(Boolean))].slice(0, 3) : []);

  const set = (k: MapField, col: string, how: MapSource = "manual") => {
    const m = { ...map }, s = { ...src };
    if (col) { m[k] = col; s[k] = how; } else { delete m[k]; delete s[k]; }
    onChange(m, s);
  };
  const assignColumn = (col: string, k: MapField | "") => {
    const m = { ...map }, s = { ...src };
    const prev = fieldOf(col);
    if (prev) { delete m[prev]; delete s[prev]; }
    if (k) { m[k] = col; s[k] = "manual"; }
    onChange(m, s);
  };
  const askAi = () => start(async () => {
    setAiErr(null);
    const r = await suggestFieldMap(columns, preview);
    if (r.ok) setAi({ map: r.map, notes: r.notes as Partial<Record<MapField, string>>, summary: r.summary }); else setAiErr(r.error);
  });
  const applyAi = () => {
    if (!ai) return;
    const m: FieldMapping = { ...map }, s = { ...src };
    for (const [k, c] of Object.entries(ai.map) as [MapField, string][]) if (c && columns.includes(c)) { m[k] = c; s[k] = "ai"; }
    onChange(m, s); setAi(null);
  };
  const aiDiff = ai ? (Object.entries(ai.map) as [MapField, string][]).filter(([k, c]) => c && map[k] !== c) : [];

  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-eu-surface px-4 py-3">
        <p className="m-0 text-[length:var(--fs-14)] text-eu-ink-2 min-w-0">
          Το αρχείο σας έχει <b className="tabular-nums">{columns.length}</b> στήλες. Πείτε μας ποια στήλη είναι τι — <b>{Object.keys(map).length}</b> από {MAP_FIELDS.length} πεδία ορισμένα.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={askAi} disabled={pending} className={btn("brand", "sm")} data-help="portal.mapping-ai">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {pending ? "Ο βοηθός κοιτάζει…" : "Πρόταση από τον βοηθό"}
          </button>
        </div>
      </div>
      {aiErr && <Callout tone="warn">{aiErr}</Callout>}
      {ai && (
        <div className="rounded-2xl border-2 border-eu-yellow bg-[#fffbea] p-4 grid gap-3 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none" role="region" aria-label="Πρόταση βοηθού">
          <div className="flex items-start gap-3"><Sparkles className="size-5 text-[#8a6500] shrink-0 mt-0.5" aria-hidden /><p className="m-0 text-[length:var(--fs-14)]">{ai.summary}</p></div>
          {aiDiff.length ? (
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {aiDiff.map(([k, c]) => (
                <li key={k} className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]">
                  <span className={`rounded-md border px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${HUE[k]}`}>{label(k)}</span>
                  {map[k] && <><s className="text-eu-muted break-all">{map[k]}</s><ArrowRight className="size-3.5 text-eu-muted" aria-hidden /></>}
                  <b className="break-all">{c}</b>
                  {ai.notes[k] && <span className="text-eu-ink-3 text-[length:var(--fs-13)]">— {ai.notes[k]}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Συμφωνεί με την τρέχουσα αντιστοίχιση.</p>}
          <div className="flex flex-wrap gap-2">
            {aiDiff.length > 0 && <button type="button" onClick={applyAi} className={btn("primary", "sm")}><Check className="size-4" aria-hidden /> Εφαρμογή ({aiDiff.length})</button>}
            <button type="button" onClick={() => setAi(null)} className={btn("ghost", "sm")}>Όχι, ευχαριστώ</button>
          </div>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Ο βοηθός είδε μόνο τα ονόματα των στηλών και 5 γραμμές προϊόντων. Ελέγξτε την πρόταση — οι έλεγχοι δεξιά τρέχουν και σε αυτήν.</p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
        {/* πεδία */}
        <div className="grid gap-4 min-w-0" data-help="portal.mapping-fields">
          {(["id", "required", "optional"] as const).map((g) => (
            <fieldset key={g} className="m-0 p-0 border-0 grid gap-2 min-w-0">
              <legend className="mb-1 font-bold text-eu-ink-3 text-[length:var(--fs-12)] uppercase tracking-wide">{GROUP_LABEL[g]}</legend>
              <div className={`grid gap-2 ${g === "optional" ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
                {MAP_FIELDS.filter((f) => f.group === g).map((f) => {
                  const col = map[f.key], s = src[f.key], ex = samples(col);
                  const missing = (g === "required" && !col) || (g === "id" && !map.sku && !map.ean);
                  return (
                    <div key={f.key} className={`rounded-2xl border-2 p-3 grid gap-2 min-w-0 transition-colors duration-150 ${col ? "border-eu-line bg-white" : missing ? "border-dashed border-[#e0786e] bg-[#fffafa]" : "border-dashed border-eu-line bg-white"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor={`map-${f.key}`} className="flex items-center gap-2 min-w-0">
                          <span className={`rounded-md border px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${HUE[f.key]}`}>{f.label}</span>
                          {g === "required" && <span className="text-[#b3261e] font-bold text-[length:var(--fs-12)]">υποχρεωτικό</span>}
                        </label>
                        {s && <Badge tone={SRC[s][1]} icon={false}>{SRC[s][0]}</Badge>}
                      </div>
                      <select id={`map-${f.key}`} value={col ?? ""} onChange={(e) => set(f.key, e.target.value)} className={`${inputCls(missing && g === "required")} !min-h-11`} aria-describedby={`maph-${f.key}`}>
                        <option value="">— καμία στήλη —</option>
                        {columns.map((c) => { const used = fieldOf(c); return <option key={c} value={c}>{c}{used && used !== f.key ? ` (τώρα: ${label(used)})` : ""}</option>; })}
                      </select>
                      <p id={`maph-${f.key}`} className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] leading-snug">{f.help}</p>
                      {ex.length > 0 && (
                        <div className="flex flex-wrap gap-1.5" aria-label={`Δείγμα τιμών για ${f.label}`}>
                          {ex.map((v) => <code key={v} className="rounded-md bg-eu-surface px-1.5 py-0.5 text-[length:var(--fs-12)] text-eu-ink-2 break-all max-w-full">{v.length > 40 ? v.slice(0, 40) + "…" : v}</code>)}
                        </div>
                      )}
                      {col && <button type="button" onClick={() => set(f.key, "")} className={`justify-self-start inline-flex items-center gap-1 text-eu-ink-3 hover:text-eu-ink text-[length:var(--fs-12)] min-h-11 ${focusRing} rounded-md`}><RotateCcw className="size-3.5" aria-hidden /> Καθαρισμός</button>}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {/* έλεγχοι + αποτέλεσμα */}
        <aside className="grid gap-3 min-w-0 xl:sticky xl:top-4" aria-label="Έλεγχοι αντιστοίχισης" data-help="portal.mapping-checks">
          <div className={`rounded-2xl p-4 grid gap-2 ${errors ? "bg-[#fdecea]" : warns ? "bg-[#fff7e0]" : "bg-[#e6f6ef]"}`} aria-live="polite">
            <p className="m-0 font-heading font-extrabold text-[length:var(--fs-16)]">{errors ? `${errors} θέματα πριν συνεχίσετε` : warns ? `Έτοιμο, με ${warns} παρατηρήσεις` : "Όλα σωστά"}</p>
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {checks.map((c) => {
                const I = c.ok ? Check : c.level === "error" ? X : c.level === "warn" ? AlertTriangle : Info;
                return <li key={c.key} className="flex gap-2 items-start text-[length:var(--fs-13)] leading-snug"><I className={`size-4 shrink-0 mt-0.5 ${c.ok ? "text-eu-green" : c.level === "error" ? "text-[#b3261e]" : c.level === "warn" ? "text-[#8a6500]" : "text-eu-blue"}`} aria-hidden /><span><span className="sr-only">{c.ok ? "ΟΚ: " : c.level === "error" ? "Σφάλμα: " : "Προσοχή: "}</span>{c.message}</span></li>;
              })}
            </ul>
          </div>
          <div className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0">
            <p className="m-0 font-bold text-[length:var(--fs-14)]">Τι θα διαβάσουμε από το δείγμα</p>
            {result.length ? (
              <ol className="m-0 p-0 list-none grid gap-1.5">
                {result.map((r, i) => (
                  <li key={i} className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-2 items-start rounded-lg px-2 py-1.5 text-[length:var(--fs-13)] ${r.ok ? "bg-eu-surface" : "bg-[#fdecea]"}`}>
                    {r.ok ? <Check className="size-4 text-eu-green mt-0.5" aria-label="δεκτή" /> : <X className="size-4 text-[#b3261e] mt-0.5" aria-label="θα απορριφθεί" />}
                    <span className="min-w-0"><b className="block break-all">{r.sku || "χωρίς κωδικό"}</b>{r.title && <span className="block text-eu-ink-3 truncate">{r.title}</span>}{map.location && <span className="block text-eu-ink-3 break-all"><CircleDot className="inline size-3 mr-1" aria-hidden />{r.location || "—"}</span>}</span>
                    <span className="font-extrabold tabular-nums text-right">{r.qty === null ? "—" : r.qty}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν υπάρχει δείγμα.</p>}
          </div>
        </aside>
      </div>

      {/* στήλες του αρχείου */}
      <section className="grid gap-2 min-w-0" aria-labelledby="cols-h" data-help="portal.mapping-columns">
        <h3 id="cols-h" className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Οι στήλες του αρχείου σας</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αν σας είναι πιο εύκολο, ξεκινήστε από εδώ: σε κάθε στήλη διαλέξτε τι περιέχει. Όσες μείνουν «Δεν χρειάζεται» αγνοούνται.</p>
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {columns.map((c) => {
            const f = fieldOf(c), ex = samples(c);
            return (
              <li key={c} className={`rounded-xl border-2 p-3 grid gap-2 min-w-0 ${f ? "border-eu-navy/25 bg-white" : "border-eu-line bg-eu-surface/60"}`}>
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <code className="font-bold text-[length:var(--fs-13)] text-eu-ink break-all">{c}</code>
                  {f && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-bold text-[length:var(--fs-11)] ${HUE[f]}`}>{label(f)}</span>}
                </div>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] break-all min-h-4">{ex.length ? ex.join(" · ") : "κενή στο δείγμα"}</p>
                <label className="sr-only" htmlFor={`col-${c}`}>Τι περιέχει η στήλη {c}</label>
                <select id={`col-${c}`} value={f ?? ""} onChange={(e) => assignColumn(c, e.target.value as MapField | "")} className={`${inputCls()} !min-h-11 !text-[length:var(--fs-14)]`}>
                  <option value="">Δεν χρειάζεται</option>
                  {MAP_FIELDS.map((m) => <option key={m.key} value={m.key}>{m.label}{map[m.key] && map[m.key] !== c ? ` (τώρα: ${map[m.key]})` : ""}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
