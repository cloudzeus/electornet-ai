"use client";

import { useState, useTransition } from "react";
import { Wand2, Loader2, Check, TriangleAlert, Moon, Sun, Globe } from "lucide-react";
import type { BrandTheme } from "@/lib/cms/brand-store";
import { contrast } from "@/lib/cms/brand-store-check";
import { paletteAction, scrapeStyleAction } from "@/app/admin/(shell)/cms/brand-stores/actions";
import type { StyleSuggestion } from "@/lib/cms/brand-style";
import { inputCls, ResultBanner } from "@/components/admin/settings/ui";

const HEX = /^#([0-9a-f]{3}){1,2}$/i;
const FIELDS: { k: keyof Omit<BrandTheme, "mode">; label: string; help: string }[] = [
  { k: "accent", label: "Χρώμα μάρκας", help: "Κουμπιά, η τελευταία γραμμή του τίτλου, μικροί τίτλοι ενοτήτων." },
  { k: "accentInk", label: "Κείμενο πάνω στο χρώμα μάρκας", help: "Τα γράμματα των κουμπιών — συνήθως λευκό ή μαύρο." },
  { k: "bg", label: "Φόντο σελίδας", help: "Το βασικό φόντο όλης της σελίδας." },
  { k: "bg2", label: "Φόντο καρτών", help: "Κάρτες προϊόντων, τεχνολογία — λίγο διαφορετικό από το φόντο." },
  { k: "ink", label: "Κύριο κείμενο", help: "Τίτλοι και κείμενα." },
  { k: "muted", label: "Δευτερεύον κείμενο", help: "Περιγραφές, μικρές σημειώσεις." },
];

function Ratio({ a, b, min }: { a: string; b: string; min: number }) {
  const r = contrast(a, b);
  if (r === null) return null;
  const ok = r >= min;
  return <span className={`inline-flex items-center gap-1 font-bold text-[length:var(--fs-13)] ${ok ? "text-eu-green" : "text-eu-amber"}`}>{ok ? <Check className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}αντίθεση {r.toFixed(1)}:1{ok ? "" : ` (θέλει ≥ ${min})`}</span>;
}

/** Μικρό δείγμα της σελίδας με τα χρώματα — για να κρίνεις πριν εφαρμόσεις. */
export function MiniPreview({ t, name }: { t: BrandTheme; name: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-eu-line" style={{ background: t.bg, color: t.ink }} aria-hidden>
      <div className="p-3 grid gap-1.5">
        <span className="font-heading font-extrabold text-[length:var(--fs-16)]">{name}</span>
        <span className="font-heading font-extrabold leading-tight text-[length:var(--fs-18)]">Νέα σειρά<br /><span style={{ color: t.accent }}>για το σπίτι σου.</span></span>
        <span className="text-[length:var(--fs-13)]" style={{ color: t.muted }}>Εγγύηση, service αντιπροσωπείας, δόσεις.</span>
        <span className="flex gap-2 mt-1">
          <span className="rounded-full px-3 py-1.5 font-extrabold text-[length:var(--fs-13)]" style={{ background: t.accent, color: t.accentInk }}>Δες τα προϊόντα</span>
          <span className="rounded-lg px-3 py-1.5 text-[length:var(--fs-13)]" style={{ background: t.bg2 }}>Κάρτα</span>
        </span>
      </div>
    </div>
  );
}

