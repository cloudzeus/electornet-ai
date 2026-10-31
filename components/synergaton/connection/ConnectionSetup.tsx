"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { BookOpen, Bot, Check, Eye, EyeOff, FileSpreadsheet, Pause, PlayCircle, Power, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import type { TestResult } from "@/lib/b2b-engine/contracts";
import type { UploadPreview } from "@/lib/b2b-engine/client";
import { deleteDraftConnection, runConnectionTest, saveConnectionSettings, saveFieldMap, saveLocationMap, setConnectionActive, uploadStock, type TestOut } from "@/app/synergaton/actions";
import { checkMapping, connTypeInfo, validateFields, type ConnType, type FieldMapping, type MapField } from "@/lib/partner-portal/connection-types";
import { Badge, btn, ButtonLink, Callout, focusRing } from "../ui";
import { ConfirmModal, Field, inputCls, ProgressModal, useProgress, Wizard, WizardNav, type ProgressStep, type WizardStep } from "../wizard";
import { ColumnMapper, type MapSource } from "./ColumnMapper";
import { initialLocations, LocationMapper, locationChecks, type LocRow, type PortalStore } from "./LocationMapper";

type LastTest = Pick<TestResult, "outcome" | "steps" | "sample" | "locations" | "total" | "startedAt" | "durationMs"> & { fieldHints?: Record<string, string> | null };
export type ConnView = { id: string; type: ConnType; label: string | null; status: string; active: boolean; config: Record<string, unknown>; secretKeys: string[]; storeIds: string[]; lastTest: LastTest | null; lastOkAt: string | null; locationMap: LocRow[] | null };
type Explain = Extract<TestOut, { ok: true }>["explain"];

const PLAN: Record<ConnType, [string, string][]> = {
  "softone-ws": [["reach", "Επικοινωνία με το SoftOne σας"], ["auth", "Σύνδεση με το web account"], ["read-sample", "Ανάγνωση δείγματος ειδών"], ["locations", "Υποκαταστήματα και αποθήκες"]],
  woocommerce: [["reach", "Επικοινωνία με το eshop"], ["auth", "Έλεγχος κλειδιού REST API"], ["read-sample", "Ανάγνωση δείγματος προϊόντων"]],
  "feed-url": [["reach", "Λήψη του αρχείου"], ["read-sample", "Ανάγνωση γραμμών και αναγνώριση στηλών"]],
  manual: [["send", "Αποστολή αρχείου"], ["read-sample", "Ανάγνωση γραμμών"], ["detect", "Αναγνώριση στηλών και καταστημάτων"]],
};
const STEP_LABEL: Record<string, string> = Object.fromEntries(Object.values(PLAN).flat());
const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

/** Βήματα του πραγματικού αποτελέσματος πάνω στο πλάνο: ό,τι δεν έτρεξε μετά από αποτυχία = παραλείφθηκε. */
function mergeSteps(plan: [string, string][], actual: { key: string; ok: boolean; message: string; ms: number }[]): ProgressStep[] {
  let failed = false;
  const out: ProgressStep[] = plan.map(([key, label]) => {
    const a = actual.find((s) => s.key === key);
    if (a) { if (!a.ok) failed = true; return { key, label, state: a.ok ? "ok" : "fail", detail: a.message, ms: a.ms }; }
    return { key, label, state: failed ? "skip" : "ok" };
  });
  for (const a of actual) if (!plan.some(([k]) => k === a.key)) out.push({ key: a.key, label: STEP_LABEL[a.key] ?? a.key, state: a.ok ? "ok" : "fail", detail: a.message, ms: a.ms });
  return out;
}

