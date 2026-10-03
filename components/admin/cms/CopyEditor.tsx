"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, CircleAlert, ExternalLink, Info, Loader2, Rocket, RotateCcw, Search, Undo2, X } from "lucide-react";
import { placeholdersOf, type CopyOverrides } from "@/lib/cms/copy";
import { publishCopyAction, revertCopyAction, saveCopyAction, type CopyIssue } from "@/app/admin/(shell)/cms/copy/actions";
import { ResultBanner, StatusPill, inputCls } from "@/components/admin/settings/ui";

export type CopyGroup = { ns: string; label: string; area: string; where: string; href?: string; entries: { key: string; def: string }[] };

const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const count = (o: CopyOverrides) => Object.values(o).reduce((a, x) => a + Object.keys(x).length, 0);
const same = (a: CopyOverrides, b: CopyOverrides) => { const k = (o: CopyOverrides) => Object.entries(o).flatMap(([ns, v]) => Object.entries(v).map(([key, val]) => `${ns}|${key}|${val}`)).sort().join("\n"); return k(a) === k(b); };
type Filter = "all" | "changed" | "unpublished";

/**
 * Κείμενα UI: όλα τα σταθερά κείμενα της βιτρίνας, ομαδοποιημένα ανά σημείο του site. Αναζήτηση σε κείμενο, όνομα ή
 * ομάδα· αλλαγή με αυτόματη αποθήκευση στο πρόχειρο· έλεγχος ότι μένουν τα {placeholders}· επαναφορά στο αρχικό·
 * δημοσίευση όλων μαζί. Αποθηκεύονται μόνο οι αλλαγμένες τιμές.
 */
