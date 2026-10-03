"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PlugZap, Loader2, X } from "lucide-react";
import { SECTIONS, type Field, type Values } from "@/lib/settings/schema";
import { saveSection, testSection, type ActionResult } from "@/app/admin/(shell)/settings/actions";
import { SoftoneObjsPicker } from "./SoftoneObjsPicker";
import { TextField, SecretField, ToggleField, SelectField, TextAreaField, FieldGroup, SaveBar, ResultBanner, Details } from "./settings/ui";

/**
 * Μία ενότητα ρυθμίσεων από το schema: κάρτες ανά ομάδα, ορατή εξήγηση σε κάθε πεδίο, έλεγχος μορφής καθώς γράφεις,
 * πεδία που εμφανίζονται μόνο όταν αφορούν την επιλογή σου, σταθερή μπάρα αποθήκευσης και προειδοποίηση πριν φύγεις
 * με μη αποθηκευμένες αλλαγές. Τα secrets δεν επιστρέφουν ποτέ στον browser.
 */
export function SettingsForm({ sectionKey, data, secretSet }: { sectionKey: string; data: Values; secretSet: Record<string, boolean> }) {
  const section = SECTIONS.find((s) => s.key === sectionKey)!;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [vals, setVals] = useState<Values>(() => initialValues(section.fields, data));
  const [stored, setStored] = useState(secretSet);
  const [typed, setTyped] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ver, setVer] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  // «έχει αλλαγές» = η φόρμα διαφέρει από την τελευταία αποθηκευμένη εικόνα της
  const snapshot = useRef("");
  const serialize = () => (formRef.current ? JSON.stringify([...new FormData(formRef.current).entries()].filter(([, v]) => typeof v === "string").sort()) : "");
  const recompute = useCallback(() => setTimeout(() => setDirty(serialize() !== snapshot.current), 0), []);
  useEffect(() => { snapshot.current = serialize(); }, [ver]); // νέα εικόνα μετά από κάθε αποθήκευση
  // από την αναζήτηση των ρυθμίσεων (#f-<πεδίο>): κύλιση στο πεδίο, επισήμανση και focus
  useEffect(() => {
    if (!location.hash.startsWith("#f-")) return;
    const key = decodeURIComponent(location.hash.slice(3));
    const def = section.fields.find((f) => f.key === key);
    let el = document.getElementById(`f-${key}`);
    if (!el && def) {
      // κρυφό πεδίο (εξαρτάται από άλλη επιλογή): δείξε την ομάδα του και πες πώς εμφανίζεται
      el = document.getElementById(`g-${def.group && section.groups?.some((g) => g.key === def.group) ? def.group : section.groups?.[0]?.key ?? "_"}`);
      const t0 = setTimeout(() => setResult({ ok: true, message: `Το «${def.label}» εμφανίζεται μόλις ενεργοποιήσεις ή διαλέξεις τη σχετική επιλογή στην επισημασμένη ομάδα.` }), 0);
      if (!el) return () => clearTimeout(t0);
    }
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("ring-4", "ring-eu-yellow/70");
    el.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea")?.focus({ preventScroll: true });
    const t = setTimeout(() => el.classList.remove("ring-4", "ring-eu-yellow/70"), 2500);
    return () => clearTimeout(t);
  }, [section]);

  const set = (k: string, v: string | boolean) => { setVals((p) => ({ ...p, [k]: v })); setErrors((e) => (e[k] ? { ...e, [k]: "" } : e)); recompute(); };
  const visible = (f: Field) => !f.showIf || f.showIf(vals);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errs: Record<string, string> = {};
    for (const f of section.fields) {
      if (!f.required || !visible(f) || f.type === "softone-objs") continue;
      const empty = f.type === "secret" ? !stored[f.key] && !typed[f.key] : String(vals[f.key] ?? "").trim() === "";
      if (empty) errs[f.key] = "Υποχρεωτικό πεδίο";
    }
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      setResult({ ok: false, message: `Συμπλήρωσε τα υποχρεωτικά: ${Object.keys(errs).map((k) => section.fields.find((f) => f.key === k)?.label).join(", ")}.` });
      document.getElementById(`f-${first}`)?.querySelector<HTMLElement>("input,select,textarea")?.focus();
      return;
    }
    start(async () => {
      const r = await saveSection(section.key, fd);
      setResult(r);
      if (!r.ok) return;
      const next = { ...stored };
      for (const f of section.fields) if (f.type === "secret") { if (fd.get(`${f.key}__clear`) === "on") next[f.key] = false; else if (String(fd.get(f.key) ?? "")) next[f.key] = true; }
      setStored(next);
      setTyped({});
      setVer((v) => v + 1);
      setDirty(false);
      router.refresh();
    });
  };

  const groups = section.groups?.length ? section.groups : [{ key: "_", title: "Ρυθμίσεις" }];
  const groupOf = (f: Field) => (section.groups?.some((g) => g.key === f.group) ? f.group! : groups[0].key);
  const visibleGroups = groups.filter((g) => section.fields.some((f) => groupOf(f) === g.key && visible(f)));

  return (
    <form ref={formRef} onSubmit={submit} onChange={recompute} onInput={recompute} noValidate className="grid gap-4 min-w-0">
      <header className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-3">
        <div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{section.title}</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">{section.description}</p>
          {section.testHelp && <p className="m-0 mt-2 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)] max-w-[75ch]"><PlugZap className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span><b>Δοκιμή σύνδεσης</b> (κάτω, δίπλα στην αποθήκευση): {section.testHelp}</span></p>}
        </div>
        {visibleGroups.length > 2 && (
          <nav aria-label="Σε αυτή τη σελίδα" className="flex flex-wrap gap-2">
            {visibleGroups.map((g) => <a key={g.key} href={`#g-${g.key}`} className="inline-flex items-center rounded-full bg-eu-surface px-3 min-h-10 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:bg-eu-chip hover:text-eu-blue">{g.title}</a>)}
          </nav>
        )}
      </header>

      {groups.map((g) => {
        const fields = section.fields.filter((f) => groupOf(f) === g.key);
        const shown = fields.filter(visible);
        return (
          <div key={g.key} className={shown.length ? "contents" : "hidden"}>
            {/* κρυφά πεδία: η τιμή τους μένει όπως είναι */}
            {fields.filter((f) => !visible(f) && f.type !== "secret" && f.type !== "softone-objs").map((f) => (f.type === "toggle" ? (vals[f.key] === true ? <input key={f.key} type="hidden" name={f.key} value="on" /> : null) : <input key={f.key} type="hidden" name={f.key} value={String(vals[f.key] ?? "")} />))}
            {shown.length > 0 && (
              <FieldGroup id={`g-${g.key}`} title={g.title} help={g.help}>
                {shown.map((f) => (
                  <div key={f.key} id={`f-${f.key}`} className={`min-w-0 scroll-mt-24 rounded-xl ring-offset-4 transition-shadow ${f.width === "half" ? "" : "@2xl:col-span-2"}`}>
                    <FieldInput f={f} value={vals[f.key]} set={(v) => set(f.key, v)} stored={!!stored[f.key]} ver={ver} error={errors[f.key]} data={data} onSecret={(v) => { setTyped((t) => ({ ...t, [f.key]: !!v })); setErrors((e) => (e[f.key] ? { ...e, [f.key]: "" } : e)); }} onDirty={recompute} />
                  </div>
                ))}
              </FieldGroup>
            )}
          </div>
        );
      })}

      <SaveBar
        dirty={dirty}
        pending={pending}
        top={result && (
          <div className="max-h-[40vh] overflow-y-auto relative">
            <ResultBanner ok={result.ok}>
              <span className="pr-8 block">{result.message}</span>
              <Details details={result.details} />
            </ResultBanner>
            <button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο μηνύματος" className="absolute top-1 right-1 size-10 inline-flex items-center justify-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button>
          </div>
        )}
        extra={section.test && (
          <span className="inline-flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={testing}
              onClick={() => { const fd = new FormData(formRef.current!); startTest(async () => setResult(await testSection(section.key, fd))); }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-navy hover:text-white disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />} {testing ? "Δοκιμή…" : "Δοκιμή σύνδεσης"}
            </button>
          </span>
        )}
      />
    </form>
  );
}

