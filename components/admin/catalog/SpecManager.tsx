"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Database, Filter, Layers, ListChecks, Loader2, Lock, MoreHorizontal, Pencil, Plus, Search, Store, Tags } from "lucide-react";
import { changeSpecAction, setSpecOverrideAction } from "@/app/admin/(shell)/catalog/actions";
import type { SpecGroupDetail, SpecTree } from "@/lib/catalog/spec-admin";
import type { SpecChange } from "@/lib/softone/spec-write";
import { Dialog, useToast } from "./QuickActions";

type Spec = SpecGroupDetail["specs"][number];
type Can = { local: boolean; softone: boolean; softoneReason: string | null };
const n = (v: number) => v.toLocaleString("el-GR");
const input = "w-full rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const SPECIAL: Record<string, string> = { brand: "φίλτρο μάρκας", price: "φίλτρο τιμής", energy: "ενεργειακή κλάση" };

/** Διακόπτης (role=switch) πυκνός στον υπολογιστή, με περιοχή αφής 44px στο κινητό. */
function Switch({ on, label, disabled, onClick, busy }: { on: boolean; label: string; disabled?: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled || busy} onClick={onClick} className="group/sw relative inline-grid place-items-center min-h-11 min-w-11 md:min-h-7 md:min-w-9 disabled:cursor-not-allowed">
      <span className={`relative h-[18px] w-8 rounded-full transition-colors ${on ? "bg-eu-navy" : "bg-eu-line-2"} ${disabled ? "opacity-55" : "group-hover/sw:ring-2 group-hover/sw:ring-eu-blue/25"}`}>
        <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-transform ${on ? "translate-x-[16px]" : "translate-x-[2px]"}`} />
        <span className="sr-only">{on ? "ναι" : "όχι"}</span>
      </span>
      {busy && <Loader2 className="absolute size-3.5 animate-spin text-eu-blue" aria-hidden />}
    </button>
  );
}

/**
 * «Χαρακτηριστικά»: αριστερά οι κατηγορίες web του SoftOne με τους τύπους προϊόντων (ομάδες χαρακτηριστικών), δεξιά τα
 * χαρακτηριστικά του επιλεγμένου τύπου σε δύο στρώσεις: SoftOne (ισχύει παντού, και στο παλιό site, πάντα με επιβεβαίωση
 * και επαλήθευση) και «μόνο e-shop» (όνομα φίλτρου, φίλτρο ναι/όχι, σειρά — χωρίς να αγγίζει το SoftOne).
 */
export function SpecManager({ tree, group, can }: { tree: SpecTree; group: SpecGroupDetail | null; can: Can }) {
  const [q, setQ] = useState("");
  const { setToast, bar } = useToast();
  return (
    <div className="@container grid gap-2.5 min-w-0">
      <div className="grid gap-2.5 @4xl:grid-cols-[17rem_minmax(0,1fr)] items-start">
        <aside data-help="specs.tree" className={`${group ? "hidden @4xl:grid" : "grid"} gap-1.5 rounded-xl border border-eu-line bg-white p-2 min-w-0 @4xl:sticky @4xl:top-2 @4xl:max-h-[calc(100dvh-6rem)] @4xl:overflow-y-auto`}>
          <label className="relative"><span className="sr-only">Αναζήτηση τύπου</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Τύπος προϊόντος" className={`${input} pl-8`} /></label>
          <Tree tree={tree} q={q} selected={group?.id ?? null} />
        </aside>
        {group ? <Detail key={group.id} g={group} can={can} onToast={setToast} /> : (
          <div className="hidden @4xl:grid place-items-center rounded-xl border border-dashed border-eu-line bg-white p-8 text-center text-eu-muted text-[length:var(--fs-13)]">Διάλεξε τύπο προϊόντος από αριστερά.</div>
        )}
      </div>
      {bar}
    </div>
  );
}

function Tree({ tree, q, selected }: { tree: SpecTree; q: string; selected: number | null }) {
  const t = q.trim().toLocaleLowerCase("el");
  const list = useMemo(() => tree.map((m) => ({ ...m, mains: m.mains.map((x) => ({ ...x, groups: x.groups.filter((g) => !t || `${g.name} ${g.code ?? ""} ${x.name} ${m.name}`.toLocaleLowerCase("el").includes(t)) })).filter((x) => x.groups.length) })).filter((m) => m.mains.length), [tree, t]);
  if (!list.length) return <p className="m-0 px-1 text-eu-muted text-[length:var(--fs-13)]">Κανένας τύπος.</p>;
  return (
    <nav aria-label="Τύποι προϊόντων" className="grid gap-0.5 text-[length:var(--fs-13)]">
      {list.map((m) => {
        const hasSel = m.mains.some((x) => x.groups.some((g) => g.id === selected));
        return (
          <details key={m.id} open={!!t || hasSel} className="group/m">
            <summary className="list-none cursor-pointer flex items-center gap-1.5 rounded-md px-1.5 min-h-11 md:min-h-8 font-bold text-eu-ink hover:bg-eu-surface [&::-webkit-details-marker]:hidden"><ChevronRight className="size-3.5 text-eu-muted transition-transform group-open/m:rotate-90" aria-hidden /><span className="truncate flex-1">{m.name}</span><span className="text-eu-muted font-normal tabular-nums">{m.mains.reduce((a, x) => a + x.groups.length, 0)}</span></summary>
            <div className="grid gap-0.5 pl-3">
              {m.mains.map((x) => (
                <div key={x.id} className="grid">
                  <span className="px-1.5 pt-1 text-eu-muted font-semibold text-[length:var(--fs-12)] truncate">{x.name}</span>
                  {x.groups.map((g) => (
                    <Link key={g.id} href={`?g=${g.id}`} scroll={false} aria-current={g.id === selected ? "page" : undefined}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-1.5 min-h-11 md:min-h-8 ${g.id === selected ? "bg-eu-navy text-white" : "hover:bg-eu-surface text-eu-ink-2"} ${g.active ? "" : "opacity-60"}`}>
                      <span className="truncate">{g.name}{g.changed ? <span className={`ml-1 ${g.id === selected ? "text-white" : "text-eu-purple"}`} title="έχει αλλαγές μόνο e-shop">•</span> : null}</span>
                      <span className={`tabular-nums text-[length:var(--fs-12)] ${g.id === selected ? "text-white/80" : "text-eu-muted"}`} title={`${g.specs} χαρακτηριστικά, ${g.filters} φίλτρα, ${g.items} είδη`}>{g.filters}/{g.specs}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