export function ConnectionSetup({ conn, stores, base }: { conn: ConnView; stores: PortalStore[]; base: string }) {
  const router = useRouter();
  const info = connTypeInfo(conn.type)!;
  const manual = conn.type === "manual";
  const steps: WizardStep[] = manual
    ? [{ key: "file", title: "Αρχείο", hint: "Ανεβάστε ένα Excel ή CSV. Πρώτα το διαβάζουμε για έλεγχο — τίποτα δεν αποθηκεύεται ακόμη." }, { key: "columns", title: "Στήλες", hint: "Ποια στήλη είναι ο κωδικός, ποια η ποσότητα, ποια το κατάστημα." }, { key: "stores", title: "Καταστήματα", hint: "Κάθε κατάστημα/αποθήκη του αρχείου σε ποιο κατάστημα του eshop αντιστοιχεί." }, { key: "upload", title: "Ανέβασμα", hint: "Τελικό ανέβασμα του αποθέματος." }, { key: "activate", title: "Ενεργοποίηση", hint: "Από εδώ και πέρα το eshop δείχνει τη διαθεσιμότητά σας." }]
    : [{ key: "details", title: "Στοιχεία", hint: "Τα στοιχεία πρόσβασης φυλάσσονται κρυπτογραφημένα στη μηχανή αποθέματος — δεν εμφανίζονται ξανά, ούτε σε εμάς." }, { key: "test", title: "Έλεγχος", hint: "Συνδεόμαστε και διαβάζουμε ένα μικρό δείγμα. Διαρκεί έως ενάμισι λεπτό." }, ...(info.columns ? [{ key: "columns", title: "Στήλες", hint: "Επιβεβαιώστε ποια στήλη του αρχείου είναι τι." }] : []), { key: "stores", title: "Καταστήματα", hint: "Κάθε υποκατάστημα/αποθήκη σας σε ποιο κατάστημα του eshop αντιστοιχεί." }, { key: "activate", title: "Ενεργοποίηση", hint: "Ξεκινά ο αυτόματος συγχρονισμός." }];
  const savedMap = (conn.config.map ?? null) as FieldMapping | null;

  const [cur, setCur] = useState(() => {
    if (conn.active) return steps.length - 1;
    if (manual) return 0;
    if (!conn.secretKeys.length && !Object.keys(conn.config).some((k) => k !== "map")) return 0;
    if (!conn.lastOkAt) return 1;
    return steps.findIndex((s) => s.key === "stores");
  });
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(info.fields.map((f) => [f.key, f.kind === "config" ? String(conn.config[f.key] ?? f.defaultValue ?? "") : ""])));
  const [blur, setBlur] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<(TestResult | LastTest) | null>(conn.lastTest);
  const [explain, setExplain] = useState<Explain>(null);
  const [cols, setCols] = useState<{ columns: string[]; preview: Record<string, string>[] } | null>(null);
  const [map, setMap] = useState<FieldMapping>(savedMap ?? {});
  const [src, setSrc] = useState<Partial<Record<MapField, MapSource>>>(() => Object.fromEntries(Object.keys(savedMap ?? {}).map((k) => [k, "saved"])) as Partial<Record<MapField, MapSource>>);
  const [mapDirty, setMapDirty] = useState(false);
  const [locs, setLocs] = useState<LocRow[] | null>(() => (conn.lastTest?.locations?.length ? initialLocations(conn.lastTest.locations, conn.locationMap, stores) : conn.locationMap));
  const [locSaved, setLocSaved] = useState(!!conn.locationMap?.some((l) => l.storeId));
  const [file, setFile] = useState<{ name: string; size: number; base64: string } | null>(null);
  const [mode, setMode] = useState<"full" | "delta">("full");
  const [dry, setDry] = useState<UploadPreview | null>(null);
  const [uploaded, setUploaded] = useState<{ accepted: number; rejected: number; lines: number } | null>(null);
  const [confirm, setConfirm] = useState<null | "activate" | "pause" | "delete">(null);
  const [okAt, setOkAt] = useState(conn.lastOkAt);
  const [pending, start] = useTransition();
  const prog = useProgress([]);
  const [progTitle, setProgTitle] = useState("");
  const [progResult, setProgResult] = useState<ReactNode>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fieldErr = { ...validateFields(conn.type, values, { secretsSet: conn.secretKeys }), ...serverFields };
  const mapChecks = cols ? checkMapping(map, cols.columns, cols.preview) : [];
  const mapOk = !!map.qty && (!!map.sku || !!map.ean) && !mapChecks.some((c) => !c.ok && c.level === "error");
  const locOk = !!locs && !locationChecks(locs, stores).some((c) => !c.ok && c.level === "error");
  const testOk = !!okAt || test?.outcome === "ok";

  const done = useMemo(() => {
    const d = new Set<string>();
    if (!manual && (conn.secretKeys.length || Object.keys(conn.config).some((k) => k !== "map"))) d.add("details");
    if (testOk) d.add("test");
    if ((savedMap && !mapDirty) || (info.columns && testOk && test?.outcome === "ok" && !mapDirty)) d.add("columns");
    if (manual && (dry || savedMap)) d.add("file");
    if (locSaved) d.add("stores");
    if (manual && (uploaded || okAt)) d.add("upload");
    if (conn.active) d.add("activate");
    return d;
  }, [manual, conn, testOk, savedMap, mapDirty, info.columns, test, dry, locSaved, uploaded, okAt]);

  const go = (key: string) => setCur(Math.max(0, steps.findIndex((s) => s.key === key)));
  const next = () => setCur((c) => Math.min(steps.length - 1, c + 1));

  function adoptLocations(list: { ref: string; name: string }[]) {
    setLocs(initialLocations(list.length ? list : [{ ref: "default", name: "Ενιαίο απόθεμα" }], conn.locationMap, stores));
  }

  async function doTest(after?: () => void) {
    setError(null); setExplain(null); setProgTitle("Έλεγχος σύνδεσης"); setProgResult(null);
    const plan = PLAN[conn.type];
    const r = await prog.run(() => runConnectionTest(conn.id), plan.map(([key, label]) => ({ key, label, state: "todo" as const })), 2500);
    if (!r.ok) {
      prog.setSteps((s) => s.map((x) => (x.state === "run" ? { ...x, state: "fail", detail: r.error } : x.state === "todo" ? { ...x, state: "skip" } : x)));
      setProgResult(<Callout tone="bad" title="Ο έλεγχος δεν έτρεξε">{r.error}</Callout>);
      return;
    }
    const t = r.result;
    prog.setSteps(mergeSteps(plan, t.steps));
    setTest(t); setExplain(r.explain);
    if (t.outcome === "ok") setOkAt(t.startedAt);
    if (t.columns?.length) {
      setCols({ columns: t.columns, preview: t.preview ?? [] });
      if (!mapDirty) {
        const hints = (t.fieldHints ?? {}) as FieldMapping;
        const m: FieldMapping = { ...hints, ...(savedMap ?? {}) };
        setMap(m);
        setSrc(Object.fromEntries(Object.keys(m).map((k) => [k, savedMap?.[k as MapField] ? "saved" : "auto"])) as Partial<Record<MapField, MapSource>>);
      }
    }
    adoptLocations(t.locations);
    setProgResult(
      t.outcome === "ok" ? <Callout tone="good" title="Η σύνδεση λειτουργεί">{t.total !== null ? `Βρήκαμε ${t.total.toLocaleString("el-GR")} γραμμές.` : "Διαβάσαμε δείγμα προϊόντων."} {info.columns ? "Επόμενο: επιβεβαίωση στηλών." : "Επόμενο: καταστήματα."}</Callout>
        : t.outcome === "review" ? <Callout tone="info" title="Θα την ελέγξουμε εμείς">Αυτός ο τρόπος δεν έχει ακόμη αυτόματο έλεγχο· θα επικοινωνήσουμε μαζί σας.</Callout>
          : <Callout tone="bad" title={r.explain?.title ?? "Κάτι δεν πήγε καλά"}>{r.explain?.explanation ?? t.steps.find((s) => !s.ok)?.message}</Callout>,
    );
    if (t.outcome === "ok") after?.();
    router.refresh();
  }

  function saveDetails() {
    const errs = validateFields(conn.type, values, { secretsSet: conn.secretKeys });
    setBlur(new Set(Object.keys(errs)));
    if (Object.keys(errs).length) return;
    start(async () => {
      setError(null); setServerFields({});
      const r = await saveConnectionSettings(conn.id, values);
      if (!r.ok) { setError(r.error); setServerFields(r.fields ?? {}); return; }
      setValues((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, info.fields.find((f) => f.key === k)?.kind === "secret" ? "" : x])));
      go("test");
      await doTest();
    });
  }

  function saveColumns() {
    if (!mapOk) return;
    start(async () => {
      setError(null);
      if (manual) { await previewFile(file, map); return; }
      const r = await saveFieldMap(conn.id, map);
      if (!r.ok) { setError(r.error); return; }
      setMapDirty(false);
      setSrc(Object.fromEntries(Object.keys(map).map((k) => [k, "saved"])) as Partial<Record<MapField, MapSource>>);
      await doTest(() => go("stores"));
    });
  }

  async function previewFile(f: typeof file, m: FieldMapping | null) {
    if (!f) { setError("Διαλέξτε πρώτα αρχείο."); return; }
    setProgTitle(m ? "Δοκιμή με την αντιστοίχισή σας" : "Ανάγνωση αρχείου"); setProgResult(null);
    const plan = PLAN.manual;
    const r = await prog.run(() => uploadStock(conn.id, { name: f.name, base64: f.base64, mode }, m, true), plan.map(([key, label]) => ({ key, label, state: "todo" as const })), 900);
    if (!r.ok) {
      prog.setSteps((s) => s.map((x) => (x.state === "run" ? { ...x, state: "fail", detail: r.error } : x.state === "todo" ? { ...x, state: "skip" } : x)));
      setProgResult(<Callout tone="bad" title="Το αρχείο δεν διαβάστηκε">{r.error}</Callout>);
      return;
    }
    const d = r.data as UploadPreview;
    setDry(d);
    setCols({ columns: d.columns, preview: d.preview });
    if (!m) {
      const mm: FieldMapping = { ...(d.suggested as FieldMapping), ...(savedMap ?? {}) };
      const usable = Object.fromEntries(Object.entries(mm).filter(([, c]) => d.columns.includes(c as string))) as FieldMapping;
      setMap(usable);
      setSrc(Object.fromEntries(Object.keys(usable).map((k) => [k, savedMap?.[k as MapField] ? "saved" : "auto"])) as Partial<Record<MapField, MapSource>>);
    }
    adoptLocations(d.locations.map((l) => ({ ref: l, name: l === "default" ? "Ενιαίο απόθεμα" : l })));
    prog.setSteps([
      { key: "send", label: "Αποστολή αρχείου", state: "ok", detail: `${f.name} · ${(f.size / 1024).toFixed(0)} KB` },
      { key: "read-sample", label: "Ανάγνωση γραμμών", state: d.lines ? "ok" : "fail", detail: `${d.lines.toLocaleString("el-GR")} γραμμές ${d.format.toUpperCase()}` },
      { key: "detect", label: "Αναγνώριση στηλών και καταστημάτων", state: d.accepted ? "ok" : "fail", detail: `${d.accepted.toLocaleString("el-GR")} δεκτές · ${d.rejected.toLocaleString("el-GR")} θα απορριφθούν · ${d.locations.length} ${d.locations.length === 1 ? "κατάστημα" : "καταστήματα"}` },
    ]);
    setProgResult(d.accepted ? <Callout tone="good" title={m ? "Η αντιστοίχιση δουλεύει" : "Το αρχείο διαβάστηκε"}>{m ? "Επόμενο: καταστήματα." : "Επόμενο: επιβεβαίωση στηλών."}</Callout> : <Callout tone="warn" title="Καμία γραμμή δεν θα γινόταν δεκτή">Ελέγξτε στο επόμενο βήμα ποια στήλη είναι ο κωδικός και ποια η ποσότητα.</Callout>);
    go(m ? "stores" : "columns");
    if (m) setMapDirty(false);
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (/\.xls$/i.test(f.name)) { setError("Το παλιό .xls δεν υποστηρίζεται — ανοίξτε το στο Excel και «Αποθήκευση ως» .xlsx."); return; }
    if (!/\.(xlsx|csv|txt|xml|json)$/i.test(f.name)) { setError("Δεκτά αρχεία: .xlsx, .csv, .xml, .json"); return; }
    if (f.size > 3 * 1024 * 1024) { setError(`Το αρχείο είναι ${(f.size / 1024 / 1024).toFixed(1)} MB — έως 3 MB. Κρατήστε μόνο τις στήλες κωδικού, ποσότητας και καταστήματος.`); return; }
    const x = { name: f.name, size: f.size, base64: await toB64(f) };
    setFile(x); setDry(null); setUploaded(null); setMapDirty(false);
    start(() => previewFile(x, null));
  }

  function saveLocs() {
    if (!locs || !locOk) return;
    start(async () => {
      setError(null);
      const r = await saveLocationMap(conn.id, locs.map((l) => ({ externalRef: l.externalRef, name: l.name, storeId: l.storeId })));
      if (!r.ok) { setError(r.error); return; }
      setLocSaved(true); next(); router.refresh();
    });
  }

  function doUpload() {
    if (!file) { go("file"); return; }
    start(async () => {
      setProgTitle("Ανέβασμα αποθέματος"); setProgResult(null);
      const r = await prog.run(() => uploadStock(conn.id, { name: file.name, base64: file.base64, mode }, map, false), [{ key: "send", label: "Αποστολή αρχείου", state: "todo" }, { key: "save", label: "Αποθήκευση γραμμών", state: "todo" }, { key: "match", label: "Σύνδεση με τα προϊόντα του καταλόγου", state: "todo" }], 1200);
      if (!r.ok) { prog.setSteps((s) => s.map((x) => (x.state === "run" ? { ...x, state: "fail", detail: r.error } : x.state === "todo" ? { ...x, state: "skip" } : x))); setProgResult(<Callout tone="bad" title="Το ανέβασμα απέτυχε">{r.error}</Callout>); return; }
      const d = r.data as { accepted: number; rejected: number; lines: number };
      setUploaded(d); if (d.accepted) setOkAt(new Date().toISOString());
      prog.setSteps([{ key: "send", label: "Αποστολή αρχείου", state: "ok", detail: file.name }, { key: "save", label: "Αποθήκευση γραμμών", state: d.accepted ? "ok" : "fail", detail: `${d.accepted.toLocaleString("el-GR")} δεκτές από ${d.lines.toLocaleString("el-GR")}` }, { key: "match", label: "Σύνδεση με τα προϊόντα του καταλόγου", state: "ok", detail: "Συνεχίζει στο παρασκήνιο — δείτε το Ιστορικό" }]);
      setProgResult(<Callout tone={d.accepted ? "good" : "bad"} title={d.accepted ? "Ανέβηκε" : "Δεν έγινε δεκτή καμία γραμμή"}>{d.rejected ? `${d.rejected} γραμμές απορρίφθηκαν (χωρίς κωδικό ή ποσότητα).` : "Όλες οι γραμμές έγιναν δεκτές."}</Callout>);
      if (d.accepted) next();
      router.refresh();
    });
  }

  function doActive(active: boolean) {
    start(async () => {
      const r = await setConnectionActive(conn.id, active);
      setConfirm(null);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }
  function doDelete() {
    start(async () => {
      const r = await deleteDraftConnection(conn.id);
      setConfirm(null);
      if (!r.ok) { setError(r.error); return; }
      router.push(`${base}/syndesi`);
    });
  }

  const key = steps[cur].key;
  const nav = (() => {
    const back = cur ? () => setCur(cur - 1) : undefined;
    switch (key) {
      case "details": return <WizardNav onBack={back} onNext={saveDetails} busy={pending || prog.running} nextLabel="Αποθήκευση και έλεγχος" note={Object.keys(fieldErr).length ? `${Object.keys(fieldErr).length} ${Object.keys(fieldErr).length === 1 ? "πεδίο θέλει" : "πεδία θέλουν"} διόρθωση` : "Μετά την αποθήκευση τρέχει αμέσως ο έλεγχος"} />;
      case "test": return <WizardNav onBack={back} onNext={testOk ? next : () => start(() => doTest())} busy={pending || prog.running} nextLabel={testOk ? "Συνέχεια" : "Έλεγχος τώρα"} extra={testOk ? <button type="button" onClick={() => start(() => doTest())} className={btn("ghost", "sm")}><RefreshCw className="size-4" aria-hidden /> Ξανά έλεγχος</button> : undefined} />;
      case "columns": return <WizardNav onBack={back} onNext={cols ? saveColumns : () => start(() => (manual ? previewFile(file, null) : doTest()))} nextDisabled={!!cols && !mapOk} busy={pending || prog.running} nextLabel={!cols ? "Φόρτωση στηλών" : manual ? "Δοκιμή με αυτή την αντιστοίχιση" : mapDirty || !savedMap ? "Αποθήκευση και νέος έλεγχος" : "Ξανά έλεγχος"} note={cols && !mapOk ? "Χρειάζεται κωδικός ή EAN και ποσότητα" : mapDirty ? "Έχετε μη αποθηκευμένες αλλαγές" : undefined} extra={!manual && done.has("columns") && !mapDirty ? <button type="button" onClick={() => go("stores")} className={btn("ghost", "sm")}>Παράλειψη</button> : undefined} />;
      case "file": return <WizardNav onBack={back} onNext={dry ? next : () => fileInput.current?.click()} busy={pending || prog.running} nextLabel={dry ? "Συνέχεια" : "Διαλέξτε αρχείο"} />;
      case "stores": return <WizardNav onBack={back} onNext={saveLocs} nextDisabled={!locs || !locOk} busy={pending} nextLabel="Αποθήκευση αντιστοίχισης" note={!locs ? "Χρειάζεται πρώτα επιτυχής έλεγχος" : undefined} />;
      case "upload": return <WizardNav onBack={back} onNext={uploaded ? next : doUpload} nextDisabled={!file && !uploaded} busy={pending || prog.running} nextLabel={uploaded ? "Συνέχεια" : "Ανέβασμα τώρα"} note={!file && !uploaded ? "Διαλέξτε ξανά το αρχείο στο πρώτο βήμα" : undefined} />;
      default: return <WizardNav onBack={back} onNext={() => setConfirm(conn.active ? "pause" : "activate")} busy={pending} nextLabel={conn.active ? "Παύση συγχρονισμού" : "Ενεργοποίηση"} nextDisabled={!conn.active && (!okAt || !locSaved)} extra={!conn.active ? <button type="button" onClick={() => setConfirm("delete")} className={btn("danger", "sm")}><Trash2 className="size-4" aria-hidden /> Διαγραφή</button> : undefined} />;
    }
  })();

  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";

  return (
    <>
      <Wizard title={`Ρύθμιση σύνδεσης ${info.title}`} steps={steps} current={cur} done={done} onStep={setCur} footer={nav}>
        {error && <div className="mb-4"><Callout tone="bad">{error}</Callout></div>}

        {key === "details" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] items-start">
            <div className="grid gap-4 md:grid-cols-2 min-w-0">
              {info.fields.map((f) => {
                const kept = f.kind === "secret" && conn.secretKeys.includes(f.key);
                const e = blur.has(f.key) ? fieldErr[f.key] : undefined;
                const show = reveal.has(f.key);
                return (
                  <Field key={f.key} id={`f-${f.key}`} label={f.label} required={f.required && !kept} error={e} help={kept ? <>Αποθηκευμένο κρυπτογραφημένα. Αφήστε το κενό για να μείνει ίδιο. {f.help}</> : f.help}>
                    {f.input === "select" ? (
                      <select id={`f-${f.key}`} value={values[f.key]} onChange={(ev) => setValues({ ...values, [f.key]: ev.target.value })} className={inputCls(!!e)}>
                        {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <div className="relative">
                        <input id={`f-${f.key}`} type={f.input === "password" && !show ? "password" : f.input === "url" ? "url" : "text"} inputMode={f.input === "url" ? "url" : undefined} autoComplete={f.autoComplete ?? "off"} spellCheck={false} autoCapitalize="none"
                          placeholder={kept ? "••••••••  (αποθηκευμένο)" : f.placeholder} value={values[f.key]} aria-invalid={!!e}
                          onChange={(ev) => { setValues({ ...values, [f.key]: ev.target.value }); setServerFields((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== f.key))); }}
                          onBlur={() => setBlur((b) => new Set(b).add(f.key))} className={`${inputCls(!!e)} ${f.input === "password" ? "pr-12" : ""}`} />
                        {f.input === "password" && <button type="button" onClick={() => setReveal((r) => { const n = new Set(r); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })} className={`absolute right-0.5 top-1/2 -translate-y-1/2 grid place-items-center size-11 rounded-full text-eu-ink-3 hover:text-eu-ink ${focusRing}`} aria-label={show ? "Απόκρυψη" : "Εμφάνιση"}>{show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>}
                      </div>
                    )}
                  </Field>
                );
              })}
            </div>
            <aside className="rounded-2xl bg-eu-surface p-4 grid gap-2 text-[length:var(--fs-14)]">
              <p className="m-0 font-bold">Τι θα χρειαστείτε</p>
              <ul className="m-0 pl-5 grid gap-1 text-eu-ink-2">{info.needs.map((n) => <li key={n}>{n}</li>)}</ul>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Χρόνος: {info.effort}. Μόνο ανάγνωση — δεν αλλάζουμε τίποτα στο σύστημά σας.</p>
              <ButtonLink href={`${base}/odigos/${info.guide}`} variant="ghost" size="sm" className="justify-self-start"><BookOpen className="size-4" aria-hidden /> Οδηγός βήμα-βήμα</ButtonLink>
            </aside>
          </div>
        )}

        {key === "test" && <TestView test={test} explain={explain} base={base} guide={info.guide} onRun={() => start(() => doTest())} busy={pending || prog.running} />}

        {key === "file" && (
          <div className="grid gap-4">
            <input ref={fileInput} type="file" accept=".xlsx,.csv,.txt,.xml,.json" className="sr-only" id="stock-file" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <label htmlFor="stock-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
              className={`grid place-items-center gap-2 text-center rounded-3xl border-2 border-dashed p-8 sm:p-10 cursor-pointer transition-colors duration-150 has-[:focus-visible]:ring-[3px] ${file ? "border-eu-green bg-[#f1faf5]" : "border-eu-muted-3 bg-eu-surface hover:border-eu-blue hover:bg-eu-chip"}`}>
              <span className={`grid place-items-center size-14 rounded-2xl ${file ? "bg-eu-green text-white" : "bg-white text-eu-navy shadow-sm"}`}>{file ? <FileSpreadsheet className="size-7" aria-hidden /> : <UploadCloud className="size-7" aria-hidden />}</span>
              <span className="font-heading font-extrabold text-[length:var(--fs-18)] break-all">{file ? file.name : "Σύρετε εδώ το αρχείο ή πατήστε για επιλογή"}</span>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{file ? `${(file.size / 1024).toFixed(0)} KB · πατήστε για άλλο αρχείο` : "Excel (.xlsx), CSV, XML ή JSON · έως 3 MB"}</span>
            </label>
            <fieldset className="m-0 p-0 border-0 grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 font-bold text-[length:var(--fs-14)]">Τι περιέχει το αρχείο;</legend>
              {([["full", "Όλο το απόθεμα", "Ό,τι λείπει από το αρχείο θεωρείται μηδέν. Προτείνεται."], ["delta", "Μόνο αλλαγές", "Ενημερώνονται μόνο τα είδη του αρχείου· τα άλλα μένουν ως είχαν."]] as const).map(([v, t, h]) => (
                <label key={v} className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${mode === v ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
                  <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-1 size-4 accent-[#122a58]" />
                  <span><b className="block text-[length:var(--fs-14)]">{t}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{h}</span></span>
                </label>
              ))}
            </fieldset>
            {dry && <Callout tone={dry.accepted ? "good" : "warn"} title={`${dry.lines.toLocaleString("el-GR")} γραμμές ${dry.format.toUpperCase()}`}>{dry.accepted.toLocaleString("el-GR")} θα γίνουν δεκτές με την αυτόματη αναγνώριση · {dry.columns.length} στήλες · {dry.locations.length} {dry.locations.length === 1 ? "κατάστημα" : "καταστήματα"}.</Callout>}
            <ButtonLink href={`${base}/odigos/upload`} variant="ghost" size="sm" className="justify-self-start"><BookOpen className="size-4" aria-hidden /> Πώς να είναι το αρχείο</ButtonLink>
          </div>
        )}

        {key === "columns" && (cols
          ? <>
              <ColumnMapper columns={cols.columns} preview={cols.preview} map={map} src={src} onChange={(m, s) => { setMap(m); setSrc(s); setMapDirty(true); }} />
              {manual && dry && !mapDirty && <div className="mt-4"><Callout tone={dry.accepted ? "good" : "warn"}>Με αυτή την αντιστοίχιση: {dry.accepted.toLocaleString("el-GR")} δεκτές, {dry.rejected.toLocaleString("el-GR")} απορρίπτονται.</Callout></div>}
            </>
          : <Callout tone="info" title={manual ? "Διαλέξτε πρώτα αρχείο" : "Οι στήλες φορτώνουν με τον έλεγχο"}>{manual ? "Το αρχείο δεν κρατιέται αν φύγετε από τη σελίδα· διαλέξτε το ξανά στο πρώτο βήμα." : "Πατήστε «Φόρτωση στηλών» — ξανατρέχει ο έλεγχος και διαβάζουμε τις στήλες του αρχείου σας."}</Callout>)}

        {key === "stores" && (locs
          ? <LocationMapper rows={locs} stores={stores} onChange={(r) => { setLocs(r); setLocSaved(false); }} />
          : <Callout tone="info" title="Δεν ξέρουμε ακόμη τις αποθήκες σας">Χρειάζεται πρώτα επιτυχής {manual ? "ανάγνωση αρχείου" : "έλεγχος"}.</Callout>)}

        {key === "upload" && (
          <div className="grid gap-3 max-w-[40rem]">
            {uploaded ? <Callout tone={uploaded.accepted ? "good" : "bad"} title={`Ανέβηκαν ${uploaded.accepted.toLocaleString("el-GR")} γραμμές`}>{uploaded.rejected ? `${uploaded.rejected} απορρίφθηκαν.` : "Χωρίς απορρίψεις."} Η σύνδεση με τα προϊόντα του καταλόγου ολοκληρώνεται σε λίγα λεπτά.</Callout>
              : file ? <div className="rounded-2xl bg-eu-surface p-4 grid gap-1 text-[length:var(--fs-14)]"><b className="break-all">{file.name}</b><span>{mode === "full" ? "Όλο το απόθεμα — ό,τι λείπει γίνεται μηδέν" : "Μόνο αλλαγές"}</span>{dry && <span>{dry.accepted.toLocaleString("el-GR")} γραμμές θα γίνουν δεκτές</span>}<span>Στήλες: {Object.entries(map).map(([k, v]) => `${k} → ${v}`).join(", ")}</span></div>
                : <Callout tone="info">Διαλέξτε ξανά το αρχείο στο βήμα «Αρχείο».</Callout>}
          </div>
        )}

        {key === "activate" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start">
            <ol className="m-0 p-0 list-none grid gap-2">
              {steps.slice(0, -1).map((s, i) => (
                <li key={s.key} className="flex items-center gap-3 rounded-xl bg-eu-surface px-3.5 py-3">
                  <span className={`grid place-items-center size-7 rounded-full shrink-0 ${done.has(s.key) ? "bg-eu-green text-white" : "bg-white border-2 border-eu-line text-eu-muted"}`}>{done.has(s.key) ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}</span>
                  <span className="flex-1 min-w-0 font-bold text-[length:var(--fs-14)]">{s.title}</span>
                  {!done.has(s.key) && <button type="button" onClick={() => setCur(i)} className={btn("ghost", "sm")}>Ολοκλήρωση</button>}
                </li>
              ))}
            </ol>
            <div className={`rounded-2xl p-5 grid gap-2 ${conn.active ? "bg-[#e6f6ef]" : "bg-eu-navy text-white"}`}>
              <span className={`grid place-items-center size-12 rounded-2xl ${conn.active ? "bg-eu-green text-white" : "bg-eu-yellow text-eu-navy"}`}>{conn.active ? <PlayCircle className="size-6" aria-hidden /> : <Power className="size-6" aria-hidden />}</span>
              <p className="m-0 font-heading font-extrabold text-[length:var(--fs-18)]">{conn.active ? "Σε λειτουργία" : "Έτοιμο για ενεργοποίηση"}</p>
              <p className={`m-0 text-[length:var(--fs-14)] ${conn.active ? "text-eu-ink-2" : "text-eu-on-dark"}`}>
                {conn.active ? (manual ? "Ανεβάστε νέο αρχείο όποτε αλλάζει το απόθεμα." : "Συγχρονίζουμε αυτόματα. Δείτε κάθε συγχρονισμό στο Ιστορικό.") : `Η διαθεσιμότητα θα φαίνεται στο euronics.gr για: ${[...new Set((locs ?? []).filter((l) => l.storeId).map((l) => storeName(l.storeId)))].join(", ") || "—"}.`}
              </p>
              {conn.active && <ButtonLink href={`${base}/istoriko?c=${conn.id}`} variant="secondary" size="sm" className="justify-self-start">Ιστορικό συγχρονισμών</ButtonLink>}
            </div>
          </div>
        )}
      </Wizard>

      <ProgressModal open={prog.open} title={progTitle} steps={prog.steps} running={prog.running} startedAt={prog.startedAt} onClose={() => prog.setOpen(false)}
        result={<>{progResult}{explain && !prog.running && <ExplainBox explain={explain} />}<button type="button" onClick={() => prog.setOpen(false)} className={btn("primary")}>Εντάξει</button></>} />
      <ConfirmModal open={confirm === "activate"} title="Ενεργοποίηση σύνδεσης;" confirmLabel="Ναι, ενεργοποίηση" busy={pending} onConfirm={() => doActive(true)} onCancel={() => setConfirm(null)}>
        <p className="m-0">Από τώρα το euronics.gr θα δείχνει τη διαθεσιμότητα από αυτή τη σύνδεση στα καταστήματα:</p>
        <ul className="m-0 pl-5">{[...new Set((locs ?? []).filter((l) => l.storeId).map((l) => storeName(l.storeId)))].map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Μπορείτε να τη θέσετε σε παύση οποτεδήποτε.</p>
      </ConfirmModal>
      <ConfirmModal open={confirm === "pause"} title="Παύση συγχρονισμού;" tone="danger" confirmLabel="Παύση" busy={pending} onConfirm={() => doActive(false)} onCancel={() => setConfirm(null)}>
        <p className="m-0 flex gap-2"><Pause className="size-4 mt-1 shrink-0" aria-hidden />Σταματά η ενημέρωση. Το eshop θα δείχνει την τελευταία γνωστή διαθεσιμότητα με την ώρα της.</p>
      </ConfirmModal>
      <ConfirmModal open={confirm === "delete"} title="Διαγραφή σύνδεσης;" tone="danger" confirmLabel="Διαγραφή" busy={pending} onConfirm={doDelete} onCancel={() => setConfirm(null)}>
        <p className="m-0">Διαγράφονται οι ρυθμίσεις και τα αποθηκευμένα στοιχεία πρόσβασης αυτής της σύνδεσης. Το ιστορικό μένει.</p>
      </ConfirmModal>
    </>
  );
}

function ExplainBox({ explain }: { explain: NonNullable<Explain> }) {
  return (
    <div className="rounded-2xl border-2 border-eu-yellow bg-[#fffbea] p-4 grid gap-2 text-[length:var(--fs-14)]">
      <p className="m-0 flex items-center gap-2 font-bold"><Bot className="size-4" aria-hidden /> Τι να κάνετε</p>
      {explain.fixes.length > 0 && <ol className="m-0 pl-5 grid gap-1">{explain.fixes.map((f) => <li key={f}>{f}</li>)}</ol>}
      {explain.forTechnician && <details className="text-[length:var(--fs-13)]"><summary className="cursor-pointer font-bold min-h-11 flex items-center">Για τον τεχνικό σας</summary><p className="m-0 text-eu-ink-2 whitespace-pre-wrap">{explain.forTechnician}</p></details>}
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Από τον βοηθό, με βάση μόνο τα μηνύματα του ελέγχου.</p>
    </div>
  );
}

function TestView({ test, explain, base, guide, onRun, busy }: { test: (TestResult | LastTest) | null; explain: Explain; base: string; guide: string; onRun: () => void; busy: boolean }) {
  if (!test) return (
    <div className="grid place-items-center text-center gap-3 rounded-3xl bg-eu-surface p-8">
      <span className="grid place-items-center size-14 rounded-2xl bg-white text-eu-navy shadow-sm"><PlayCircle className="size-7" aria-hidden /></span>
      <p className="m-0 font-heading font-extrabold text-[length:var(--fs-18)]">Δεν έχει γίνει ακόμη έλεγχος</p>
      <button type="button" onClick={onRun} disabled={busy} className={btn("primary", "lg")}>Έλεγχος τώρα</button>
    </div>
  );
  const tone = test.outcome === "ok" ? "good" : test.outcome === "review" ? "info" : "bad";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <div className="grid gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{test.outcome === "ok" ? "Επιτυχής" : test.outcome === "review" ? "Για έλεγχο από εμάς" : "Απέτυχε"}</Badge>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{new Date(test.startedAt).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" })} · {(test.durationMs / 1000).toFixed(1)}″</span>
        </div>
        <ol className="m-0 p-0 list-none grid gap-1.5">
          {test.steps.map((s) => (
            <li key={s.key} className={`flex gap-3 items-start rounded-xl px-3 py-2.5 ${s.ok ? "bg-eu-surface" : "bg-[#fdecea]"}`}>
              <span className={`grid place-items-center size-6 rounded-full shrink-0 mt-0.5 text-white ${s.ok ? "bg-eu-green" : "bg-[#b3261e]"}`}>{s.ok ? <Check className="size-3.5" aria-label="επιτυχία" /> : <X className="size-3.5" aria-label="αποτυχία" />}</span>
              <span className="min-w-0"><b className="block text-[length:var(--fs-14)]">{STEP_LABEL[s.key] ?? s.key}</b><span className="block text-[length:var(--fs-13)] text-eu-ink-2 break-words">{s.message}</span></span>
            </li>
          ))}
        </ol>
        {explain && <ExplainBox explain={explain} />}
        {test.outcome === "failed" && <ButtonLink href={`${base}/odigos/${guide}`} variant="ghost" size="sm" className="justify-self-start"><BookOpen className="size-4" aria-hidden /> Λύσεις στα συνηθισμένα προβλήματα</ButtonLink>}
      </div>
      <div className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0">
        <p className="m-0 font-bold text-[length:var(--fs-14)]">Δείγμα που διαβάσαμε{test.total !== null ? ` · ${test.total.toLocaleString("el-GR")} γραμμές συνολικά` : ""}</p>
        {test.sample.length ? (
          <ul className="m-0 p-0 list-none grid gap-1.5">
            {test.sample.map((r, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-13)]">
                <span className="min-w-0"><b className="block break-all">{r.externalSku}</b><span className="block text-eu-ink-3 truncate">{[r.ean, r.title].filter(Boolean).join(" · ") || "—"}</span><span className="block text-eu-ink-3 break-all">Αποθήκη: {r.locationRef}</span></span>
                <span className="font-extrabold tabular-nums">{r.qty}</span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Κανένα προϊόν στο δείγμα.</p>}
        {test.locations.length > 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αποθήκες: {test.locations.map((l) => l.name || l.ref).join(", ")}</p>}
      </div>
    </div>
  );
}
