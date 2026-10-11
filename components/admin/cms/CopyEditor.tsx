"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, ExternalLink, Info, Loader2, Rocket, RotateCcw, Search, Undo2, X } from "lucide-react";
import { placeholdersOf, type CopyOverrides } from "@/lib/cms/copy";
import { publishCopyAction, revertCopyAction, saveCopyAction, type CopyIssue } from "@/app/admin/(shell)/cms/copy/actions";
import { ResultBanner, StatusPill } from "@/components/admin/settings/ui";

export type CopyGroup = { ns: string; label: string; area: string; where: string; href?: string; entries: { key: string; def: string }[] };

const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const count = (o: CopyOverrides) => Object.values(o).reduce((a, x) => a + Object.keys(x).length, 0);
const same = (a: CopyOverrides, b: CopyOverrides) => { const k = (o: CopyOverrides) => Object.entries(o).flatMap(([ns, v]) => Object.entries(v).map(([key, val]) => `${ns}|${key}|${val}`)).sort().join("\n"); return k(a) === k(b); };
type Filter = "all" | "changed" | "unpublished";
const field = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue focus-visible:ring-2 focus-visible:ring-eu-blue/20";
/** «καλάθι {name}» → το {name} τονισμένο: φαίνεται τι αντικαθίσταται αυτόματα. */
const withTokens = (s: string): ReactNode => s.split(/(\{[^}]+\})/g).map((p, i) => (/^\{[^}]+\}$/.test(p) ? <code key={i} className="rounded bg-eu-chip text-eu-navy px-1 text-[length:var(--fs-12)]">{p}</code> : <Fragment key={i}>{p}</Fragment>));

/**
 * Κείμενα UI (ui-ux-pro-max: master-detail, πυκνός πίνακας, επεξεργασία επί τόπου). Αριστερά οι ομάδες ανά σημείο του
 * site με πλήθη και ένδειξη αλλαγών· δεξιά τα κείμενα της ομάδας σε δύο στήλες: το αρχικό (με τα {…} τονισμένα και το
 * όνομα του κειμένου) και αυτό που βλέπει ο πελάτης, που αλλάζει επί τόπου. Η αναζήτηση ψάχνει σε όλα τα κείμενα.
 * Αυτόματη αποθήκευση στο πρόχειρο, έλεγχος ότι μένουν τα {placeholders}, επαναφορά ανά κείμενο, δημοσίευση όλων μαζί.
 */