type Pending = { title: string; lines: ReactNode[]; change: SpecChange; danger?: boolean } | null;

function Detail({ g, can, onToast }: { g: SpecGroupDetail; can: Can; onToast: (t: { ok: boolean; text: string } | null) => void }) {
  const router = useRouter();
  const [showOff, setShowOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [dlg, setDlg] = useState<{ kind: "add" | "rename" | "options" | "local"; spec?: Spec } | null>(null);
  const [, start] = useTransition();
  const specs = g.specs.filter((s) => showOff || s.active);
  const off = g.specs.filter((s) => !s.active).length;

  const runSoftone = (change: SpecChange, key: string) => {
    setBusy(key); setConfirm(null); setDlg(null);
    start(async () => {
      const r = await changeSpecAction(g.id, change);
      setBusy(null);
      onToast(r.ok ? { ok: true, text: "Αποθηκεύτηκε στο SoftOne και επαληθεύτηκε. Τα φίλτρα του e-shop ενημερώθηκαν." } : { ok: false, text: [r.error, ...("details" in r && r.details ? r.details : [])].join(" ") });
      router.refresh();
    });
  };
  const runLocal = (s: Spec, next: { label?: string | null; filter?: boolean | null; sort?: number | null }) => {
    setBusy(`l${s.code}`); setDlg(null);
    start(async () => {
      await setSpecOverrideAction(g.id, s.code, next);
      setBusy(null);
      onToast({ ok: true, text: "Αποθηκεύτηκε μόνο για το e-shop. Τα φίλτρα ενημερώθηκαν." });
      router.refresh();
    });
  };
  const flag = (s: Spec, field: "isFilter" | "isView" | "active") => {
    const now = s[field], label = { isFilter: "Φίλτρο", isView: "Προβολή", active: "Ενεργό" }[field];
    const lines: ReactNode[] = [<>«{s.name}»: <b>{label} {now ? "Ναι → Όχι" : "Όχι → Ναι"}</b></>];
    if (field === "isFilter") lines.push(now ? <>Το φίλτρο φεύγει από τον τύπο στο παλιό site{s.override?.filter == null ? " και στο e-shop" : ""}{s.facet ? `, σήμερα το έχουν ${n(s.facet.products)} προϊόντα` : ""}.</> : <>Νέο φίλτρο στον τύπο. Τιμή παίρνουν όσα προϊόντα έχουν γραμμή «{s.name} : …» στην περιγραφή (σήμερα {n(s.descLines)}).</>);
    if (field === "active") lines.push(now ? <>Δεν θα εμφανίζεται ούτε ως φίλτρο ούτε στην προβολή. Ο κωδικός {s.code} μένει (δεν διαγράφεται) και ενεργοποιείται ξανά όποτε θέλεις.</> : <>Ξαναγίνεται ενεργό με τις ρυθμίσεις φίλτρου/προβολής που έχει.</>);
    if (field === "isView") lines.push(<>Αφορά την προβολή στο παλιό site. Το νέο e-shop δείχνει τα χαρακτηριστικά από την περιγραφή του είδους.</>);
    setConfirm({ title: `${label} στο SoftOne`, lines, danger: now && field !== "isView", change: { kind: "set-spec", code: s.code, patch: { [field]: !now } } });
  };

  return (
    <section data-help="specs.detail" aria-labelledby="sg-h" className="grid gap-2.5 min-w-0">
      <header className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
        <Link href="?" scroll={false} className="@4xl:hidden justify-self-start inline-flex items-center gap-1 min-h-11 font-bold text-eu-blue text-[length:var(--fs-13)]"><ArrowLeft className="size-4" aria-hidden /> Όλοι οι τύποι</Link>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="grid min-w-0">
            <span className="text-eu-muted text-[length:var(--fs-12)]">{g.path}</span>
            <h2 id="sg-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">{g.name}</h2>
            <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[length:var(--fs-12)] text-eu-ink-3">
              <span>ομάδα <b className="font-mono">{g.code ?? g.id}</b> (id {g.id})</span>
              <span>{n(g.items)} είδη SoftOne</span>
              <span>{n(g.products)} προϊόντα στο site</span>
              {!g.active && <span className="font-bold text-eu-amber">ανενεργή ομάδα</span>}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.shopHref && <a href={g.shopHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy"><Store className="size-4" aria-hidden /> Στο κατάστημα</a>}
            <button type="button" disabled={!can.softone} title={can.softoneReason ?? undefined} onClick={() => setDlg({ kind: "add" })} className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-45"><Plus className="size-4" aria-hidden /> Νέο χαρακτηριστικό</button>
          </div>
        </div>
        <div data-help="specs.layers" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-eu-line-2 pt-2 text-[length:var(--fs-12)]">
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 rounded-full bg-eu-navy/10 text-eu-navy font-bold px-2 py-0.5"><Database className="size-3" aria-hidden />SoftOne</span><span className="text-eu-ink-3">ισχύει παντού, και στο παλιό site</span></span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 rounded-full bg-eu-purple/12 text-eu-purple font-bold px-2 py-0.5"><Store className="size-3" aria-hidden />Μόνο e-shop</span><span className="text-eu-ink-3">δεν αγγίζει το SoftOne</span></span>
          {!can.softone && <span className="inline-flex items-center gap-1 text-eu-amber font-semibold"><Lock className="size-3.5" aria-hidden />{can.softoneReason}</span>}
          {off > 0 && <label className="ml-auto inline-flex items-center gap-1.5 min-h-11 md:min-h-7 font-semibold text-eu-ink-2 cursor-pointer"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} className="size-4 accent-eu-navy" />Ανενεργά ({off})</label>}
        </div>
      </header>

      <div data-help="specs.table" className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="hidden @3xl:grid grid-cols-[2.25rem_minmax(0,1fr)_repeat(3,3rem)_auto_5.5rem_2.25rem] items-end gap-x-2 px-2.5 py-1.5 bg-eu-surface/70 text-eu-ink-3 font-bold text-[length:var(--fs-12)]">
          <span>Κωδ.</span><span>Χαρακτηριστικό</span>
          <span className="text-center text-eu-navy" title="SoftOne: φίλτρο">Φίλτρο</span><span className="text-center text-eu-navy" title="SoftOne: προβάλλεται">Προβολή</span><span className="text-center text-eu-navy" title="SoftOne: ενεργό">Ενεργό</span>
          <span className="text-eu-purple">Φίλτρο e-shop</span><span className="text-right" title="προϊόντα με τιμή στο φίλτρο / διαφορετικές τιμές">Προϊόντα</span><span />
        </div>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {specs.map((s) => (
            <li key={s.code} className={`grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[2.25rem_minmax(0,1fr)_repeat(3,3rem)_auto_5.5rem_2.25rem] items-center gap-x-2 gap-y-1 px-2.5 py-1 ${s.active ? "" : "bg-eu-surface/50 text-eu-ink-3"}`}>
              <span className="hidden @3xl:block font-mono text-eu-muted text-[length:var(--fs-12)] tabular-nums">{s.code}</span>
              <span className="min-w-0 grid">
                <span className="flex items-baseline gap-1.5 min-w-0"><span className="@3xl:hidden font-mono text-eu-muted text-[length:var(--fs-12)]">{s.code}</span><b className="line-clamp-2 text-eu-ink text-[length:var(--fs-13)] leading-snug" title={s.name}>{s.name}</b></span>
                {(s.special || !s.active || s.override?.label || s.override?.sort != null || s.options.length > 0) && (
                  <span className="flex flex-wrap gap-x-2 text-[length:var(--fs-12)]">
                    {s.special && <span className="text-eu-ink-3">{SPECIAL[s.special]}</span>}
                    {!s.active && <span className="text-eu-amber font-bold">ανενεργό</span>}
                    {s.override?.label && <span className="text-eu-purple">στο e-shop: «{s.override.label}»</span>}
                    {s.override?.sort != null && <span className="text-eu-purple">σειρά {s.override.sort}</span>}
                    {s.options.length > 0 && <span className="text-eu-muted">{s.options.filter((o) => o.active).length} προκαθορισμένες τιμές</span>}
                  </span>
                )}
              </span>
              <span className="row-start-2 col-span-2 @3xl:row-start-auto @3xl:col-span-1 @3xl:contents flex flex-wrap items-center gap-x-1 text-[length:var(--fs-12)]">
                <span className="@3xl:hidden text-eu-navy font-bold">SoftOne</span>
                <span className="inline-flex items-center @3xl:justify-center"><span className="@3xl:hidden text-eu-ink-3">Φίλτρο</span><Switch on={s.isFilter} label={`SoftOne φίλτρο: ${s.name}`} disabled={!can.softone || !!s.special} busy={busy === `s${s.code}isFilter`} onClick={() => flag(s, "isFilter")} /></span>
                <span className="inline-flex items-center @3xl:justify-center"><span className="@3xl:hidden text-eu-ink-3">Προβολή</span><Switch on={s.isView} label={`SoftOne προβολή: ${s.name}`} disabled={!can.softone} busy={busy === `s${s.code}isView`} onClick={() => flag(s, "isView")} /></span>
                <span className="inline-flex items-center @3xl:justify-center"><span className="@3xl:hidden text-eu-ink-3">Ενεργό</span><Switch on={s.active} label={`SoftOne ενεργό: ${s.name}`} disabled={!can.softone} busy={busy === `s${s.code}active`} onClick={() => flag(s, "active")} /></span>
                <span className="@3xl:hidden basis-full h-0" />
                <span className="@3xl:hidden text-eu-purple font-bold">e-shop</span>
                <LocalFilter s={s} disabled={!can.local || !s.active || !!s.special} busy={busy === `l${s.code}`} onSet={(filter) => runLocal(s, { filter })} />
                <span className="ml-auto @3xl:ml-0 text-right tabular-nums text-eu-ink-2" title={s.facet ? `${s.facet.products} προϊόντα με τιμή στο φίλτρο, ${s.facet.values} διαφορετικές τιμές · ${s.descLines} γραμμές περιγραφής με το ίδιο όνομα` : `${s.descLines} γραμμές περιγραφής με το ίδιο όνομα`}>{s.facet ? <><b>{n(s.facet.products)}</b><span className="text-eu-muted"> /{n(s.facet.values)}</span></> : <span className="text-eu-muted">{s.descLines ? `${n(s.descLines)} περιγρ.` : "-"}</span>}</span>
              </span>
              <span className="row-start-1 col-start-2 @3xl:row-start-auto @3xl:col-start-auto justify-self-end"><RowMenu s={s} can={can} onPick={(kind) => setDlg({ kind, spec: s })} onToggleActive={() => flag(s, "active")} /></span>
            </li>
          ))}
          {!specs.length && <li className="p-6 text-center text-eu-muted text-[length:var(--fs-13)]">Κανένα χαρακτηριστικό σε αυτόν τον τύπο.</li>}
        </ul>
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Τα χαρακτηριστικά παίρνουν τιμή ανά προϊόν από τις γραμμές «Όνομα : τιμή» της περιγραφής του είδους. Γι’ αυτό η μετονομασία στο SoftOne θέλει προσοχή: οι περιγραφές κρατούν το παλιό όνομα. Ο σύνδεσμος του φίλτρου στο site μένει ίδιος.</p>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} sub={`${g.name} · SoftOne`} icon={<Database className="size-4 text-eu-navy" aria-hidden />}>
        {confirm && <>
          <ul className="m-0 pl-4 grid gap-1 text-eu-ink-2 text-[length:var(--fs-13)]">{confirm.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p className="m-0 rounded-lg bg-eu-surface px-2.5 py-1.5 text-eu-ink-3 text-[length:var(--fs-12)]">Γράφεται στο SoftOne (παραγωγή): διαβάζεται όλη η ομάδα, στέλνεται ολόκληρη και επαληθεύεται ότι δεν χάθηκε καμία γραμμή. Ισχύει και στο παλιό site.</p>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setConfirm(null)} className="rounded-full border border-eu-line px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]">Άκυρο</button><button type="button" onClick={() => runSoftone(confirm.change, confirm.change.kind === "set-spec" ? `s${confirm.change.code}${Object.keys(confirm.change.patch)[0]}` : "x")} className={`rounded-full px-4 min-h-11 md:min-h-9 font-bold text-white text-[length:var(--fs-13)] ${confirm.danger ? "bg-eu-red hover:opacity-90" : "bg-eu-navy hover:bg-eu-blue"}`}>Ναι, αλλαγή στο SoftOne</button></div>
        </>}
      </Dialog>
      <Dialog open={dlg?.kind === "add"} onClose={() => setDlg(null)} title="Νέο χαρακτηριστικό" sub={`${g.name} · SoftOne`} icon={<Plus className="size-4 text-eu-navy" aria-hidden />}>
        <AddSpec existing={g.specs.map((s) => s.name)} onSave={(name, isFilter, isView) => runSoftone({ kind: "add-spec", name, isFilter, isView }, "add")} busy={busy === "add"} />
      </Dialog>
      <Dialog open={dlg?.kind === "rename"} onClose={() => setDlg(null)} title="Μετονομασία στο SoftOne" sub={dlg?.spec?.name} icon={<Pencil className="size-4 text-eu-navy" aria-hidden />}>
        {dlg?.spec && <Rename s={dlg.spec} onSave={(name) => runSoftone({ kind: "set-spec", code: dlg.spec!.code, patch: { name } }, `s${dlg.spec!.code}name`)} />}
      </Dialog>
      <Dialog open={dlg?.kind === "options"} onClose={() => setDlg(null)} title="Προκαθορισμένες τιμές" sub={dlg?.spec?.name} icon={<Tags className="size-4 text-eu-navy" aria-hidden />}>
        {dlg?.spec && <Options s={dlg.spec} canWrite={can.softone} onChange={(change) => runSoftone(change, "opt")} />}
      </Dialog>
      <Dialog open={dlg?.kind === "local"} onClose={() => setDlg(null)} title="Ρυθμίσεις μόνο για το e-shop" sub={dlg?.spec?.name} icon={<Store className="size-4 text-eu-purple" aria-hidden />}>
        {dlg?.spec && <LocalSettings s={dlg.spec} onSave={(next) => runLocal(dlg.spec!, next)} />}
      </Dialog>
    </section>
  );
}