function initialValues(fields: Field[], data: Values): Values {
  const v: Values = { ...data };
  for (const f of fields) {
    if (f.type === "toggle") v[f.key] = data[f.key] === true;
    else if (f.type === "select") v[f.key] = String(data[f.key] ?? f.options?.[0]?.value ?? "");
    else if (f.type !== "secret" && f.type !== "softone-objs") v[f.key] = data[f.key] === undefined ? "" : String(data[f.key]);
  }
  return v;
}

function FieldInput({ f, value, set, stored, ver, error, data, onSecret, onDirty }: { f: Field; value: Values[string] | undefined; set: (v: string | boolean) => void; stored: boolean; ver: number; error?: string; data: Values; onSecret: (v: string) => void; onDirty: () => void }) {
  const help = error ? <span className="text-eu-red font-bold">{error}{f.help ? ` — ${f.help}` : ""}</span> : f.help;
  switch (f.type) {
    case "toggle":
      return <ToggleField name={f.key} label={f.label} help={f.help} checked={value === true} onChange={set} />;
    case "secret":
      return <SecretField key={`${f.key}-${ver}`} name={f.key} label={f.label} help={help} stored={stored} rule={f.rule} required={f.required} onChange={onSecret} onDirty={onDirty} />;
    case "select":
      return <SelectField name={f.key} label={f.label} help={f.help} value={String(value ?? "")} onChange={set} options={f.options ?? []} required={f.required} />;
    case "textarea":
      return <TextAreaField name={f.key} label={f.label} help={f.help} value={String(value ?? "")} onChange={set} placeholder={f.placeholder} />;
    case "softone-objs":
      return (
        <div className="grid gap-1">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{f.label}</span>
          <SoftoneObjsPicker stored={{ company: String(data.company ?? ""), branch: String(data.branch ?? ""), module: String(data.module ?? ""), refid: String(data.refid ?? "") }} />
          {f.help && <span className="text-eu-muted text-[length:var(--fs-13)]">{f.help}</span>}
        </div>
      );
    default:
      return (
        <TextField
          name={f.key}
          label={f.label}
          help={f.help}
          value={String(value ?? "")}
          onChange={set}
          placeholder={f.placeholder}
          rule={f.rule}
          required={f.required}
          type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
          inputMode={f.type === "email" ? "email" : f.type === "url" ? "url" : undefined}
          mono={f.type === "url"}
          min={f.min}
          max={f.max}
          step={f.step}
          unit={f.unit}
          error={error}
        />
      );
  }
}