export function CopyEditor({ groups, draft: initDraft, published: initPub, savedAt: initSaved, initialGroup }: { groups: CopyGroup[]; draft: CopyOverrides; published: CopyOverrides; savedAt: string | null; initialGroup?: string | null }) {
  const router = useRouter();
  const [ov, setOv] = useState<CopyOverrides>(initDraft);
  const [pub, setPub] = useState<CopyOverrides>(initPub);
  const [q, setQ] = useState("");
  const dq = norm(useDeferredValue(q).trim());
  const [filter, setFilter] = useState<Filter>("all");
  const [nav, setNav] = useState("");
  const [sel, setSel] = useState<string | null>(initialGroup && groups.some((g) => g.ns === initialGroup) ? initialGroup : null);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState(initSaved);
  const [issues, setIssues] = useState<CopyIssue[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const latest = useRef(ov);
  const saved = useRef(initDraft);
  const listRef = useRef<HTMLDivElement>(null);

  // αυτόματη αποθήκευση στο πρόχειρο (1″ μετά την τελευταία αλλαγή)
  const flush = useCallback(async () => {
    setSave("saving");
    const r = await saveCopyAction(latest.current).catch(() => null);
    if (!r?.ok) { setSave("error"); return false; }
    saved.current = latest.current; setIssues(r.issues); setSavedAt(r.at!); setSave("idle");
    return true;
  }, []);
  useEffect(() => {
    latest.current = ov;
    if (same(ov, saved.current)) return;
    const t0 = setTimeout(() => setSave("pending"), 0);
    const t = setTimeout(() => { void flush(); }, 1000);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [ov, flush]);
  useEffect(() => {
    if (save === "idle") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);
  // η ομάδα στη διεύθυνση (?g=) — ο σύνδεσμος ανοίγει την ίδια ομάδα
  useEffect(() => { const u = new URL(location.href); if (sel) u.searchParams.set("g", sel); else u.searchParams.delete("g"); history.replaceState(null, "", u); }, [sel]);

  const setVal = (ns: string, key: string, def: string, v: string) => setOv((o) => {
    const n = { ...o, [ns]: { ...(o[ns] ?? {}) } };
    if (v === def) delete n[ns][key]; else n[ns][key] = v;
    if (!Object.keys(n[ns]).length) delete n[ns];
    return n;
  });
  const pending = !same(ov, pub);
  const issueOf = (ns: string, key: string) => issues.find((i) => i.ns === ns && i.key === key)?.msg;
  const badOf = (g: CopyGroup, e: { key: string; def: string }) => {
    const cur = ov[g.ns]?.[e.key] ?? e.def, ph = placeholdersOf(e.def);
    return issueOf(g.ns, e.key) ?? (ph.join(" ") !== placeholdersOf(cur).join(" ") ? `Πρέπει να περιέχει ακριβώς: ${ph.join(" ") || "κανένα {…}"}` : !cur.trim() ? "Κενό κείμενο: γράψε κάτι ή πάτα επαναφορά." : null);
  };
  const isChanged = (ns: string, key: string) => !!ov[ns] && key in ov[ns];
  const isUnpub = (ns: string, key: string) => (ov[ns]?.[key] ?? null) !== (pub[ns]?.[key] ?? null);

  const badCount = useMemo(() => new Set([
    ...groups.flatMap((g) => g.entries.filter((e) => { const v = ov[g.ns]?.[e.key]; return v !== undefined && (!v.trim() || placeholdersOf(v).join(" ") !== placeholdersOf(e.def).join(" ")); }).map((e) => `${g.ns}.${e.key}`)),
    ...issues.map((i) => `${i.ns}.${i.key}`),
  ]).size, [groups, ov, issues]);
  const counts = useMemo(() => ({ all: groups.reduce((a, g) => a + g.entries.length, 0), changed: count(ov), unpublished: groups.reduce((a, g) => a + g.entries.filter((e) => isUnpub(g.ns, e.key)).length, 0) }), [groups, ov, pub]); // eslint-disable-line react-hooks/exhaustive-deps
  const pass = useCallback((g: CopyGroup, e: { key: string; def: string }) => (filter === "changed" ? isChanged(g.ns, e.key) : filter === "unpublished" ? isUnpub(g.ns, e.key) : true), [filter, ov, pub]); // eslint-disable-line react-hooks/exhaustive-deps

  // αριστερή στήλη: περιοχές → ομάδες (με το φίλτρο της λίστας ομάδων και το φίλτρο κατάστασης)
  const navT = norm(nav.trim());
  const areas = useMemo(() => {
    const out: { area: string; groups: (CopyGroup & { shown: number; changed: number; unpub: number })[] }[] = [];
    for (const g of groups) {
      if (navT && !norm(`${g.label} ${g.where} ${g.area}`).includes(navT)) continue;
      const shown = g.entries.filter((e) => pass(g, e)).length;
      if (!shown) continue;
      const changed = g.entries.filter((e) => isChanged(g.ns, e.key)).length, unpub = g.entries.filter((e) => isUnpub(g.ns, e.key)).length;
      let a = out.find((x) => x.area === g.area); if (!a) { a = { area: g.area, groups: [] }; out.push(a); }
      a.groups.push({ ...g, shown, changed, unpub });
    }
    return out;
  }, [groups, navT, pass]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = sel ? groups.find((g) => g.ns === sel) ?? null : null;

  // δεξιά: αναζήτηση σε όλα ή η επιλεγμένη ομάδα
  const results = useMemo(() => dq ? groups.map((g) => ({ g, entries: g.entries.filter((e) => pass(g, e) && norm(`${ov[g.ns]?.[e.key] ?? e.def} ${e.def} ${e.key} ${g.label}`).includes(dq)) })).filter((x) => x.entries.length) : [], [dq, groups, ov, pass]);
  const resultCount = results.reduce((a, x) => a + x.entries.length, 0);

  const publish = () => {
    if (!window.confirm(`Δημοσίευση ${count(ov)} αλλαγμένων κειμένων; Θα φαίνονται αμέσως στο site.`)) return;
    start(async () => {
      if (save !== "idle" && !(await flush())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε. Δοκίμασε ξανά." }); return; }
      const r = await publishCopyAction();
      setResult(r);
      if (r.issues) setIssues(r.issues);
      if (r.ok && r.published) { const p = r.published; setPub(p); setOv(p); saved.current = p; latest.current = p; router.refresh(); }
    });
  };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές που δεν δημοσιεύτηκαν;")) return; start(async () => { setResult(await revertCopyAction()); setOv(pub); saved.current = pub; }); };
  /** Enter: πήγαινε στο επόμενο κείμενο (στα μεγάλα κείμενα: Ctrl/⌘ + Enter). */
  const next = (el: HTMLElement) => { const all = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-copy-input]") ?? [])]; all[all.indexOf(el) + 1]?.focus(); };

  const row = (g: CopyGroup, e: { key: string; def: string }) => {
    const cur = ov[g.ns]?.[e.key] ?? e.def;
    const changed = cur !== e.def, unpub = isUnpub(g.ns, e.key), bad = badOf(g, e);
    const long = e.def.length > 48 || cur.length > 48; // ό,τι δεν χωράει σε μία γραμμή γίνεται πολυγραμμικό, για να φαίνεται ολόκληρο
    const common = {
      value: cur, "data-copy-input": "", "aria-label": `${g.label}: ${e.def.slice(0, 50)}`, "aria-invalid": !!bad,
      onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVal(g.ns, e.key, e.def, ev.target.value),
      className: `${field} ${bad ? "border-eu-red bg-eu-red/5" : changed ? "border-eu-blue/50 bg-eu-blue/[0.04]" : ""}`,
    };
    return (
      <li key={`${g.ns}.${e.key}`} className={`grid gap-x-3 gap-y-1 px-3 py-1.5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6.5rem] items-start ${changed ? "border-l-2 border-l-eu-blue" : "border-l-2 border-l-transparent"}`}>
        <div className="grid gap-0.5 min-w-0 @3xl:pt-1.5">
          <span title={`Κλειδί: ${g.ns}.${e.key}`} className="text-eu-ink-2 text-[length:var(--fs-13)] leading-snug break-words">{withTokens(e.def)}</span>
        </div>
        <div className="grid gap-1 min-w-0">
          {long
            ? <textarea {...common} rows={Math.min(6, Math.ceil(Math.max(e.def.length, cur.length) / 55))} onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); next(ev.currentTarget); } }} className={`${common.className} py-1.5 leading-relaxed resize-y`} />
            : <input {...common} type="text" enterKeyHint="next" onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); next(ev.currentTarget); } }} />}
          {bad && <span role="alert" className="inline-flex items-start gap-1 text-eu-red font-semibold text-[length:var(--fs-12)]"><CircleAlert className="size-3.5 mt-px shrink-0" aria-hidden />{bad}</span>}
        </div>
        <div className="flex @3xl:flex-col @3xl:items-end items-center gap-1.5 @3xl:pt-1.5">
          {changed ? <>
            <span className={`rounded-full px-2 py-px font-bold text-[length:var(--fs-12)] ${unpub ? "bg-eu-amber/15 text-eu-ink-2" : "bg-eu-green/12 text-eu-green"}`}>{unpub ? "Πρόχειρο" : "Στο site"}</span>
            <button type="button" onClick={() => setVal(g.ns, e.key, e.def, e.def)} aria-label={`Επαναφορά στο αρχικό: ${e.def.slice(0, 40)}`} className="inline-flex items-center gap-1 rounded-full px-2 min-h-11 md:min-h-7 font-bold text-eu-ink-3 text-[length:var(--fs-12)] hover:bg-eu-surface hover:text-eu-navy"><RotateCcw className="size-3.5" aria-hidden /> Αρχικό</button>
          </> : unpub ? <span className="rounded-full px-2 py-px font-bold text-[length:var(--fs-12)] bg-eu-amber/15 text-eu-ink-2" title="Στο site είναι ακόμη αλλαγμένο· θα επιστρέψει στο αρχικό με τη δημοσίευση">Επαναφορά · πρόχειρο</span> : null}
        </div>
      </li>
    );
  };

  const tableHead = <div className="hidden @3xl:grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6.5rem] gap-x-3 px-3 py-1.5 bg-eu-surface/70 border-b border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-12)]"><span>Αρχικό κείμενο</span><span>Στο site</span><span className="text-right">Κατάσταση</span></div>;

  return (
    <div className="@container grid gap-3 min-w-0">
      {/* λεπτή σταθερή κεφαλίδα: κατάσταση, αποθήκευση, δημοσίευση */}
      <div data-help="copy.header" className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2 bg-eu-surface/95 backdrop-blur border-b border-eu-line flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Κείμενα UI</h2>
        <StatusPill status={pending ? "incomplete" : count(pub) ? "live" : "off"} text={pending ? `${counts.unpublished} ${counts.unpublished === 1 ? "αλλαγή" : "αλλαγές"} στο πρόχειρο` : count(pub) ? `${count(pub)} ${count(pub) === 1 ? "αλλαγμένο" : "αλλαγμένα"} στο site` : "Όλα στα αρχικά"} />
        <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-12)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>{save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}{save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Πρόχειρο ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {badCount > 0 && <span className="inline-flex items-center gap-1 text-eu-red font-bold text-[length:var(--fs-13)]"><CircleAlert className="size-4" aria-hidden />{badCount} για διόρθωση</span>}
          {pending && <button type="button" onClick={revert} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><Undo2 className="size-4" aria-hidden /> Ακύρωση</button>}
          <button type="button" onClick={publish} disabled={busy || !pending || badCount > 0} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-4 min-h-11 md:min-h-9 hover:bg-eu-blue disabled:opacity-45">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{badCount ? "Διόρθωσε πρώτα" : pending ? `Δημοσίευση (${counts.unpublished})` : "Δημοσίευση"}</button>
        </div>
        {result && <div className="basis-full relative"><ResultBanner ok={result.ok}><span className="block pr-8">{result.message}</span></ResultBanner><button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
      </div>

      {/* αναζήτηση σε όλα + φίλτρο κατάστασης */}
      <div data-help="copy.search" className="grid gap-2 @2xl:flex @2xl:items-center">
        <label className="relative flex-1 min-w-0"><span className="sr-only">Αναζήτηση σε όλα τα κείμενα</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted pointer-events-none" aria-hidden /><input type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Αναζήτηση σε ${counts.all} κείμενα, π.χ. καλάθι, δόσεις, Ερμής`} className={`${field} pl-9 rounded-full`} /></label>
        <div role="radiogroup" aria-label="Ποια κείμενα" className="inline-flex rounded-full bg-white border border-eu-line p-0.5 shrink-0">
          {([["all", "Όλα", counts.all], ["changed", "Αλλαγμένα", counts.changed], ["unpublished", "Μη δημοσιευμένα", counts.unpublished]] as const).map(([v, l, n]) => <button key={v} type="button" role="radio" aria-checked={filter === v} onClick={() => setFilter(v)} className={`rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] ${filter === v ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:text-eu-navy"}`}>{l} <span className="tabular-nums opacity-70">{n}</span></button>)}
        </div>
      </div>
      <p className="m-0 inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)]"><Info className="size-3.5 mt-px shrink-0 text-eu-blue" aria-hidden /><span>Ό,τι γράφεις αποθηκεύεται στο πρόχειρο και φαίνεται στο site μετά τη «Δημοσίευση». Τα <code className="rounded bg-eu-chip text-eu-navy px-1">{"{…}"}</code> αντικαθίστανται αυτόματα (όνομα, προϊόν) και πρέπει να μείνουν. Enter: επόμενο κείμενο.</span></p>

      <div className="grid gap-3 @4xl:grid-cols-[17rem_minmax(0,1fr)] items-start">
        {/* ομάδες */}
        <aside data-help="copy.groups" aria-label="Ομάδες κειμένων" className={`${sel || dq ? "hidden @4xl:grid" : "grid"} grid-rows-[auto_minmax(0,1fr)] rounded-xl border border-eu-line bg-white overflow-hidden @4xl:sticky @4xl:top-16 @4xl:h-[calc(100dvh-10rem)]`}>
          <div className="p-2 border-b border-eu-line"><label className="relative block"><span className="sr-only">Φίλτρο ομάδων</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input type="search" value={nav} onChange={(e) => setNav(e.target.value)} placeholder={`${groups.length} ομάδες`} className={`${field} pl-8`} /></label></div>
          <nav className="overflow-y-auto overscroll-contain">
            {areas.length ? areas.map((a) => (
              <section key={a.area} aria-label={a.area}>
                <h3 className="sticky top-0 z-[1] m-0 bg-eu-surface/95 backdrop-blur px-3 py-1 font-bold text-eu-ink-3 text-[length:var(--fs-12)]">{a.area}</h3>
                <ul className="m-0 p-1 list-none grid">
                  {a.groups.map((g) => { const on = g.ns === sel && !dq; return (
                    <li key={g.ns}><button type="button" onClick={() => { setSel(g.ns); setQ(""); listRef.current?.scrollIntoView({ block: "start" }); }} aria-current={on ? "true" : undefined} className={`w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2.5 min-h-11 text-left ${on ? "bg-eu-navy text-white" : "hover:bg-eu-surface"}`}>
                      <span className="grid min-w-0"><span className={`truncate font-semibold text-[length:var(--fs-13)] ${on ? "" : "text-eu-ink"}`}>{g.label}</span>{g.changed > 0 && <span className={`text-[length:var(--fs-12)] ${on ? "text-white/80" : g.unpub ? "text-eu-amber font-semibold" : "text-eu-green font-semibold"}`}>{g.changed} αλλαγμένα{g.unpub ? " · πρόχειρο" : ""}</span>}</span>
                      <span className={`tabular-nums text-[length:var(--fs-12)] ${on ? "text-white/80" : "text-eu-muted"}`}>{filter === "all" ? g.entries.length : g.shown}</span>
                    </button></li>
                  ); })}
                </ul>
              </section>
            )) : <p className="m-0 p-4 text-eu-muted text-[length:var(--fs-13)]">Καμία ομάδα.</p>}
          </nav>
        </aside>

        {/* κείμενα */}
        <div ref={listRef} data-help="copy.table" className={`${!sel && !dq ? "hidden @4xl:grid" : "grid"} gap-2 min-w-0 scroll-mt-20`}>
          {dq ? (
            <section aria-label="Αποτελέσματα αναζήτησης" className="rounded-xl border border-eu-line bg-white overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-eu-line"><b className="text-eu-ink text-[length:var(--fs-14)]">{resultCount} {resultCount === 1 ? "κείμενο" : "κείμενα"} για «{q}»</b><button type="button" onClick={() => setQ("")} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-8 font-bold text-eu-ink-3 text-[length:var(--fs-12)] hover:bg-eu-surface"><X className="size-3.5" aria-hidden /> Καθαρισμός</button></div>
              {tableHead}
              {results.length ? results.map(({ g, entries }) => (
                <div key={g.ns}>
                  <h4 className="m-0 px-3 pt-2 pb-1 font-bold text-eu-navy text-[length:var(--fs-12)]">{g.area} › {g.label}</h4>
                  <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">{entries.map((e) => row(g, e))}</ul>
                </div>
              )) : <p className="m-0 p-6 text-center text-eu-muted text-[length:var(--fs-13)]">Κανένα κείμενο για «{q}». Δοκίμασε άλλη λέξη ή το φίλτρο «Όλα».</p>}
            </section>
          ) : current ? (
            <section aria-labelledby="cg-h" className="rounded-xl border border-eu-line bg-white overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 border-b border-eu-line">
                <div className="grid min-w-0">
                  <button type="button" onClick={() => setSel(null)} className="@4xl:hidden justify-self-start inline-flex items-center gap-1 min-h-11 font-bold text-eu-blue text-[length:var(--fs-13)]"><ArrowLeft className="size-4" aria-hidden /> Όλες οι ομάδες</button>
                  <span className="text-eu-muted text-[length:var(--fs-12)]">{current.area}</span>
                  <h3 id="cg-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight">{current.label}</h3>
                  <span className="text-eu-ink-3 text-[length:var(--fs-12)]">{current.where} · {current.entries.length} κείμενα</span>
                </div>
                {current.href && <a href={current.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy">Δες το στο site <ExternalLink className="size-3.5" aria-hidden /></a>}
              </div>
              {tableHead}
              {(() => { const list = current.entries.filter((e) => pass(current, e)); return list.length
                ? <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">{list.map((e) => row(current, e))}</ul>
                : <p className="m-0 p-6 text-center text-eu-muted text-[length:var(--fs-13)]">Κανένα κείμενο με αυτό το φίλτρο σε αυτή την ομάδα.</p>; })()}
            </section>
          ) : (
            <div className="grid place-items-center gap-1 rounded-xl border border-dashed border-eu-line bg-white p-10 text-center">
              <p className="m-0 font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Διάλεξε ομάδα ή ψάξε ένα κείμενο</p>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{counts.all} κείμενα σε {groups.length} ομάδες.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