/** Φίλτρο στο e-shop: όπως το SoftOne / πάντα / ποτέ. */
function LocalFilter({ s, disabled, busy, onSet }: { s: Spec; disabled: boolean; busy: boolean; onSet: (v: boolean | null) => void }) {
  const cur = s.override?.filter ?? null;
  const opts: [boolean | null, string, string][] = [[null, "Όπως S1", `όπως το SoftOne (${s.isFilter ? "ναι" : "όχι"})`], [true, "Ναι", "πάντα φίλτρο στο e-shop"], [false, "Όχι", "ποτέ φίλτρο στο e-shop"]];
  return (
    <span role="radiogroup" aria-label={`Φίλτρο στο e-shop: ${s.name}`} className={`inline-flex rounded-md bg-eu-surface p-0.5 font-bold text-[length:var(--fs-12)] ${disabled ? "opacity-45" : ""}`}>
      {opts.map(([v, l, t]) => <button key={String(v)} type="button" role="radio" aria-checked={cur === v} title={t} disabled={disabled || busy} onClick={() => cur !== v && onSet(v)} className={`rounded px-1.5 min-h-11 md:min-h-6 whitespace-nowrap ${cur === v ? (v === null ? "bg-white text-eu-ink-2 shadow-sm" : "bg-eu-purple text-white") : "text-eu-ink-3 hover:text-eu-purple"}`}>{l}</button>)}
    </span>
  );
}

