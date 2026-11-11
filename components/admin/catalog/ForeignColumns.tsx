"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Link2, Loader2, Plus, Store, Tag, Trash2, X, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import type { ComposeField, ComposePart, ForeignRow } from "@/lib/catalog/foreign-import/core";
import type { Settings } from "@/lib/cms/settings";
import type { LiveCard } from "@/lib/catalog/foreign-import/server";
import { webNameOf } from "@/lib/catalog/foreign-import/pending-core";
import { asProduct } from "@/components/admin/catalog/CardPeek";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { CartProvider } from "@/components/commerce/CartProvider";
import { ProductCard } from "@/components/commerce/ProductCard";
import { ProductImage } from "@/components/commerce/ProductImage";

const ctl = "min-w-0 rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const ghost = "inline-flex items-center justify-center gap-1 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-semibold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface transition-colors disabled:opacity-50";
const iconBtn = "grid place-items-center size-11 md:size-7 rounded-md text-eu-ink-3 hover:bg-eu-surface hover:text-eu-ink transition-colors disabled:opacity-30";

/** Πού μπορεί να γραφτεί ένα σύνθετο πεδίο. */
const DEST: { value: string; label: string }[] = [
  { value: "name", label: "Όνομα προϊόντος" },
  { value: "shortDesc", label: "Σύντομη περιγραφή" },
  { value: "descText", label: "Αναλυτική περιγραφή" },
  { value: "spec", label: "Χαρακτηριστικό" },
];
export const destLabel = (f: ComposeField) => (f.target.kind === "spec" ? `Χαρακτηριστικό «${f.target.label || "χωρίς ετικέτα"}»` : DEST.find((d) => d.value === (f.target as { key: string }).key)?.label ?? "");

type Col = { i: number; letter: string; title: string };

/**
 * Σύνθετα πεδία: ένα πεδίο του προϊόντος φτιάχνεται από κομμάτια — στήλες του αρχείου, τη μάρκα, σταθερό κείμενο —
 * ενωμένα με κενό. Ο χρήστης βλέπει αμέσως το αποτέλεσμα στις πρώτες γραμμές, πριν από κάθε προεπισκόπηση.
 */