export function StylePanel({ theme, onTheme, website, onWebsite, name }: { theme: BrandTheme; onTheme: (t: BrandTheme) => void; website: string; onWebsite: (v: string) => void; name: string }) {
  const [busy, start] = useTransition();
  const [sug, setSug] = useState<StyleSuggestion | null>(null);
  const [proposal, setProposal] = useState<BrandTheme | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const scrape = () => start(async () => {
    setErr(null); setApplied(false);
    const r = await scrapeStyleAction(website);
    if (!r.ok) { setErr(r.message); setSug(null); return; }
    setSug(r.s); setProposal(r.s.theme);
  });
  const pickAccent = (hex: string, mode = proposal?.mode ?? "light") => start(async () => setProposal(await paletteAction(hex, mode)));

  return (
    <div className="grid gap-5">
      {/* 1. από το επίσημο site */}
      <div className="rounded-xl border-2 border-eu-blue/30 bg-eu-chip/40 p-3 @md:p-4 grid gap-3">
        <div className="flex items-start gap-2"><Wand2 className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden /><div><div className="font-bold text-eu-ink text-[length:var(--fs-15)]">Στυλ από το επίσημο site</div><p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">Διαβάζουμε την αρχική σελίδα της μάρκας και τα CSS της και προτείνουμε παλέτα με ελεγμένη αναγνωσιμότητα. Παίρνουμε μόνο χρώματα — καμία εικόνα ή κείμενο. Τίποτα δεν αλλάζει πριν πατήσεις «Εφαρμογή».</p></div></div>
        <div className="grid @md:grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="relative block min-w-0">
            <span className="sr-only">Επίσημο site της μάρκας</span>
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
            <input value={website} onChange={(e) => onWebsite(e.target.value)} inputMode="url" placeholder="https://www.lg.com/gr" className={`${inputCls} pl-9 font-mono text-[length:var(--fs-15)]`} />
          </label>
          <button type="button" onClick={scrape} disabled={busy || !website.trim()} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-blue disabled:opacity-40">{busy && !sug ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />} Πάρε το στυλ</button>
        </div>
        <span className="text-eu-muted text-[length:var(--fs-13)] -mt-1">Προτίμησε την ελληνική σελίδα της μάρκας (π.χ. …/gr). Αποθηκεύεται μαζί με τη σελίδα.</span>
        {err && <ResultBanner ok={false}>{err} Μπορείς να γράψεις το χρώμα της μάρκας και παρακάτω.</ResultBanner>}
        {sug && proposal && (
          <div className="grid gap-3 rounded-xl bg-white border border-eu-line p-3">
            <div className="text-[length:var(--fs-14)] text-eu-ink-2"><b>{sug.siteName ?? new URL(sug.url).hostname}</b>{sug.fonts.length > 0 && <> · γραμματοσειρές του site: {sug.fonts.join(", ")} <span className="text-eu-muted">(μένουμε στις γραμματοσειρές της Euronics — οι δικές τους θέλουν άδεια)</span></>}</div>
            {sug.notes.map((n) => <p key={n} className="m-0 text-eu-muted text-[length:var(--fs-13)]">{n}</p>)}
            <div className="grid gap-1.5">
              <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">Χρώματα που βρέθηκαν — πάτα ένα για να γίνει χρώμα μάρκας</span>
              <div className="flex flex-wrap gap-2">
                {sug.swatches.map((s) => (
                  <button key={s.hex} type="button" onClick={() => pickAccent(s.hex)} aria-pressed={proposal.accent.toLowerCase() === s.hex} title={s.hex} className={`size-11 rounded-xl border-2 ${proposal.accent.toLowerCase() === s.hex ? "border-eu-navy ring-2 ring-eu-navy/30" : "border-eu-line"}`} style={{ background: s.hex }}><span className="sr-only">{s.hex}</span></button>
                ))}
              </div>
            </div>
            <div className="grid @xl:grid-cols-2 gap-3 items-start">
              <MiniPreview t={proposal} name={name} />
              <div className="grid gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["light", "dark"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => pickAccent(proposal.accent, m)} aria-pressed={proposal.mode === m} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 min-h-10 font-bold text-[length:var(--fs-14)] ${proposal.mode === m ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>{m === "light" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}{m === "light" ? "Ανοιχτό" : "Σκούρο"}</button>
                  ))}
                </div>
                <Ratio a={proposal.ink} b={proposal.bg} min={4.5} />
                <Ratio a={proposal.accentInk} b={proposal.accent} min={4.5} />
                <button type="button" onClick={() => { onTheme(proposal); setApplied(true); }} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-green text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11">{applied ? <Check className="size-4" aria-hidden /> : null}{applied ? "Εφαρμόστηκε" : "Εφαρμογή στη σελίδα"}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. χειροκίνητα */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">Τα χρώματα της σελίδας</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Τόνος σελίδας">
            {(["light", "dark"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={theme.mode === m} onClick={() => onTheme({ ...theme, mode: m })} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 min-h-10 font-bold text-[length:var(--fs-14)] ${theme.mode === m ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>{m === "light" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}{m === "light" ? "Ανοιχτή" : "Σκούρα"}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-4">
          {FIELDS.map((f) => {
            const v = theme[f.k];
            const bad = !HEX.test(v);
            return (
              <label key={f.k} className="grid gap-1 min-w-0">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{f.label}</span>
                <span className="flex gap-2 items-center">
                  <input type="color" value={bad ? "#000000" : v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v} onChange={(e) => onTheme({ ...theme, [f.k]: e.target.value })} aria-label={`${f.label} — επιλογή`} className="shrink-0 size-12 rounded-xl border-2 border-eu-line cursor-pointer bg-white p-1" />
                  <input value={v} onChange={(e) => onTheme({ ...theme, [f.k]: e.target.value.trim() })} spellCheck={false} aria-invalid={bad} className={`${inputCls} font-mono uppercase ${bad ? "border-eu-red" : ""}`} />
                </span>
                <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{f.help}</span>
                {f.k === "ink" && <Ratio a={theme.ink} b={theme.bg} min={4.5} />}
                {f.k === "muted" && <Ratio a={theme.muted} b={theme.bg} min={3} />}
                {f.k === "accentInk" && <Ratio a={theme.accentInk} b={theme.accent} min={4.5} />}
                {bad && <span className="text-eu-red font-bold text-[length:var(--fs-13)]">Γράψε το χρώμα ως #RRGGBB</span>}
              </label>
            );
          })}
        </div>
        <div className="max-w-md"><MiniPreview t={theme} name={name} /></div>
      </div>
    </div>
  );
}