function RowMenu({ s, can, onPick, onToggleActive }: { s: Spec; can: Can; onPick: (k: "rename" | "options" | "local") => void; onToggleActive: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    const out = (e: Event) => { if (e instanceof KeyboardEvent) { if (e.key === "Escape") { close(); btn.current?.focus(); } return; } if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", out); window.addEventListener("scroll", close, true);
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", out); window.removeEventListener("scroll", close, true); };
  }, [pos]);
  const item = "w-full flex items-center gap-2.5 rounded-md px-2 min-h-11 md:min-h-8 text-left text-[length:var(--fs-13)] hover:bg-eu-surface focus-visible:bg-eu-surface outline-none disabled:opacity-40";
  const head = "px-2 pt-1.5 pb-0.5 font-bold text-[length:var(--fs-12)]";
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!pos} aria-label={`Ενέργειες: ${s.name}`} onClick={() => { if (pos) return close(); const b = btn.current!.getBoundingClientRect(); setPos({ top: b.bottom + 4, right: window.innerWidth - b.right }); }} className={`size-11 md:size-8 grid place-items-center rounded-full ${pos ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy"}`}><MoreHorizontal className="size-4" aria-hidden /></button>
      {pos && createPortal(
        <div ref={menu} role="menu" aria-label={`Ενέργειες: ${s.name}`} onKeyDown={(e) => { if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return; e.preventDefault(); const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])]; const i = items.indexOf(document.activeElement as HTMLElement); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }}
          className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-eu-line bg-white p-1 shadow-[var(--shadow-raised)] grid" style={{ top: Math.min(pos.top, window.innerHeight - 260), right: Math.max(8, pos.right) }}>
          <span className={`${head} text-eu-purple`}>Μόνο e-shop</span>
          <button type="button" role="menuitem" disabled={!can.local || !s.active} onClick={() => { close(); onPick("local"); }} className={item}><Store className="size-4 text-eu-purple" aria-hidden />Όνομα φίλτρου & σειρά…</button>
          <div className="border-t border-eu-line-2 my-1" />
          <span className={`${head} text-eu-navy`}>SoftOne (και παλιό site)</span>
          <button type="button" role="menuitem" disabled={!can.softone} onClick={() => { close(); onPick("rename"); }} className={item}><Pencil className="size-4 text-eu-navy" aria-hidden />Μετονομασία…</button>
          <button type="button" role="menuitem" onClick={() => { close(); onPick("options"); }} className={item}><ListChecks className="size-4 text-eu-navy" aria-hidden />Προκαθορισμένες τιμές{s.options.length ? ` (${s.options.length})` : ""}…</button>
          <button type="button" role="menuitem" disabled={!can.softone} onClick={() => { close(); onToggleActive(); }} className={item}><Layers className="size-4 text-eu-navy" aria-hidden />{s.active ? "Απενεργοποίηση (δεν διαγράφεται)" : "Ενεργοποίηση"}</button>
          {s.facet && <><div className="border-t border-eu-line-2 my-1" /><span className="px-2 py-1 text-eu-muted text-[length:var(--fs-12)]">Σύνδεσμος φίλτρου: <span className="font-mono">?f_{s.facet.param}</span></span></>}
        </div>,
        document.body,
      )}
    </>
  );
}