export function ComposeBuilder({ compose, onChange, columns, rows, line, suggest }: {
  compose: ComposeField[]; onChange: (c: ComposeField[]) => void; columns: Col[];
  /** οι γραμμές του αρχείου όπως θα εισαχθούν (για το «Αποτέλεσμα») */ rows: ForeignRow[];
  /** τιμή σύνθετου πεδίου για μια γραμμή */ line: (f: ComposeField, row: ForeignRow) => string;
  /** πρώτη πρόταση: όνομα + μάρκα + μοντέλο, από ό,τι υπάρχει */ suggest: () => ComposeField;
}) {
  const set = (k: number, f: ComposeField) => onChange(compose.map((x, j) => (j === k ? f : x)));
  const setParts = (k: number, parts: ComposePart[]) => set(k, { ...compose[k], parts });
  const colOf = new Map(columns.map((c) => [c.i, c]));
  return (
    <section data-help="foreign.compose" aria-labelledby="f-compose" className="grid gap-3 rounded-xl border border-eu-line bg-white p-3 md:p-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5 min-w-0">
          <h3 id="f-compose" className="m-0 flex items-center gap-1.5 font-heading font-semibold text-eu-ink text-[length:var(--fs-16)]"><Link2 className="size-4 text-eu-blue" aria-hidden /> Σύνθετα πεδία</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[70ch]">Φτιάξε ένα πεδίο από πολλές στήλες μαζί και τη μάρκα, π.χ. όνομα «Περιγραφή + Μάρκα + Μοντέλο». Τα κομμάτια ενώνονται με κενό· όσα είναι κενά σε μια γραμμή παραλείπονται. Το σύνθετο πεδίο υπερισχύει της απλής στήλης για το ίδιο πεδίο.</p>
        </div>
        {compose.length > 0 && compose.length < 10 && <button type="button" className={ghost} onClick={() => onChange([...compose, { target: { kind: "field", key: "shortDesc" }, parts: [] }])}><Plus className="size-4" aria-hidden /> Νέο σύνθετο πεδίο</button>}
      </div>

      {compose.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-eu-surface px-3 py-3">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)] min-w-0">Κανένα σύνθετο πεδίο. Τα ονόματα θα έρθουν όπως είναι στη στήλη «Όνομα».</p>
          <button type="button" className={ghost} onClick={() => onChange([suggest()])}><Plus className="size-4" aria-hidden /> Φτιάξε σύνθετο όνομα</button>
        </div>
      )}

      {compose.map((f, k) => {
        const dest = f.target.kind === "spec" ? "spec" : f.target.key;
        const results = rows.slice(0, 3).map((r) => line(f, r));
        const used = new Set(f.parts.flatMap((p) => (p.kind === "col" ? [p.col] : [])));
        const move = (j: number, d: -1 | 1) => { const p = [...f.parts]; [p[j], p[j + d]] = [p[j + d], p[j]]; setParts(k, p); };
        return (
          <div key={k} className="grid gap-2.5 rounded-lg border border-eu-line-2 p-3 min-w-0">
            <div className="flex flex-wrap items-end gap-2 min-w-0">
              <label className="grid gap-1 min-w-0 flex-1 sm:flex-none sm:w-56">
                <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Γράφεται στο</span>
                <select value={dest} className={ctl} onChange={(e) => set(k, { ...f, target: e.target.value === "spec" ? { kind: "spec", label: f.target.kind === "spec" ? f.target.label : "" } : { kind: "field", key: e.target.value as "name" } })}>
                  {DEST.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              {f.target.kind === "spec" && (
                <label className="grid gap-1 min-w-0 flex-1 sm:flex-none sm:w-48">
                  <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Ετικέτα χαρακτηριστικού</span>
                  <input value={f.target.label} maxLength={80} placeholder="Διαστάσεις" onChange={(e) => set(k, { ...f, target: { kind: "spec", label: e.target.value } })} className={`${ctl} ${f.target.label.trim() ? "" : "border-eu-red"}`} />
                </label>
              )}
              <button type="button" className={`${iconBtn} ml-auto`} aria-label={`Διαγραφή σύνθετου πεδίου ${destLabel(f)}`} onClick={() => onChange(compose.filter((_, j) => j !== k))}><Trash2 className="size-4" aria-hidden /></button>
            </div>

            <ol aria-label="Κομμάτια με τη σειρά" className="m-0 p-0 list-none flex flex-wrap items-center gap-1.5 min-w-0">
              {f.parts.map((p, j) => (
                <li key={j} className={`inline-flex items-center gap-0.5 rounded-lg border pl-2 pr-0.5 min-h-11 md:min-h-8 min-w-0 max-w-full ${p.kind === "brand" ? "border-eu-blue/40 bg-eu-chip text-eu-navy" : "border-eu-line-2 bg-eu-surface text-eu-ink"}`}>
                  {p.kind === "col" && <span className="text-[length:var(--fs-13)] min-w-0 truncate"><span className="font-mono text-eu-ink-3">{colOf.get(p.col)?.letter ?? "?"}</span> {colOf.get(p.col)?.title ?? "στήλη που λείπει"}</span>}
                  {p.kind === "brand" && <span className="font-semibold text-[length:var(--fs-13)]">Μάρκα</span>}
                  {p.kind === "text" && <input aria-label="Σταθερό κείμενο" value={p.text} maxLength={80} size={Math.max(2, p.text.length + 1)} onChange={(e) => setParts(k, f.parts.map((x, m) => (m === j ? { kind: "text", text: e.target.value } : x)))} className="bg-white rounded border border-eu-line px-1.5 min-h-8 md:min-h-6 text-[length:var(--fs-13)] max-w-[12rem]" />}
                  <button type="button" className={iconBtn} disabled={j === 0} aria-label="Μετακίνηση αριστερά" onClick={() => move(j, -1)}><ArrowLeft className="size-3.5" aria-hidden /></button>
                  <button type="button" className={iconBtn} disabled={j === f.parts.length - 1} aria-label="Μετακίνηση δεξιά" onClick={() => move(j, 1)}><ArrowRight className="size-3.5" aria-hidden /></button>
                  <button type="button" className={iconBtn} aria-label="Αφαίρεση κομματιού" onClick={() => setParts(k, f.parts.filter((_, m) => m !== j))}><X className="size-3.5" aria-hidden /></button>
                </li>
              ))}
              {!f.parts.length && <li className="text-eu-muted text-[length:var(--fs-13)]">Πρόσθεσε κομμάτια με τα κουμπιά από κάτω.</li>}
            </ol>

            {f.parts.length < 12 && (
              <div className="flex flex-wrap gap-2 min-w-0">
                <select aria-label="Προσθήκη στήλης" value="" className={`${ctl} w-full sm:w-56`} onChange={(e) => { if (e.target.value !== "") setParts(k, [...f.parts, { kind: "col", col: Number(e.target.value) }]); }}>
                  <option value="">+ Στήλη του αρχείου…</option>
                  {columns.map((c) => <option key={c.i} value={c.i} disabled={used.has(c.i)}>{c.letter} · {c.title}</option>)}
                </select>
                <button type="button" className={ghost} onClick={() => setParts(k, [...f.parts, { kind: "brand" }])}><Plus className="size-4" aria-hidden /> Μάρκα</button>
                <button type="button" className={ghost} onClick={() => setParts(k, [...f.parts, { kind: "text", text: "-" }])}><Plus className="size-4" aria-hidden /> Κείμενο</button>
              </div>
            )}

            {f.parts.length > 0 && (
              <div className="grid gap-1 rounded-lg bg-eu-surface px-3 py-2 min-w-0">
                <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Αποτέλεσμα στις πρώτες γραμμές</span>
                <ul className="m-0 p-0 list-none grid gap-0.5">
                  {results.map((v, j) => <li key={j} className="text-[length:var(--fs-13)] [overflow-wrap:anywhere]">{v ? <span className="text-eu-ink">{v}</span> : <span className="text-eu-muted">κενό — η γραμμή κρατά ό,τι δίνει η απλή στήλη</span>}</li>)}
                </ul>
                {f.target.kind === "field" && f.target.key === "name" && results.some((v) => v.length > 64) && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Πάνω από 64 χαρακτήρες: η «Περιγραφή για Web» του SoftOne κόβεται σε ολόκληρη λέξη.</p>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
export type LiveInfo = LiveCard | { error: string } | "loading" | null;

/** Μία γραμμή «πεδίο: τιμή» της κάρτας· κενό = φαίνεται ότι λείπει, όχι απλώς κρύβεται. */
function Field({ label, children, empty }: { label: string; children?: React.ReactNode; empty?: string }) {
  return (
    <div className="grid gap-0.5 min-w-0">
      <dt className="text-eu-ink-3 text-[length:var(--fs-12)]">{label}</dt>
      <dd className="m-0 text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere]">{children ?? <span className="text-eu-muted">{empty ?? "κενό"}</span>}</dd>
    </div>
  );
}

/**
 * «Πώς θα φαίνεται στο eshop»: η πραγματική κάρτα του site για μια γραμμή του αρχείου και από κάτω ό,τι θα γραφτεί —
 * WEBNAME, περιγραφές, τιμή (από τον κανόνα, στον server) και τα χαρακτηριστικά της ομάδας της κατηγορίας, συμπληρωμένα
 * ή κενά. Αλλάζει αμέσως με κάθε επιλογή.
 */
export function LivePreview({ rows, idx, onIdx, brandOf, settings, total, info, mediaFile }: { /** όνομα του δεύτερου αρχείου φωτογραφιών, όταν υπάρχει */ mediaFile?: string; rows: ForeignRow[]; idx: number; onIdx: (i: number) => void; brandOf: (r: ForeignRow) => string; settings: Settings; /** όλες οι γραμμές του φύλλου */ total: number; info: LiveInfo }) {
  const r = rows[idx];
  if (!r) return <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Καμία γραμμή με δεδομένα στις αντιστοιχισμένες στήλες.</p>;
  const title = r.fields.name ?? "";
  const web = title ? webNameOf(title) : "";
  const brand = brandOf(r);
  const live = info && info !== "loading" && !("error" in info) ? info : null;
  const keys = [["Κωδικός", r.fields.code], ["Κωδ. κατασκευαστή", r.fields.factoryCode], ["EAN", r.fields.barcode]].filter((x): x is [string, string] => !!x[1]);
  const fileSpecs = Object.entries(r.specs);
  const filled = live?.group?.specs.filter((s) => s.value).length ?? 0;
  const missing = [!title && "όνομα", !r.media.image.length && (mediaFile ? `φωτογραφία (ούτε στο «${mediaFile}» δεν υπάρχει για αυτόν τον κωδικό / barcode)` : "φωτογραφία"), !brand && "μάρκα"].filter(Boolean) as string[];
  return (
    <div data-help="foreign.live" className="grid gap-3 min-w-0">
      <span className="inline-flex items-center gap-1.5 font-semibold text-eu-ink text-[length:var(--fs-14)]"><Store className="size-4 text-eu-blue" aria-hidden /> Πώς θα φαίνεται στο eshop</span>
      <div className="flex items-center justify-between gap-1 rounded-lg bg-eu-surface px-1">
        <button type="button" className={iconBtn} disabled={idx === 0} aria-label="Προηγούμενη γραμμή" onClick={() => onIdx(idx - 1)}><ChevronLeft className="size-4" aria-hidden /></button>
        <span className="text-eu-ink-2 text-[length:var(--fs-13)] tabular-nums">γραμμή {r.rowNo} · {idx + 1} από {rows.length}{total > rows.length + 1 ? "+" : ""}</span>
        <button type="button" className={iconBtn} disabled={idx >= rows.length - 1} aria-label="Επόμενη γραμμή" onClick={() => onIdx(idx + 1)}><ChevronRight className="size-4" aria-hidden /></button>
      </div>
      <div inert className="@container w-full max-w-[15rem] justify-self-center">
        <SettingsProvider settings={settings}><CartProvider><ProductCard product={asProduct({ key: `live-${r.rowNo}`, title: title || "(χωρίς όνομα)", sku: r.fields.code, brand, images: r.media.image, price: live?.price?.price ?? null })} /></CartProvider></SettingsProvider>
      </div>
      {r.media.image.length > 0 && (
        <div className="grid gap-1 min-w-0">
          <span className="text-eu-ink-3 text-[length:var(--fs-12)]">{r.media.image.length === 1 ? "1 φωτογραφία" : `${r.media.image.length} φωτογραφίες — η πρώτη είναι η κύρια`}</span>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{r.media.image.slice(0, 8).map((u, i) => <li key={u}><ProductImage src={u} alt={`Φωτογραφία ${i + 1}`} sizes="48px" className="w-12" rounded="rounded-md" cutout={false} /></li>)}{r.media.image.length > 8 && <li className="self-center text-eu-muted text-[length:var(--fs-12)]">+{r.media.image.length - 8}</li>}</ul>
        </div>
      )}
      {missing.length > 0 && <p className="m-0 flex gap-1.5 items-start rounded-lg bg-eu-yellow/20 px-2.5 py-1.5 text-eu-ink text-[length:var(--fs-12)]"><CircleAlert className="size-3.5 shrink-0 mt-0.5 text-eu-navy" aria-hidden /><span>Λείπει: {missing.join(", ")}.</span></p>}

      <div className="grid gap-1 rounded-lg border border-eu-line px-3 py-2 min-w-0" aria-live="polite">
        <span className="flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)]"><Tag className="size-3.5" aria-hidden /> Τιμή web</span>
        {info === "loading" && !live ? <span className="inline-flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Υπολογισμός…</span>
          : info && info !== "loading" && "error" in info ? <span className="text-eu-red text-[length:var(--fs-13)]">{info.error}</span>
          : live?.price ? (
            <>
              <span className="font-semibold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{eur.format(live.price.price)}</span>
              <span className="text-eu-ink-3 text-[length:var(--fs-12)]">από κόστος <span className="tabular-nums">{eur.format(live.price.cost)}</span> · {live.price.rule} · περιθώριο <span className="tabular-nums">{eur.format(live.price.margin)}</span>{live.price.capped ? " · κόπηκε στην προτεινόμενη λιανική" : ""}</span>
            </>
          ) : <span className="text-eu-ink-2 text-[length:var(--fs-13)]">{live?.priceNote ?? "Χωρίς τιμή"} Στο eshop θα γράφει «Τιμή στο κατάστημα».</span>}
      </div>

      <dl className="m-0 grid gap-2.5 min-w-0">
        <Field label="Περιγραφή για Web (WEBNAME, έως 64)" empty="κενή — χωρίς όνομα">{web ? <>{web}{web !== title.replace(/\s+/g, " ").trim() && <span className="block text-eu-ink-3 text-[length:var(--fs-12)]">κόπηκε σε ολόκληρη λέξη ({title.length} χαρακτήρες)</span>}</> : undefined}</Field>
        <Field label="Σύντομη περιγραφή">{r.fields.shortDesc ? <span className="line-clamp-4">{r.fields.shortDesc}</span> : undefined}</Field>
        <Field label="Αναλυτική περιγραφή">{r.fields.descText ? <details className="group"><summary className="cursor-pointer list-none"><span className="line-clamp-4 group-open:line-clamp-none whitespace-pre-line">{r.fields.descText}</span><span className="text-eu-blue text-[length:var(--fs-12)] group-open:hidden">Όλο το κείμενο</span></summary></details> : undefined}</Field>
        <Field label="Κατηγορία eshop" empty="καμία ακόμη — ορίζεται στο βήμα «Τιμή & κατηγορία»">{live?.category ?? undefined}</Field>
        {keys.map(([k, v]) => <Field key={k} label={k}>{v}</Field>)}
      </dl>

      <div className="grid gap-1.5 min-w-0">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-[length:var(--fs-13)]">
          <span className="font-semibold text-eu-ink">Χαρακτηριστικά{live?.group ? ` · ${live.group.name}` : ""}</span>
          {live?.group && <span className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{filled} από {live.group.specs.length} συμπληρώνονται</span>}
        </span>
        {live?.group && live.group.specs.length > 0 && <div className="h-1.5 rounded-full bg-eu-surface overflow-hidden" aria-hidden><div className="h-full bg-eu-blue" style={{ width: `${Math.round((filled / live.group.specs.length) * 100)}%` }} /></div>}
        {live?.group ? (
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-12)]">
            {live.group.specs.map((s) => <div key={s.name} className="contents"><dt className="text-eu-ink-3 [overflow-wrap:anywhere]">{s.name}</dt><dd className={`m-0 text-right [overflow-wrap:anywhere] ${s.value ? "text-eu-ink" : "text-eu-muted"}`}>{s.value ?? "κενό"}</dd></div>)}
          </dl>
        ) : fileSpecs.length ? (
          <>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Χωρίς κατηγορία δεν ξέρω την ομάδα χαρακτηριστικών· αυτά έρχονται από το αρχείο:</p>
            <dl className="m-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-12)]">{fileSpecs.map(([k, v]) => <div key={k} className="contents"><dt className="text-eu-ink-3">{k}</dt><dd className="m-0 text-right text-eu-ink [overflow-wrap:anywhere]">{v}</dd></div>)}</dl>
          </>
        ) : <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Καμία στήλη-χαρακτηριστικό και καμία κατηγορία ακόμη.</p>}
        {live && live.extra.length > 0 && <p className="m-0 flex gap-1.5 items-start text-eu-ink-3 text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span>Δεν υπάρχουν στην ομάδα και αγνοούνται: {live.extra.join(", ")}.</span></p>}
      </div>
    </div>
  );
}
