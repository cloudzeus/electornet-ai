"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, CircleAlert, Loader2, Play, Sparkles, Tags } from "lucide-react";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";
import { MAX_VALUES, PRICE_MODES, TARGETS, TARGET_OF, TRANSFORMS, headerLabel, transformValue, type ColDTO, type SuggestDTO } from "@/lib/catalog/xml-import/ui-core";
import type { PriceMode } from "@/lib/catalog/xml-import/transform-core";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const select = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-2 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const input = `${select} px-3`;
const card = "rounded-xl border border-eu-line bg-white min-w-0";

export interface MappingValue {
  targets: Record<string, string>;
  labels: Record<string, string>;
  transforms: Record<string, string>;
  brandMap: Record<string, string | null>;
  categoryMap: Record<string, string | null>;
  priceMode: PriceMode;
  toSoftone: boolean;
}

type SectionKey = "fields" | "cats" | "specs";

/**
 * Μία πτυσσόμενη ενότητα: πλήθη στην κεφαλίδα, ανοιχτή εξ ορισμού μόνο όταν έχει ανεπίλυτα.
 *
 * Το `data-help` έρχεται από το σημείο κλήσης ως κυριολεκτικό κείμενο (`...rest`), όχι φτιαγμένο από το `id`: το
 * `npm run help:gen` σαρώνει τον κώδικα για `data-help="…"` και ένα template literal θα του φαινόταν σημείο που λείπει.
 */