function AddSpec({ existing, onSave, busy }: { existing: string[]; onSave: (name: string, isFilter: boolean, isView: boolean) => void; busy: boolean }) {
  const [name, setName] = useState(""), [isFilter, setFilter] = useState(true), [isView, setView] = useState(true);
  const dup = existing.some((e) => e.trim().toLocaleLowerCase("el") === name.trim().toLocaleLowerCase("el"));
  return (
    <form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !dup) onSave(name.trim(), isFilter, isView); }}>
      <label className="grid gap-0.5"><span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Όνομα (όπως θα γράφεται και στις περιγραφές «Όνομα : τιμή»)</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input} />{dup && <span role="alert" className="text-eu-red text-[length:var(--fs-12)]">Υπάρχει ήδη χαρακτηριστικό με αυτό το όνομα.</span>}</label>
      <div className="flex flex-wrap gap-x-4">
        <label className="inline-flex items-center gap-2 min-h-11 md:min-h-8 text-[length:var(--fs-13)] font-semibold"><input type="checkbox" checked={isFilter} onChange={(e) => setFilter(e.target.checked)} className="size-4 accent-eu-navy" />Φίλτρο</label>
        <label className="inline-flex items-center gap-2 min-h-11 md:min-h-8 text-[length:var(--fs-13)] font-semibold"><input type="checkbox" checked={isView} onChange={(e) => setView(e.target.checked)} className="size-4 accent-eu-navy" />Προβάλλεται</label>
      </div>
      <p className="m-0 rounded-lg bg-eu-surface px-2.5 py-1.5 text-eu-ink-3 text-[length:var(--fs-12)]">Μπαίνει με τον επόμενο ελεύθερο κωδικό στην ομάδα του SoftOne και φαίνεται και στο παλιό site. Τιμή παίρνει όταν η περιγραφή ενός είδους έχει γραμμή «Όνομα : τιμή».</p>
      <div className="flex justify-end"><button disabled={!name.trim() || dup || busy} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-45">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}Προσθήκη στο SoftOne</button></div>
    </form>
  );
}