export function CopyEditor({ groups, draft: initDraft, published: initPub, savedAt: initSaved }: { groups: CopyGroup[]; draft: CopyOverrides; published: CopyOverrides; savedAt: string | null }) {
  const router = useRouter();
  const [ov, setOv] = useState<CopyOverrides>(initDraft);
  const [pub, setPub] = useState<CopyOverrides>(initPub);
  const [q, setQ] = useState("");
  const dq = norm(useDeferredValue(q).trim());
  const [filter, setFilter] = useState<Filter>("all");
  const [area, setArea] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState(initSaved);
  const [issues, setIssues] = useState<CopyIssue[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const latest = useRef(ov);
  const saved = useRef(initDraft);

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

  const setVal = (ns: string, key: string, def: string, v: string) => setOv((o) => {
    const n = { ...o, [ns]: { ...(o[ns] ?? {}) } };
    if (v === def) delete n[ns][key]; else n[ns][key] = v;
    if (!Object.keys(n[ns]).length) delete n[ns];
    return n;
  });
  const pending = !same(ov, pub);
  const issueOf = (ns: string, key: string) => issues.find((i) => i.ns === ns && i.key === key)?.msg;

  /** Λάθη που φαίνονται ήδη στον browser (κενό, λάθος {…}) — μαζί με όσα επέστρεψε ο server. */
  const badCount = useMemo(() => {
    const local = groups.flatMap((g) => g.entries.filter((e) => {
      const v = ov[g.ns]?.[e.key];
      return v !== undefined && (!v.trim() || placeholdersOf(v).join(" ") !== placeholdersOf(e.def).join(" "));
    }).map((e) => `${g.ns}.${e.key}`));
    return new Set([...local, ...issues.map((i) => `${i.ns}.${i.key}`)]).size;
  }, [groups, ov, issues]);
  const anyPh = useMemo(() => groups.some((g) => g.entries.some((e) => placeholdersOf(e.def).length)), [groups]);
  const areas = useMemo(() => [...new Set(groups.map((g) => g.area))], [groups]);
  const view = useMemo(() => groups
    .filter((g) => !area || g.area === area)
    .map((g) => ({ ...g, entries: g.entries.filter((e) => {
      const cur = ov[g.ns]?.[e.key] ?? e.def;
      if (filter === "changed" && !(g.ns in ov && e.key in ov[g.ns])) return false;
      if (filter === "unpublished" && (ov[g.ns]?.[e.key] ?? null) === (pub[g.ns]?.[e.key] ?? null)) return false;
      if (!dq) return true;
      return norm(`${cur} ${e.def} ${e.key} ${g.label} ${g.where}`).includes(dq);
    }) }))
    .filter((g) => g.entries.length), [groups, area, filter, dq, ov, pub]);
  const total = view.reduce((a, g) => a + g.entries.length, 0);
  const expanded = (ns: string) => open.has(ns) || !!dq || filter !== "all";

  const publish = () => {
    if (!window.confirm(`Δημοσίευση ${count(ov)} αλλαγμένων κειμένων; Θα φαίνονται αμέσως στο site.`)) return;
    start(async () => {
      if (save !== "idle" && !(await flush())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
      const r = await publishCopyAction();
      setResult(r);
      if (r.issues) setIssues(r.issues);
      if (r.ok && r.published) { const p = r.published; setPub(p); setOv(p); saved.current = p; latest.current = p; router.refresh(); }
    });
  };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές που δεν δημοσιεύτηκαν;")) return; start(async () => { setResult(await revertCopyAction()); setOv(pub); saved.current = pub; }); };

  return (
    <div className="grid gap-4 min-w-0">
      <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-3 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">Κείμενα UI</h2>
          <StatusPill status={pending ? "incomplete" : count(pub) ? "live" : "off"} text={pending ? "Αλλαγές στο πρόχειρο" : count(pub) ? `${count(pub)} αλλαγμένα κείμενα στο site` : "Όλα στα αρχικά"} />
          <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>{save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}{save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Πρόχειρο ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={publish} disabled={busy || !pending || badCount > 0} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50 flex-1 @md:flex-none">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{!pending ? "Χωρίς αλλαγές για δημοσίευση" : badCount ? "Διόρθωσε πρώτα τα σημειωμένα" : "Δημοσίευση αλλαγών"}</button>
          {pending && <button type="button" onClick={revert} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-12 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών</button>}
          {badCount > 0 && <span className="inline-flex items-center gap-1.5 text-eu-red font-bold text-[length:var(--fs-14)]"><CircleAlert className="size-4" aria-hidden />{badCount} για διόρθωση</span>}
        </div>
        {result && <div className="relative"><ResultBanner ok={result.ok}><span className="block pr-8">{result.message}</span></ResultBanner><button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
      </div>

      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Όλα τα σταθερά κείμενα του site — κουμπιά, ετικέτες, μηνύματα, τίτλοι ενοτήτων — ομαδοποιημένα ανά σημείο. Γράψε π.χ. «καλάθι» για να βρεις κείμενο. Ό,τι αλλάζεις μένει πρόχειρο μέχρι τη δημοσίευση· το αρχικό κείμενο φαίνεται πάντα από κάτω και επιστρέφει με ένα κλικ.</p>
        {anyPh && <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Λέξεις μέσα σε άγκιστρα, όπως <code className="rounded bg-eu-surface px-1">{"{name}"}</code>, αντικαθίστανται αυτόματα (όνομα πελάτη, προϊόν…) — πρέπει να μείνουν στο κείμενο.</span></p>}
        <div className="grid @3xl:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-end">
          <label className="relative block min-w-0">
            <span className="sr-only">Αναζήτηση κειμένου</span>
            <Search className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden />
            <input type="text" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Βρες κείμενο… π.χ. καλάθι, δόσεις, Ερμής" className={`${inputCls} rounded-full pl-11`} />
          </label>
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Σημείο του site" className={`${inputCls} rounded-full`}><option value="">Όλο το site</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <div className="flex flex-wrap gap-1 rounded-full bg-eu-surface p-1" role="radiogroup" aria-label="Φίλτρο">
            {([["all", "Όλα"], ["changed", "Αλλαγμένα"], ["unpublished", "Μη δημοσιευμένα"]] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={filter === v} onClick={() => setFilter(v)} className={`rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] ${filter === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{l}</button>)}
          </div>
        </div>
        <span className="text-eu-muted text-[length:var(--fs-13)]">{total} κείμενα σε {view.length} ομάδες{dq ? ` για «${q}»` : ""}.</span>
      </section>

      {areas.filter((a) => view.some((g) => g.area === a)).map((a) => (
        <section key={a} className="grid gap-2" aria-label={a}>
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{a}</h3>
          {view.filter((g) => g.area === a).map((g) => {
            const isOpen = expanded(g.ns);
            const changed = Object.keys(ov[g.ns] ?? {}).length;
            return (
              <div key={g.ns} className="rounded-2xl bg-white border border-eu-line min-w-0">
                <button type="button" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.ns)) n.delete(g.ns); else n.add(g.ns); return n; })} aria-expanded={isOpen} className="w-full flex items-center gap-3 px-4 min-h-14 text-left">
                  <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink text-[length:var(--fs-16)]">{g.label}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{g.where} · {g.entries.length} κείμενα{changed ? ` · ${changed} αλλαγμένα` : ""}</span></span>
                  <ChevronDown className={`size-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {isOpen && (
                  <div className="border-t border-eu-line p-3 @md:p-4 grid gap-4">
                    {g.href && <a href={g.href} target="_blank" rel="noopener noreferrer" className="justify-self-start inline-flex items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-10 hover:underline">Δες το στο site <ExternalLink className="size-4" aria-hidden /></a>}
                    {g.entries.map((e) => {
                      const cur = ov[g.ns]?.[e.key] ?? e.def;
                      const isChanged = cur !== e.def;
                      const live = (pub[g.ns]?.[e.key] ?? e.def) === cur;
                      const ph = placeholdersOf(e.def);
                      const bad = issueOf(g.ns, e.key) ?? (ph.join(" ") !== placeholdersOf(cur).join(" ") ? `Πρέπει να περιέχει: ${ph.join(" ") || "κανένα {…}"}` : !cur.trim() ? "Κενό κείμενο" : null);
                      const long = e.def.length > 70;
                      return (
                        <div key={e.key} className="grid gap-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {isChanged ? <span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-13)] font-bold ${live ? "bg-eu-green/10 text-eu-green" : "bg-eu-amber/15 text-eu-amber"}`}>{live ? "Αλλαγμένο · στο site" : "Αλλαγμένο · πρόχειρο"}</span> : null}
                            {ph.map((p) => <code key={p} className="rounded bg-eu-chip text-eu-navy px-1.5 text-[length:var(--fs-13)]">{p}</code>)}
                          </div>
                          {long ? (
                            <textarea value={cur} onChange={(ev) => setVal(g.ns, e.key, e.def, ev.target.value)} rows={Math.min(5, Math.ceil(e.def.length / 70) + 1)} aria-label={`${g.label}: ${e.def.slice(0, 40)}`} aria-invalid={!!bad} className={`${inputCls} py-2 leading-relaxed ${bad ? "border-eu-red" : isChanged ? "border-eu-blue" : ""}`} />
                          ) : (
                            <input value={cur} onChange={(ev) => setVal(g.ns, e.key, e.def, ev.target.value)} aria-label={`${g.label}: ${e.def.slice(0, 40)}`} aria-invalid={!!bad} className={`${inputCls} ${bad ? "border-eu-red" : isChanged ? "border-eu-blue" : ""}`} />
                          )}
                          {bad && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{bad}</span>}
                          {isChanged && (
                            <span className="flex flex-wrap items-center gap-2 text-eu-muted text-[length:var(--fs-13)]">
                              <span className="min-w-0">Αρχικό: «{e.def}»</span>
                              <button type="button" onClick={() => setVal(g.ns, e.key, e.def, e.def)} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-2.5 min-h-9 font-bold text-eu-ink-2 hover:border-eu-navy"><RotateCcw className="size-3.5" aria-hidden /> Επαναφορά</button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {!view.length && <p className="m-0 rounded-2xl bg-white border border-eu-line p-6 text-eu-muted">Κανένα κείμενο {dq ? `για «${q}»` : "με αυτό το φίλτρο"}.</p>}
    </div>
  );
}