function Fold({ id, title, done, total, todo, open, onToggle, help, children, ...rest }: { id: string; title: string; done: number; total: number; todo: number; open: boolean; onToggle: () => void; help: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={card} aria-labelledby={`xf-${id}`}>
      <h3 id={`xf-${id}`} className="m-0">
        <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex flex-wrap items-center gap-2 px-3 py-2.5 min-h-11 text-left focus-visible:outline-2 focus-visible:outline-eu-blue rounded-xl">
          <ChevronDown className={`size-4 shrink-0 text-eu-muted transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
          <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">{title}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-eu-chip px-2 py-0.5 font-bold text-eu-navy text-[length:var(--fs-12)] tabular-nums">{done} από {total}</span>
            {todo > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/30 px-2 py-0.5 font-bold text-eu-ink text-[length:var(--fs-12)] tabular-nums"><AlertTriangle className="size-3" aria-hidden />{todo} θέλουν έλεγχο</span>}
          </span>
        </button>
      </h3>
      {open && (
        <div className="grid gap-2 border-t border-eu-line p-3 min-w-0">
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{help}</p>
          {children}
        </div>
      )}
    </section>
  );
}

/** «Θέλει έλεγχο» (+ «AI» όταν την πρόταση την έδωσε το AI). Στα σίγουρα δεν μπαίνει τίποτα — αλλιώς το badge γίνεται θόρυβος. */
function Flags({ unsure, why }: { unsure: boolean; why?: string }) {
  if (!unsure) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/30 px-2 py-0.5 font-bold text-eu-ink text-[length:var(--fs-12)]"><AlertTriangle className="size-3" aria-hidden /> θέλει έλεγχο</span>
      {why && <span className="inline-flex items-center gap-1 rounded-full bg-eu-blue/10 px-2 py-0.5 font-bold text-eu-blue text-[length:var(--fs-12)]" title={why}><Sparkles className="size-3" aria-hidden /> AI</span>}
    </span>
  );
}

const samples = (s: string[]) => (s.length ? s.map((v) => (v.length > 40 ? `${v.slice(0, 39)}…` : v)).join(" · ") : "— καμία τιμή σε όλο το feed");

/**
 * Βήμα ③: τι είναι κάθε στήλη, σε ποια κατηγορία μας πάει κάθε κατηγορία του feed, και πώς λέγονται τα χαρακτηριστικά.
 *
 * Τρεις πτυσσόμενες ενότητες με πλήθη στην κεφαλίδα — **ανοιχτές μόνο όσες έχουν ανεπίλυτα**: στο δείγμα οι κανόνες
 * λύνουν 68 από 74 στήλες, άρα ο χρήστης δεν πρέπει να διαβάσει 74 γραμμές για να βρει τις 6. Τα αβέβαια πάνε πρώτα.
 *
 * Δύο πράγματα δεν κρύβονται ποτέ σε κλειστή ενότητα, γιατί **εμποδίζουν** την εισαγωγή: οι συγκρούσεις στηλών (δύο
 * στήλες στον ίδιο στόχο — η μία θα έγραφε πάνω στην άλλη) και οι μάρκες του feed χωρίς δική μας αντιστοίχιση.
 */
export function MappingSections({ suggestion, brands, categories, writeOn, busy, error, onSubmit }: {
  suggestion: SuggestDTO;
  brands: PickOpt[];
  categories: PickOpt[];
  writeOn: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (v: MappingValue) => void;
}) {
  const { cols, cats, specs, duplicates, aiUsed } = suggestion;

  const [targets, setTargets] = useState<Record<string, string>>(() => Object.fromEntries(cols.map((c) => [c.header, c.target])));
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(cols.map((c) => {
    const s = specs.find((x) => x.label === c.label);
    return [c.header, (s?.to ?? "") || c.label];
  })));
  const [transforms, setTransforms] = useState<Record<string, string>>(() => Object.fromEntries(cols.map((c) => [c.header, transformValue(c.transform)])));
  const [brandMap, setBrandMap] = useState<Record<string, string | null>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string | null>>(() => Object.fromEntries(cats.map((c) => [c.value, c.categoryId])));
  const [priceMode, setPriceMode] = useState<PriceMode>("cost");
  const [toSoftone, setToSoftone] = useState(false);

  const byHeader = new Map(cols.map((c) => [c.header, c]));
  const of = (h: string) => targets[h] ?? "ignore";
  const isSpec = (h: string) => of(h) === "spec";
  const unsure = (c: ColDTO) => c.confidence === "unsure";

  // Τα αβέβαια πρώτα, μετά με τη σειρά του feed (οι στήλες είναι η σειρά των tags — έχει νόημα για τον χρήστη).
  const order = (list: ColDTO[]) => list.map((c, i) => ({ c, i })).sort((a, b) => Number(!unsure(a.c)) - Number(!unsure(b.c)) || a.i - b.i).map((x) => x.c);
  const fieldCols = order(cols.filter((c) => !isSpec(c.header)));
  const specCols = order(cols.filter((c) => isSpec(c.header)));

  // ---- κατηγορίες: οι τιμές της στήλης που ο χρήστης όρισε ως «Κατηγορία» ----
  const catHeader = cols.find((c) => of(c.header) === "category")?.header;
  const suggested = new Map(cats.map((c) => [c.value, c]));
  const catValues = catHeader ? (byHeader.get(catHeader)?.values ?? null) : [];
  const catRows = (catValues ?? []).map((value) => ({ value, n: suggested.get(value)?.n ?? 0, unsure: (suggested.get(value)?.confidence ?? "unsure") === "unsure" }))
    .sort((a, b) => Number(!a.unsure) - Number(!b.unsure) || b.n - a.n || a.value.localeCompare(b.value, "el"));

  // ---- μάρκες: φράγμα, όχι ενότητα ----
  const brandHeader = cols.find((c) => of(c.header) === "brand")?.header;
  const brandValues = brandHeader ? (byHeader.get(brandHeader)?.values ?? null) : [];
  const brandRows = (brandValues ?? []).map((value) => value).sort((a, b) => a.localeCompare(b, "el"));
  const brandByName = new Map(brands.map((b) => [b.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("el-GR"), b.id]));
  const brandPick = (v: string) => (v in brandMap ? brandMap[v] : brandByName.get(v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("el-GR")) ?? null);
  const brandMissing = brandRows.filter((v) => !brandPick(v));
  const brandTooMany = !!brandHeader && brandValues === null;

  // ---- φράγματα ----
  const dupNow = (() => {
    const by = new Map<string, string[]>();
    for (const c of cols) {
      const t = of(c.header);
      const key = t === "spec" ? `spec:${(labels[c.header] ?? "").trim().toLocaleLowerCase("el-GR")}` : ["field", "brand", "category", "cost", "rrp"].some((k) => t === k || t.startsWith(`${k}:`)) ? t : null;
      if (!key || (t === "spec" && !(labels[c.header] ?? "").trim())) continue;
      by.set(key, [...(by.get(key) ?? []), c.header]);
    }
    return [...by.entries()].filter(([, hs]) => hs.length > 1).map(([key, headers]) => ({ label: TARGET_OF.get(key)?.label ?? key.replace(/^spec:/, "Χαρακτηριστικό: "), headers }));
  })();
  const specNoLabel = specCols.filter((c) => !(labels[c.header] ?? "").trim()).map((c) => c.header);
  const noSku = !cols.some((c) => of(c.header) === "field:code");

  const blocked = [
    noSku ? "Καμία στήλη δεν είναι το SKU — χωρίς αυτό τα προϊόντα δεν έχουν κλειδί." : null,
    dupNow.length ? `Δύο ή περισσότερες στήλες δείχνουν στον ίδιο στόχο (${dupNow.map((d) => d.label).join(", ")}) — η μία θα έγραφε πάνω στην άλλη.` : null,
    specNoLabel.length ? `${specNoLabel.length} ${specNoLabel.length === 1 ? "χαρακτηριστικό" : "χαρακτηριστικά"} χωρίς ονομασία.` : null,
    brandTooMany ? `Η στήλη μάρκας «${brandHeader}» έχει πάνω από ${MAX_VALUES} διαφορετικές τιμές — δεν είναι μάρκα. Βάλ' την «Αγνόηση» ή «Χαρακτηριστικό».` : null,
    brandMissing.length ? `${brandMissing.length} ${brandMissing.length === 1 ? "μάρκα" : "μάρκες"} του feed δεν έχουν δική μας αντιστοίχιση.` : null,
  ].filter((s): s is string => !!s);

  const [open, setOpen] = useState<Record<SectionKey, boolean>>(() => ({
    fields: cols.some((c) => !isSpec(c.header) && unsure(c)) || !!duplicates.length,
    cats: cats.some((c) => c.confidence === "unsure"),
    specs: specs.some((s) => s.confidence === "unsure"),
  }));
  const toggle = (k: SectionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const submit = () => onSubmit({
    targets, labels, transforms,
    brandMap: Object.fromEntries(brandRows.map((v) => [v, brandPick(v)])),
    categoryMap: Object.fromEntries(catRows.map((r) => [r.value, categoryMap[r.value] ?? null])),
    priceMode, toSoftone,
  });

  const fieldsDone = fieldCols.filter((c) => of(c.header) !== "ignore").length;
  const catsDone = catRows.filter((r) => categoryMap[r.value]).length;
  const specsDone = specCols.filter((c) => (labels[c.header] ?? "").trim()).length;

  return (
    <div className="grid gap-3 min-w-0">
      {aiUsed && (
        <p className="m-0 flex gap-2 items-start text-eu-ink-3 text-[length:var(--fs-13)]">
          <Sparkles className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">Ό,τι δεν έλυσαν οι κανόνες πήγε στο AI — αυτά έχουν σήμανση «AI» και θέλουν το μάτι σου. Τα υπόλοιπα βγήκαν από κανόνες και είναι σίγουρα.</span>
        </p>
      )}

      {dupNow.length > 0 && (
        <div data-help="xml.map.duplicates" role="alert" className="grid gap-1.5 rounded-xl border-2 border-eu-red/40 bg-eu-red/5 p-3 min-w-0">
          <p className="m-0 flex gap-2 items-center font-bold text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0" aria-hidden /> Σύγκρουση στηλών</p>
          <ul className="m-0 pl-5 grid gap-1 text-eu-ink text-[length:var(--fs-13)]">
            {dupNow.map((d) => <li key={d.label}><b>{d.label}</b>: {d.headers.map(headerLabel).join(" και ")} — κράτα μία, βάλε τις άλλες «Αγνόηση».</li>)}
          </ul>
        </div>
      )}

      {(brandRows.length > 0 || brandTooMany) && (
        <div data-help="xml.map.brands" className={`grid gap-2 rounded-xl border-2 p-3 min-w-0 ${brandMissing.length || brandTooMany ? "border-eu-red/40 bg-eu-red/5" : "border-eu-line bg-white"}`}>
          <div className="grid gap-0.5">
            <p className="m-0 flex gap-2 items-center font-bold text-eu-ink text-[length:var(--fs-14)]"><Tags className="size-4 shrink-0 text-eu-blue" aria-hidden /> Μάρκες του feed{brandMissing.length ? ` — ${brandMissing.length} χωρίς αντιστοίχιση` : ""}</p>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Κάθε μάρκα του προμηθευτή πρέπει να δείχνει σε δική μας μάρκα. <b>Μάρκες δεν δημιουργούνται από εδώ</b> — αν λείπει, φτιάξε την πρώτα στις Μάρκες και ξαναγύρνα.</p>
          </div>
          {brandTooMany ? (
            <p className="m-0 text-eu-ink text-[length:var(--fs-13)]">Η στήλη «{brandHeader}» έχει πάρα πολλές διαφορετικές τιμές για μάρκα.</p>
          ) : (
            <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2 min-w-0">
              {brandRows.map((v) => (
                <li key={v} className="grid gap-1 min-w-0">
                  <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)] [overflow-wrap:anywhere]">{v}</span>
                  <OptionPicker options={brands} value={brandPick(v)} onChange={(id) => setBrandMap((m) => ({ ...m, [v]: id }))} label={`Μάρκα για «${v}»`} empty="— χωρίς αντιστοίχιση" disabled={busy} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Fold data-help="xml.map.fields" id="fields" title="Πεδία" done={fieldsDone} total={fieldCols.length} todo={fieldCols.filter((c) => unsure(c)).length} open={open.fields} onToggle={() => toggle("fields")}
        help="Μία γραμμή ανά στήλη του feed, με τρία αληθινά δείγματα τιμών. Δίπλα στα μεγέθη διάλεξε μονάδα, αν ο προμηθευτής στέλνει γραμμάρια ή χιλιοστά.">
        <ul className="m-0 p-0 list-none grid gap-2 min-w-0">
          {fieldCols.map((c) => {
            const t = of(c.header);
            const showUnit = t.startsWith("field:") && ["widthCm", "heightCm", "lengthCm", "weightKg"].some((k) => t.endsWith(k));
            return (
              <li key={c.header} className={`grid gap-1.5 rounded-lg border p-2 min-w-0 ${unsure(c) ? "border-eu-yellow bg-eu-yellow/5" : "border-eu-line"}`}>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{headerLabel(c.header)}</span>
                  <Flags unsure={unsure(c)} why={c.why} />
                </div>
                <p className="m-0 text-eu-muted text-[length:var(--fs-12)] [overflow-wrap:anywhere]">{samples(c.samples)}</p>
                <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] min-w-0">
                  <label className="grid gap-0.5 min-w-0">
                    <span className="sr-only">Στόχος για «{c.header}»</span>
                    <select value={t} disabled={busy} onChange={(e) => setTargets((m) => ({ ...m, [c.header]: e.target.value }))} className={select}>
                      {TARGETS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</optgroup>)}
                    </select>
                  </label>
                  {showUnit && (
                    <label className="grid gap-0.5 min-w-0 sm:w-56">
                      <span className="sr-only">Μονάδα για «{c.header}»</span>
                      <select value={transforms[c.header] ?? "none"} disabled={busy} onChange={(e) => setTransforms((m) => ({ ...m, [c.header]: e.target.value }))} className={select}>
                        {TRANSFORMS.map((tr) => <option key={tr.value} value={tr.value}>{tr.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{c.why && unsure(c) ? `Πρόταση: ${c.why} ` : ""}{TARGET_OF.get(t)?.help ?? ""}</p>
              </li>
            );
          })}
        </ul>
      </Fold>

      <Fold data-help="xml.map.cats" id="cats" title="Κατηγορίες" done={catsDone} total={catRows.length} todo={catRows.length - catsDone} open={open.cats} onToggle={() => toggle("cats")}
        help="Κάθε κατηγορία του feed σε δική μας κατηγορία — δίνει ομάδα χαρακτηριστικών στα νέα είδη και κανόνα τιμής. Χωρίς αντιστοίχιση δεν μπλοκάρει: το προϊόν μπαίνει, απλώς χωρίς κατηγορία.">
        {!catHeader ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Καμία στήλη δεν είναι η κατηγορία. Αν το feed έχει κατηγορίες, διάλεξέ τη στα «Πεδία».</p>
          : catValues === null ? <p className="m-0 text-eu-ink text-[length:var(--fs-13)]">Η στήλη «{catHeader}» έχει πάνω από {MAX_VALUES} διαφορετικές τιμές — δεν είναι κατηγορία.</p>
          : (
            <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2 min-w-0">
              {catRows.map((r) => (
                <li key={r.value} className={`grid gap-1 rounded-lg border p-2 min-w-0 ${r.unsure && !categoryMap[r.value] ? "border-eu-yellow bg-eu-yellow/5" : "border-eu-line"}`}>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)] [overflow-wrap:anywhere]">{r.value}</span>
                    {r.n > 0 && <span className="rounded-full bg-eu-chip px-2 py-0.5 font-bold text-eu-navy text-[length:var(--fs-12)] tabular-nums">{r.n}</span>}
                    <Flags unsure={r.unsure && !categoryMap[r.value]} />
                  </div>
                  <OptionPicker options={categories} value={categoryMap[r.value] ?? null} onChange={(id) => setCategoryMap((m) => ({ ...m, [r.value]: id }))} label={`Κατηγορία για «${r.value}»`} empty="— χωρίς αντιστοίχιση" disabled={busy} />
                </li>
              ))}
            </ul>
          )}
      </Fold>

      <Fold data-help="xml.map.specs" id="specs" title="Χαρακτηριστικά" done={specsDone} total={specCols.length} todo={specCols.filter((c) => unsure(c) || !(labels[c.header] ?? "").trim()).length} open={open.specs} onToggle={() => toggle("specs")}
        help="Η ονομασία με την οποία θα μπει κάθε ετικέτα του feed. Όπου η ετικέτα του προμηθευτή λέγεται αλλιώς στα δικά μας, γράψε τη δική μας — αλλιώς άφησέ τη ως είναι. Το χαρακτηριστικό μπαίνει μόνο αν υπάρχει στην ομάδα του είδους.">
        {!specCols.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Καμία στήλη δεν είναι χαρακτηριστικό.</p> : (
          <ul className="m-0 p-0 list-none grid gap-2 min-w-0">
            {specCols.map((c) => (
              <li key={c.header} className={`grid gap-1.5 rounded-lg border p-2 min-w-0 ${unsure(c) || !(labels[c.header] ?? "").trim() ? "border-eu-yellow bg-eu-yellow/5" : "border-eu-line"}`}>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{c.label || headerLabel(c.header)}</span>
                  <Flags unsure={unsure(c)} why={c.why} />
                </div>
                <p className="m-0 text-eu-muted text-[length:var(--fs-12)] [overflow-wrap:anywhere]">{samples(c.samples)}</p>
                <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] min-w-0">
                  <label className="grid gap-0.5 min-w-0">
                    <span className="sr-only">Δική μας ονομασία για «{c.label || c.header}»</span>
                    <input value={labels[c.header] ?? ""} disabled={busy} onChange={(e) => setLabels((m) => ({ ...m, [c.header]: e.target.value }))} placeholder="Ονομασία χαρακτηριστικού" className={input} />
                  </label>
                  <button type="button" disabled={busy} onClick={() => setTargets((m) => ({ ...m, [c.header]: "ignore" }))}
                    className="inline-flex items-center justify-center rounded-full border-2 border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">Αγνόηση</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <section data-help="xml.map.price" className={`${card} grid gap-2 p-3`} aria-labelledby="xf-price">
        <h3 id="xf-price" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Από πού βγαίνει η τιμή</h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {PRICE_MODES.map((m) => (
            <label key={m.value} className={`grid gap-0.5 rounded-lg border-2 p-2.5 cursor-pointer min-w-0 ${priceMode === m.value ? "border-eu-navy bg-eu-chip/40" : "border-eu-line hover:border-eu-blue"}`}>
              <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)]">
                <input type="radio" name="xml-price-mode" value={m.value} checked={priceMode === m.value} disabled={busy} onChange={() => setPriceMode(m.value)} className="size-4 accent-eu-navy" />{m.label}
              </span>
              <span className="text-eu-muted text-[length:var(--fs-12)] pl-6">{m.help}</span>
            </label>
          ))}
        </div>
      </section>

      <section data-help="xml.map.softone" className={`${card} grid gap-2 p-3`} aria-labelledby="xf-s1">
        <h3 id="xf-s1" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Και στο SoftOne</h3>
        <label className="flex items-start gap-2 cursor-pointer min-h-11 md:min-h-9">
          <input type="checkbox" checked={toSoftone} disabled={busy} onChange={(e) => setToSoftone(e.target.checked)} className="size-4 mt-1 accent-eu-navy" />
          <span className="grid gap-0.5 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Γράψε τα κενά στοιχεία και στο ERP</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">{writeOn ? "Οι αλλαγές προς το SoftOne είναι ανοιχτές: τα κενά πεδία των υπαρχόντων ειδών θα γραφτούν στο ERP. Χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." : "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne): τα στοιχεία μένουν σε αναμονή και τα νέα είδη πάνε για έγκριση. Οι φωτογραφίες ανεβαίνουν κανονικά."}</span>
          </span>
        </label>
      </section>

      {error && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{error}</span></p>}

      {blocked.length > 0 && (
        <div role="alert" className="grid gap-1 rounded-xl border-2 border-eu-red/40 bg-eu-red/5 p-3 min-w-0">
          <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">Πριν προχωρήσεις:</p>
          <ul className="m-0 pl-5 grid gap-0.5 text-eu-ink text-[length:var(--fs-13)]">{blocked.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primary} disabled={busy || blocked.length > 0} onClick={submit}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Φόρτωσε τα προϊόντα
        </button>
        <span className="text-eu-muted text-[length:var(--fs-13)] min-w-0">Η αντιστοίχιση αποθηκεύεται στον προμηθευτή — το επόμενο τρέξιμο δεν θα τη ξαναζητήσει. Τίποτα δεν γράφεται στα προϊόντα σε αυτό το βήμα.</span>
      </div>
    </div>
  );
}