function Rename({ s, onSave }: { s: Spec; onSave: (name: string) => void }) {
  const [name, setName] = useState(s.name);
  const changed = name.trim() && name.trim() !== s.name;
  return (
    <form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(name.trim()); }}>
      <label className="grid gap-0.5"><span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Νέο όνομα</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input} /></label>
      <ul className="m-0 pl-4 grid gap-1 text-eu-ink-2 text-[length:var(--fs-13)]">
        <li>Αλλάζει στο SoftOne και στο παλιό site.</li>
        <li><b>{n(s.descLines)}</b> γραμμές περιγραφών γράφουν «{s.name}». Δεν θα ταιριάζουν πια με το νέο όνομα, οπότε {s.facet ? `το φίλτρο θα χάσει τις τιμές τους (σήμερα ${n(s.facet.products)} προϊόντα)` : "δεν θα δίνουν τιμή"} μέχρι να αλλάξουν και οι περιγραφές.</li>
        <li>Ο σύνδεσμος του φίλτρου στο e-shop μένει ίδιος.</li>
      </ul>
      <p className="m-0 rounded-lg bg-eu-purple/10 px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-12)]">Αν θέλεις μόνο άλλο όνομα στο φίλτρο του e-shop, προτίμησε «Όνομα φίλτρου & σειρά» (μόνο e-shop): δεν αγγίζει τις περιγραφές ούτε το παλιό site.</p>
      <div className="flex justify-end"><button disabled={!changed} className="rounded-full bg-eu-red text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] disabled:opacity-45">Μετονομασία στο SoftOne</button></div>
    </form>
  );
}

function Options({ s, canWrite, onChange }: { s: Spec; canWrite: boolean; onChange: (c: SpecChange) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-2.5">
      {s.options.length ? (
        <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line-2 max-h-[45dvh] overflow-y-auto">
          {s.options.map((o) => (
            <li key={o.code} className={`flex items-center gap-2 px-2.5 py-1 text-[length:var(--fs-13)] ${o.active ? "" : "text-eu-muted"}`}>
              <span className="font-mono text-eu-muted text-[length:var(--fs-12)] w-6">{o.code}</span><span className="flex-1 truncate">{o.name}</span>
              <Switch on={o.active} label={`Ενεργή τιμή: ${o.name}`} disabled={!canWrite} onClick={() => onChange({ kind: "set-option", code: s.code, option: o.code, patch: { active: !o.active } })} />
            </li>
          ))}
        </ul>
      ) : <p className="m-0 rounded-lg bg-eu-surface/60 px-2.5 py-2 text-eu-muted text-[length:var(--fs-13)]">Χωρίς προκαθορισμένες τιμές: η τιμή κάθε προϊόντος έρχεται από την περιγραφή του.</p>}
      {canWrite && (
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onChange({ kind: "add-option", code: s.code, name: name.trim() }); }}>
          <label className="flex-1"><span className="sr-only">Νέα τιμή</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Νέα τιμή" maxLength={100} className={input} /></label>
          <button disabled={!name.trim()} className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] disabled:opacity-45"><Plus className="size-4" aria-hidden />Προσθήκη</button>
        </form>
      )}
      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Αλλάζουν στο SoftOne (και στο παλιό site), με επαλήθευση. Αφαίρεση = ανενεργή τιμή.</p>
    </div>
  );
}

function LocalSettings({ s, onSave }: { s: Spec; onSave: (next: { label: string | null; sort: number | null }) => void }) {
  const [label, setLabel] = useState(s.override?.label ?? "");
  const [sort, setSort] = useState(s.override?.sort != null ? String(s.override.sort) : "");
  return (
    <form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); onSave({ label: label.trim() || null, sort: sort.trim() === "" ? null : Number(sort) }); }}>
      <label className="grid gap-0.5"><span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Όνομα φίλτρου στο e-shop</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={s.name} maxLength={80} className={input} /><span className="text-eu-muted text-[length:var(--fs-12)]">Κενό = όπως στο SoftOne. Οι περιγραφές και ο σύνδεσμος δεν αλλάζουν.</span></label>
      <label className="grid gap-0.5 max-w-40"><span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Σειρά</span><input inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(s.code)} className={`${input} tabular-nums`} /><span className="text-eu-muted text-[length:var(--fs-12)]">Μικρότερο = πιο ψηλά.</span></label>
      <div className="flex flex-wrap justify-between gap-2">
        {(s.override?.label || s.override?.sort != null) ? <button type="button" onClick={() => onSave({ label: null, sort: null })} className="rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)]">Επαναφορά</button> : <span />}
        <button className="inline-flex items-center gap-1 rounded-full bg-eu-purple text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]"><Filter className="size-4" aria-hidden />Αποθήκευση στο e-shop</button>
      </div>
    </form>
  );
}

