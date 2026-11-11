"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, BookmarkCheck, Check, ChevronDown, CircleAlert, Clock, Link2, EyeOff, Columns3, ListChecks, FileSpreadsheet, FolderTree, HelpCircle, History, Images, Loader2, PackagePlus, Play, Sparkles, PowerOff, RefreshCw, Upload } from "lucide-react";
import { suggestTarget, unknownHeader, configForHeaders, toRows, composeValue, mergeMedia, type ComposeField, type ForeignRow, type MappingConfig, type Target } from "@/lib/catalog/foreign-import/core";
import { ComposeBuilder, LivePreview, destLabel, type LiveInfo } from "@/components/admin/catalog/ForeignColumns";
import { encodeTarget, decodeTarget, valuesAfter, autoMatch, PREVIEW_ROWS, type InspectSheet, type SavedMappingRef, type RecentJob } from "@/lib/catalog/foreign-import/ui-core";
import type { ForeignPlanRow, RowStatus } from "@/lib/catalog/foreign-import/plan-core";
import { PriceOptions, type PriceOpts } from "@/components/admin/catalog/PriceOptions";
import type { MatchKind } from "@/lib/catalog/foreign-import/core";
import { lookupMapping, liveCardInfo, categorySpecsInfo, runForeignBatch, replanJob, saveDraftMapping, finishData, deactivateMissingProducts, suggestJobCategories, applyJobCategories, type FinishData, type JobCategoryAi } from "@/app/admin/(shell)/catalog/templates/import/actions";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";
import { PendingItems } from "@/components/admin/catalog/PendingItems";
import { CategorySpecsTab, suggestCatSpecs, type AiState, type CatMode, type Col } from "@/components/admin/catalog/ForeignCategories";
import type { CategorySpecs } from "@/lib/catalog/foreign-import/server";
import { CategoryProposals } from "@/components/admin/catalog/CategoryProposals";
import type { Settings } from "@/lib/cms/settings";
import { CardPeek } from "@/components/admin/catalog/CardPeek";

type Brand = { id: string; name: string; s1: boolean };
type Category = { id: string; name: string; path: string };
/** reopened = όνομα αρχείου όταν η προεπισκόπηση άνοιξε από τις «Πρόσφατες εισαγωγές» (χωρίς αρχείο στον browser) */
type Plan = { jobId: string; rows: ForeignPlanRow[]; writeOn: boolean; reopened?: string; /** δεύτερο αρχείο φωτογραφιών: πόσες γραμμές του βρήκαν προϊόν */ mediaMatch?: { matched: number; total: number; file: string } };
type Step = 1 | 2 | 3 | 4 | 5;

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] tabular-nums";
const card = "rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-3 min-w-0";
const BATCH = 50;
const PAGE = 100;
const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const colName = (i: number) => { let s = "", n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Οι στόχοι μιας στήλης, με μία γραμμή εξήγησης ο καθένας (φαίνεται κάτω από την επιλογή). */
const TARGETS: { group: string; items: { value: string; label: string; help: string }[] }[] = [
  { group: "Πεδία είδους", items: [
    { value: "field:code", label: "Κωδικός είδους", help: "Ο δικός μας κωδικός στο SoftOne — βρίσκει το είδος. Στα νέα είδη γίνεται ο κωδικός τους." },
    { value: "field:mtrl", label: "MTRL (αριθμός SoftOne)", help: "Μόνο σε αρχεία που βγήκαν από εμάς — βρίσκει το είδος με σιγουριά." },
    { value: "field:name", label: "Όνομα", help: "Μπαίνει μόνο αν το είδος δεν έχει όνομα· στα νέα είναι το όνομά τους." },
    { value: "field:barcode", label: "EAN / barcode", help: "Βρίσκει το είδος από το barcode· γράφεται μόνο αν λείπει." },
    { value: "field:factoryCode", label: "Κωδικός κατασκευαστή", help: "Μοντέλο / part number — μαζί με τη μάρκα βρίσκει το είδος." },
    { value: "field:shortDesc", label: "Σύντομη περιγραφή", help: "Μία–δύο προτάσεις για τη λίστα προϊόντων· μόνο αν λείπει." },
    { value: "field:descText", label: "Αναλυτική περιγραφή", help: "Κείμενο της σελίδας προϊόντος — μπαίνει μόνο αν το είδος δεν έχει ήδη κείμενο." },
    { value: "field:guaranteeMonths", label: "Εγγύηση (μήνες)", help: "Ακέραιος αριθμός μηνών· μόνο αν λείπει." },
    { value: "field:widthCm", label: "Πλάτος (εκ.)", help: "Διάσταση σε εκατοστά· μόνο αν λείπει." },
    { value: "field:heightCm", label: "Ύψος (εκ.)", help: "Διάσταση σε εκατοστά· μόνο αν λείπει." },
    { value: "field:lengthCm", label: "Βάθος (εκ.)", help: "Διάσταση σε εκατοστά· μόνο αν λείπει." },
    { value: "field:weightKg", label: "Βάρος (kg)", help: "Καθαρό βάρος σε κιλά· μόνο αν λείπει." },
  ] },
  { group: "Χαρακτηριστικά & πολυμέσα", items: [
    { value: "spec", label: "Χαρακτηριστικό", help: "Γίνεται χαρακτηριστικό με την ετικέτα που γράφεις — μόνο αν υπάρχει στην ομάδα του είδους και δεν έχει ήδη τιμή." },
    { value: "media:image", label: "Φωτογραφίες (διευθύνσεις)", help: "URL φωτογραφιών: κατεβαίνουν και προστίθενται στο προϊόν (δεν αντικαθιστούν τις υπάρχουσες)." },
    { value: "media:banner", label: "Banners (διευθύνσεις)", help: "URL banners: προστίθενται στο προϊόν." },
    { value: "media:video", label: "Βίντεο (διευθύνσεις)", help: "URL βίντεο: προστίθενται στο προϊόν." },
  ] },
  { group: "Ταξινόμηση", items: [
    { value: "brand", label: "Μάρκα", help: "Κάθε τιμή της στήλης αντιστοιχίζεται σε δική μας μάρκα στο βήμα 3." },
    { value: "category", label: "Κατηγορία", help: "Κάθε τιμή αντιστοιχίζεται σε κατηγορία μας στο βήμα 3 — δίνει ομάδα χαρακτηριστικών στα νέα και κανόνα τιμής." },
  ] },
  { group: "Τιμές", items: [
    { value: "cost", label: "Κόστος (χωρίς ΦΠΑ)", help: "Με τον κανόνα τιμολόγησης βγάζει την τιμή web. Γράφεται όπου το είδος δεν έχει τιμή, και διορθώνεται όπου η νέα είναι μεγαλύτερη από αυτήν που έχει." },
    { value: "rrp", label: "Προτεινόμενη λιανική", help: "Πλαφόν: η τιμή από τον κανόνα δεν την ξεπερνά." },
  ] },
  { group: "Άλλο", items: [{ value: "ignore", label: "Αγνόηση", help: "Η στήλη δεν χρησιμοποιείται." }] },
];
const TARGET_OF = new Map(TARGETS.flatMap((g) => g.items).map((t) => [t.value, t]));
const KEY_TARGETS = new Set(["field:code", "field:mtrl", "field:barcode", "field:factoryCode"]);

const STATUS: Record<RowStatus, { label: string; cls: string }> = {
  update: { label: "Ενημέρωση", cls: "bg-eu-chip text-eu-navy" },
  unchanged: { label: "Χωρίς αλλαγή", cls: "bg-eu-surface text-eu-ink-3" },
  new: { label: "Νέο είδος", cls: "bg-eu-green/12 text-eu-ink" },
  waiting: { label: "Σε αναμονή", cls: "bg-eu-yellow/30 text-eu-ink" },
  problem: { label: "Πρόβλημα", cls: "bg-eu-red/10 text-eu-red" },
};
const STATUS_ORDER: RowStatus[] = ["update", "new", "waiting", "unchanged", "problem"];
// Τι σημαίνει μια γραμμή που εκτελέστηκε χωρίς σφάλμα, ανά κατάσταση (ίδια λογική με το applyForeign)
const DONE_TEXT: Record<RowStatus, string> = {
  update: "Έγινε.", new: "Έτοιμο για δημιουργία — συνέχισε στο βήμα 5.", waiting: "Σε αναμονή (οι φωτογραφίες πέρασαν): όταν ανοίξουν οι αλλαγές προς το SoftOne, πάτα «Νέα προεπισκόπηση» σε αυτή την εισαγωγή από τις «Πρόσφατες εισαγωγές» και εκτέλεσε ξανά.",
  unchanged: "Τίποτα να γίνει.", problem: "",
};
const MATCHED_BY: Record<MatchKind, string> = { mtrl: "MTRL", code: "κωδικό", ean: "EAN", factory: "κωδ. κατασκευαστή" };
const JOB_STATUS: Record<string, string> = { draft: "Προεπισκόπηση", partial: "Μερικώς", applied: "Εκτελέστηκε" };
const when = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }); // ίδια ώρα σε server και browser (hydration)

/** Οδηγός εισαγωγής από ξένο Excel: 1 αρχείο · 2 στήλες (με ερωτήσεις για ό,τι δεν αναγνωρίστηκε) · 3 τιμή & τιμές μάρκας/κατηγορίας · 4 προεπισκόπηση & εκτέλεση · 5 δημιουργία νέων ειδών & όσα λείπουν από το αρχείο. */
export function ForeignImportWizard({ brands, categories, writeOn, canSync, recent, settings }: { brands: Brand[]; categories: Category[]; writeOn: boolean; canSync: boolean; recent: RecentJob[]; settings: Settings }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  /** προαιρετικό δεύτερο αρχείο μόνο με φωτογραφίες / βίντεο — δένει με τις γραμμές στην προεπισκόπηση */
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  /** οι γραμμές του αρχείου φωτογραφιών (κλειδιά + URL), για τη ζωντανή κάρτα πριν από την προεπισκόπηση */
  const [mediaExtra, setMediaExtra] = useState<{ rows: ForeignRow[] } | { error: string } | "loading" | null>(null);
  const mediaSeq = useRef(0);
  const pickMedia = (f: File | null) => {
    setMediaFile(f); touch();
    const seq = ++mediaSeq.current;
    if (!f) { setMediaExtra(null); return; }
    setMediaExtra("loading");
    const body = new FormData(); body.set("file", f);
    fetch("/api/admin/catalog/foreign-import/media", { method: "POST", body })
      .then(async (r) => { const j = await r.json().catch(() => ({ error: "Το αρχείο φωτογραφιών δεν διαβάστηκε." })); return r.ok ? { rows: j.rows as ForeignRow[] } : { error: String(j.error ?? "Το αρχείο φωτογραφιών δεν διαβάστηκε.") }; })
      .catch(() => ({ error: "Το αρχείο φωτογραφιών δεν διαβάστηκε." }))
      .then((x) => { if (seq === mediaSeq.current) setMediaExtra(x); });
  };
  const [sheets, setSheets] = useState<InspectSheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [saved, setSaved] = useState<SavedMappingRef | null>(null);
  const [usedMapping, setUsedMapping] = useState<SavedMappingRef | null>(null);
  const [cols, setCols] = useState<Record<number, string>>({});
  const [labels, setLabels] = useState<Record<number, string>>({});
  /** στήλες με δεδομένα που ο τίτλος τους δεν αναγνωρίστηκε: ο χρήστης πρέπει να πει τι είναι πριν προχωρήσει */
  const [unsureRaw, setUnsure] = useState<Set<number>>(new Set());
  const [sheetBrandId, setSheetBrandId] = useState<string | null>(null);
  const [sheetCategoryId, setSheetCategoryId] = useState<string | null>(null);
  const [saveAs, setSaveAs] = useState("");
  /** σύνθετα πεδία (π.χ. όνομα = Περιγραφή + Μάρκα + Μοντέλο) */
  const [compose, setCompose] = useState<ComposeField[]>([]);
  /** ποια γραμμή δείχνει η ζωντανή κάρτα του eshop */
  const [liveIdx, setLiveIdx] = useState(0);
  /** απάντηση του server για την κάρτα, με το κλειδί της γραμμής/επιλογών που τη ζήτησαν */
  const [liveRes, setLiveRes] = useState<{ key: string; info: Exclude<LiveInfo, "loading" | null> } | null>(null);
  /** καρτέλα του βήματος 2: στήλες ή κατηγορίες και χαρακτηριστικά */
  const [catTab, setCatTab] = useState<"cols" | "cats">("cols");
  const [catMode, setCatMode] = useState<CatMode>("ai");
  /** κατηγορία ανά γραμμή (από τις προτάσεις AI, με τις διορθώσεις του χρήστη) */
  const [rowCats, setRowCats] = useState<Record<number, string>>({});
  /** κατηγορία → στήλη → χαρακτηριστικό της ομάδας της */
  const [catSpecs, setCatSpecs] = useState<Record<string, Record<number, string>>>({});
  const [specInfo, setSpecInfo] = useState<CategorySpecs>({});
  const [ai, setAi] = useState<AiState>(null);
  const aiSeq = useRef(0);
  const [brandMap, setBrandMap] = useState<Record<string, string | null>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<"inspect" | "plan" | `replan:${string}` | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [priceOpts, setPriceOpts] = useState<PriceOpts>({ priceMode: "cost", vatIncluded: false, markupPercent: null });
  const lookupSeq = useRef(0);

  const sheet = sheets?.[sheetIdx] ?? null;
  const headers = useMemo(() => sheet?.preview[headerRow] ?? [], [sheet, headerRow]);
  const brandOpts: PickOpt[] = useMemo(() => brands.map((b) => ({ id: b.id, name: b.name, hint: b.s1 ? undefined : "χωρίς σύνδεση με SoftOne" })), [brands]);
  const catOpts: PickOpt[] = useMemo(() => categories.map((c) => ({ id: c.id, name: c.path })), [categories]);

  /** Κάθε αλλαγή σε βήματα 1–3 ακυρώνει την προεπισκόπηση (θέλει νέο έλεγχο). */
  const touch = () => { if (plan) setPlan(null); };

  /** Στόχοι στηλών: από αποθηκευμένη αντιστοίχιση ή πρόταση ανά επικεφαλίδα. */
  const initColumns = (sh: InspectSheet, hr: number, m: SavedMappingRef | null) => {
    const hs = sh.preview[hr] ?? [];
    const cfg = m ? configForHeaders(m.config, hs) : null;
    const next: Record<number, string> = {}, lbl: Record<number, string> = {}, ask = new Set<number>();
    for (let i = 0; i < sh.cols.length; i++) {
      const t: Target = cfg ? cfg.columns[i] ?? { kind: "ignore" } : suggestTarget(hs[i] ?? "");
      next[i] = encodeTarget(t);
      lbl[i] = t.kind === "spec" ? t.label : (hs[i] ?? "").trim();
      // Χωρίς αποθηκευμένη αντιστοίχιση: άγνωστος τίτλος + στήλη με δεδομένα = ερώτηση (όχι σιωπηλή αγνόηση)
      if (!cfg && unknownHeader(hs[i] ?? "") && valuesAfter(sh.cols[i], hr)?.length !== 0) ask.add(i);
    }
    setCols(next); setLabels(lbl); setUnsure(ask); setCompose(cfg?.compose ?? []); setLiveIdx(0);
    setCatSpecs(cfg?.catSpecs ?? {}); setRowCats({}); setAi(null); aiSeq.current++; setCatMode(cfg?.sheetCategoryId ? "one" : "ai");
    if (m?.config.price) setPriceOpts(m.config.price);
    setBrandMap(cfg?.brandMap ?? {}); setCategoryMap(cfg?.categoryMap ?? {});
    setSheetBrandId(cfg?.sheetBrandId ?? null); setSheetCategoryId(cfg?.sheetCategoryId ?? null);
    setUsedMapping(m);
    touch();
  };
  /** Νέο φύλλο / νέα γραμμή επικεφαλίδας: προτάσεις από την αρχή και αναζήτηση αποθηκευμένης αντιστοίχισης. */
  const choose = (sh: InspectSheet, idx: number, hr: number, known?: SavedMappingRef | null) => {
    setSheetIdx(idx); setHeaderRow(hr); setSaved(known ?? null); initColumns(sh, hr, null);
    if (known !== undefined) return;
    const seq = ++lookupSeq.current;
    lookupMapping(sh.preview[hr] ?? []).then((m) => { if (seq === lookupSeq.current) setSaved(m); }).catch(() => {});
  };

  const inspect = async (f: File) => {
    setFile(f); setMediaFile(null); setMediaExtra(null); mediaSeq.current++; setSheets(null); setPlan(null); setErr(null); setBusy("inspect"); setStep(1); setSaveAs("");
    try {
      const body = new FormData(); body.set("file", f);
      const r = await fetch("/api/admin/catalog/foreign-import/inspect", { method: "POST", body });
      const j = await r.json().catch(() => ({ error: "Ο έλεγχος του αρχείου απέτυχε." }));
      if (!r.ok) throw new Error(j.error ?? "Ο έλεγχος του αρχείου απέτυχε.");
      const list = j.sheets as InspectSheet[];
      setSheets(list);
      const first = list.reduce((best, s, i) => (s.rowCount > list[best].rowCount ? i : best), 0); // το φύλλο με τις περισσότερες γραμμές
      choose(list[first], first, list[first].headerRow, list[first].mapping);
    } catch (e) { setErr((e as Error).message); setFile(null); } finally { setBusy(null); }
  };

  // ---- βήμα 3: τιμές μάρκας / κατηγορίας ----
  const colsOf = (v: string) => Object.entries(cols).filter(([, t]) => t === v).map(([i]) => Number(i));
  const valuesOf = (v: string) => {
    let many = false;
    const set = new Set<string>();
    for (const i of colsOf(v)) { const l = valuesAfter(sheet?.cols[i], headerRow); if (l == null) many = true; else l.forEach((x) => set.add(x)); }
    return { values: [...set].sort((a, b) => a.localeCompare(b, "el")), many };
  };
  const brandVals = valuesOf("brand"), catVals = valuesOf("category");
  // Ο τίτλος της στήλης που δίνει κόστος / λιανική (null = το αρχείο δεν έχει) — για να φαίνεται από πού βγαίνει η τιμή
  const colTitle = (v: string) => { const i = colsOf(v)[0]; return i == null ? null : (headers[i] ?? "").trim() || `Στήλη ${colName(i)}`; };
  const costCol = colTitle("cost"), retailCol = colTitle("rrp"), catCol = colTitle("category");
  const goValues = () => {
    // Αυτόματη αντιστοίχιση μόνο για τιμές που δεν έχουν ήδη επιλογή (π.χ. από αποθηκευμένη αντιστοίχιση)
    const bm = autoMatch(brandVals.values.filter((v) => !(v in brandMap)), brands);
    const cm = autoMatch(catVals.values.filter((v) => !(v in categoryMap)), categories);
    if (Object.keys(bm).length) setBrandMap((m) => ({ ...bm, ...m }));
    if (Object.keys(cm).length) setCategoryMap((m) => ({ ...cm, ...m }));
    // Η τιμή ξεκινά από τη στήλη που υπάρχει: επιλογή χωρίς στήλη πίσω της δεν θα έβγαζε τίποτα
    if (priceOpts.priceMode === "cost" ? !costCol && retailCol : !retailCol && costCol) setPriceOpts((o) => ({ ...o, priceMode: costCol ? "cost" : "retail" }));
    // Οι στήλες κρατιούνται από τώρα (όχι μόνο στην προεπισκόπηση): ίδιο αρχείο άλλη μέρα → συνεχίζεις από εδώ. Αποτυχία = απλώς δεν κρατήθηκε.
    void saveDraftMapping(headers, config(), priceOpts, file?.name ?? "", saveAs.trim()).catch(() => {});
    setStep(3);
  };

  /** Απάντηση σε στήλη-ερώτηση (ή οποιαδήποτε αλλαγή στόχου): η στήλη παύει να είναι ερώτηση. */
  const setTarget = (i: number, raw: string) => {
    const nv = raw.startsWith("spec::") ? "spec" : raw;
    if (raw.startsWith("spec::")) setLabels((l) => ({ ...l, [i]: raw.slice(6) }));
    setCols((c) => ({ ...c, [i]: nv }));
    if (nv === "spec" && !(labels[i] ?? "").trim()) setLabels((l) => ({ ...l, [i]: (headers[i] ?? "").trim() }));
    setUnsure((u) => { if (!u.has(i)) return u; const x = new Set(u); x.delete(i); return x; });
    touch();
  };
  const answerAll = (nv: string) => { for (const i of unsure) setTarget(i, nv); };
  const specMissing = Object.entries(cols).some(([i, t]) => t === "spec" && !(labels[Number(i)] ?? "").trim());
  const mapped = Object.values(cols).filter((t) => t !== "ignore").length;
  const hasKey = Object.values(cols).some((t) => KEY_TARGETS.has(t));
  const config = (): MappingConfig => {
    const columns: Record<number, Target> = {};
    for (const [i, t] of Object.entries(cols)) if (t !== "ignore") columns[Number(i)] = decodeTarget(t, (labels[Number(i)] ?? "").trim());
    const pick = (m: Record<string, string | null>, vals: string[]) => Object.fromEntries(vals.map((v) => [v, m[v] ?? null]));
    const comp = compose.filter((f) => f.parts.length);
    const cs = Object.fromEntries(Object.entries(catSpecs).filter(([, m]) => Object.keys(m).length));
    const rc = catMode === "ai" && Object.keys(rowCats).length ? { rowCats } : {};
    return { columns, ...(comp.length ? { compose: comp } : {}), ...(Object.keys(cs).length ? { catSpecs: cs } : {}), ...rc, brandMap: pick(brandMap, brandVals.values), categoryMap: pick(categoryMap, catVals.values), sheetBrandId, sheetCategoryId };
  };

  // ---- βήμα 2, καρτέλα «Κατηγορίες και χαρακτηριστικά» ----
  const catCols = (all: { i: number; h: string; ex: string[] }[]): Col[] => all.map((c) => ({ i: c.i, letter: colName(c.i), title: c.h || "(χωρίς τίτλο)", ex: c.ex }));
  const columnCats = [...new Set(catVals.values.map((v) => categoryMap[v] ?? null).filter((x): x is string => !!x))];
  const activeCats = catMode === "one" ? (sheetCategoryId ? [sheetCategoryId] : []) : [...new Set([...Object.values(rowCats), ...columnCats])];
  // Στήλη που γράφεται σε χαρακτηριστικό κάποιας κατηγορίας έχει απαντηθεί — δεν ρωτιέται πια «Τι είναι;»
  const catUsed = new Set(activeCats.flatMap((id) => Object.keys(catSpecs[id] ?? {}).map(Number)));
  const unsure = catUsed.size ? new Set([...unsureRaw].filter((i) => !catUsed.has(i))) : unsureRaw;
  const catNeeds = activeCats.filter((id) => specInfo[id] && (specInfo[id].specs.length === 0 || specInfo[id].specs.some((sp) => !Object.values(catSpecs[id] ?? {}).includes(sp)))).length;
  const catBadge = catNeeds ? `${catNeeds} θέλ${catNeeds === 1 ? "ει" : "ουν"} ματιά` : activeCats.length ? String(activeCats.length) : "";
  // ετικέτες που έδωσε ο χρήστης στις στήλες-χαρακτηριστικά της καρτέλας «Στήλες» (βοηθούν την πρώτη αντιστοίχιση)
  const specLabels = useMemo(() => Object.fromEntries(Object.entries(cols).filter(([, t]) => t === "spec").map(([i]) => [Number(i), labels[Number(i)] ?? ""])), [cols, labels]);
  const setCatSpec = (catId: string, col: number | null, spec: string) => {
    setCatSpecs((all) => {
      const m = Object.fromEntries(Object.entries(all[catId] ?? {}).filter(([, l]) => l !== spec));
      if (col != null) m[col] = spec;
      return { ...all, [catId]: m };
    });
    touch();
  };
  /** Νέες κατηγορίες: τα χαρακτηριστικά τους και μια πρώτη αντιστοίχιση από τα ονόματα των στηλών (μόνο όπου δεν υπάρχει ήδη). */
  const addSpecInfo = useCallback((info: CategorySpecs) => {
    setSpecInfo((s) => ({ ...s, ...info }));
    if (!sheet) return;
    const hs = sheet.preview[headerRow] ?? [];
    const colsNow: Col[] = sheet.cols.map((_, i) => ({ i, letter: "", title: (hs[i] ?? "").trim(), ex: [] }));
    setCatSpecs((cs) => {
      const next = { ...cs };
      for (const [id, x] of Object.entries(info)) if (!next[id] && x.specs.length) next[id] = suggestCatSpecs(x.specs, colsNow, specLabels);
      return next;
    });
  }, [sheet, headerRow, specLabels]);
  const needSpecs = activeCats.filter((id) => !specInfo[id]).sort().join(",");
  useEffect(() => {
    if (!needSpecs) return;
    let off = false;
    categorySpecsInfo(needSpecs.split(",")).then((r) => { if (!off && !("error" in r)) addSpecInfo(r as CategorySpecs); });
    return () => { off = true; };
  }, [needSpecs, addSpecInfo]);
  const askAi = () => {
    if (!file || !sheet) return;
    const seq = ++aiSeq.current;
    setAi("loading");
    const body = new FormData();
    body.set("file", file); body.set("sheet", sheet.name); body.set("headerRow", String(headerRow));
    body.set("config", JSON.stringify({ ...config(), rowCats: undefined, sheetCategoryId: null }));
    fetch("/api/admin/catalog/foreign-import/categories", { method: "POST", body })
      .then(async (r) => { const j = await r.json().catch(() => null); return r.ok && j ? j : { error: String(j?.error ?? "Το AI δεν απάντησε — δοκίμασε ξανά σε λίγο.") }; })
      .catch(() => ({ error: "Το AI δεν απάντησε — δοκίμασε ξανά σε λίγο." }))
      .then((j) => {
        if (seq !== aiSeq.current) return;
        if ("error" in j) { setAi({ error: j.error }); return; }
        setAi({ guesses: j.guesses, asked: j.asked, left: j.left, total: j.total });
        setRowCats(Object.fromEntries((j.guesses as { rowNo: number; categoryId: string }[]).map((g) => [g.rowNo, g.categoryId])));
        addSpecInfo(j.specs as CategorySpecs);
        touch();
      });
  };

  // ---- βήμα 2: ζωντανή εικόνα του αποτελέσματος (οι πρώτες γραμμές του αρχείου, ίδια λογική με τον server) ----
  const brandNameOf = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const lineOf = (r: ForeignRow) => sheet?.preview[r.rowNo - 1] ?? [];
  const brandOf = (r: ForeignRow) => (r.brandId && brandNameOf.get(r.brandId)) || colsOf("brand").map((i) => (lineOf(r)[i] ?? "").trim()).find(Boolean) || "";
  const liveRows = (() => {
    if ((step !== 2 && step !== 3) || !sheet) return [];
    // Μάρκες/κατηγορίες αντιστοιχίζονται στο βήμα 3· για την εικόνα, όσες ταιριάζουν ήδη με δικές μας παίρνουν αυτές
    const cfg = config(), auto = autoMatch(brandVals.values, brands), autoCat = autoMatch(catVals.values, categories);
    cfg.brandMap = Object.fromEntries(brandVals.values.map((v) => [v, cfg.brandMap[v] ?? auto[v] ?? null]));
    cfg.categoryMap = Object.fromEntries(catVals.values.map((v) => [v, cfg.categoryMap[v] ?? autoCat[v] ?? null]));
    const rows = toRows(sheet.preview, headerRow, cfg, (id) => brandNameOf.get(id));
    // οι φωτογραφίες του δεύτερου αρχείου, με το ίδιο ταίριασμα που κάνει ο server στην προεπισκόπηση
    if (mediaExtra && mediaExtra !== "loading" && "rows" in mediaExtra) mergeMedia(rows, mediaExtra.rows);
    return rows;
  })();
  // Πόσες από τις πρώτες γραμμές του φύλλου βρίσκουν φωτογραφίες στο δεύτερο αρχείο (για να φαίνεται αν ταιριάζουν καθόλου)
  const mediaHits = (() => {
    if (!sheet || !mediaExtra || mediaExtra === "loading" || !("rows" in mediaExtra)) return null;
    const rows = toRows(sheet.preview, headerRow, config());
    const before = rows.map((r) => r.media.image.length);
    mergeMedia(rows, mediaExtra.rows);
    return { hit: rows.filter((r, i) => r.media.image.length > before[i]).length, of: rows.length };
  })();
  const liveAt = Math.min(liveIdx, Math.max(0, liveRows.length - 1)), liveRow = liveRows[liveAt];
  // Τιμή και χαρακτηριστικά κατηγορίας από τον server, μόνο για τη γραμμή που φαίνεται (με μικρή καθυστέρηση στις αλλαγές)
  const liveKey = liveRow ? JSON.stringify({ b: liveRow.brandId, c: liveRow.categoryId, cost: liveRow.cost, rrp: liveRow.rrp, s: liveRow.specs, p: priceOpts }) : "";
  useEffect(() => {
    if (!liveKey) return;
    const q = JSON.parse(liveKey);
    let off = false;
    const done = (info: Exclude<LiveInfo, "loading" | null>) => { if (!off) setLiveRes({ key: liveKey, info }); };
    const t = setTimeout(() => { liveCardInfo({ brandId: q.b, categoryId: q.c, cost: q.cost, rrp: q.rrp, specs: q.s, price: q.p }).then(done).catch(() => done({ error: "Η τιμή και τα χαρακτηριστικά δεν φορτώθηκαν." })); }, 350);
    return () => { off = true; clearTimeout(t); };
  }, [liveKey]);
  const liveInfo: LiveInfo = !liveKey ? null : liveRes?.key === liveKey ? liveRes.info : "loading";
  const livePanel = sheet && (
    <aside aria-label="Πώς θα φαίνεται στο eshop" className="rounded-xl border border-eu-line bg-white p-3 md:p-4 min-w-0">
      <LivePreview mediaFile={mediaExtra && mediaExtra !== "loading" && "rows" in mediaExtra ? mediaFile?.name : undefined} rows={liveRows} idx={liveAt} onIdx={setLiveIdx} brandOf={brandOf} settings={settings} total={sheet.rowCount - headerRow - 1} info={liveInfo} />
    </aside>
  );
  const composeLine = (f: ComposeField, r: ForeignRow) => composeValue(f.parts, lineOf(r), brandOf(r));
  const usedInCompose = new Map<number, string>();
  for (const f of compose) for (const p of f.parts) if (p.kind === "col" && !usedInCompose.has(p.col)) usedInCompose.set(p.col, destLabel(f));
  const changeCompose = (c: ComposeField[]) => {
    setCompose(c);
    // στήλη-ερώτηση που μπήκε σε σύνθετο πεδίο: απαντήθηκε (δεν χρειάζεται δικό της στόχο)
    for (const f of c) for (const p of f.parts) if (p.kind === "col" && unsure.has(p.col)) setTarget(p.col, "ignore");
    touch();
  };
  const suggestCompose = (): ComposeField => {
    const nameCol = colsOf("field:name")[0] ?? colsOf("field:shortDesc")[0] ?? colsOf("field:descText")[0], modelCol = colsOf("field:factoryCode")[0];
    return { target: { kind: "field", key: "name" }, parts: [...(nameCol != null ? [{ kind: "col" as const, col: nameCol }] : []), { kind: "brand" as const }, ...(modelCol != null ? [{ kind: "col" as const, col: modelCol }] : [])] };
  };

  const preview = async () => {
    if (!file || !sheet) return;
    setBusy("plan"); setErr(null); setPlan(null);
    try {
      const body = new FormData();
      body.set("file", file); body.set("sheet", sheet.name); body.set("headerRow", String(headerRow)); body.set("config", JSON.stringify(config())); body.set("opts", JSON.stringify(priceOpts));
      if (saveAs.trim()) body.set("saveAs", saveAs.trim());
      if (usedMapping) body.set("mappingId", usedMapping.id);
      if (mediaFile) body.set("mediaFile", mediaFile);
      const r = await fetch("/api/admin/catalog/foreign-import/plan", { method: "POST", body });
      const j = await r.json().catch(() => ({ error: "Η προεπισκόπηση απέτυχε." }));
      if (!r.ok) throw new Error(j.error ?? "Η προεπισκόπηση απέτυχε.");
      setPlan({ jobId: j.jobId, rows: j.rows, writeOn: j.writeOn, ...(j.mediaMatch && mediaFile ? { mediaMatch: { ...j.mediaMatch, file: mediaFile.name } } : {}) });
      // Μόλις αποθηκεύτηκε: ξαναδιαβάζεται, ώστε να φαίνεται ως η αντιστοίχιση σε χρήση
      if (saveAs.trim()) { setSaveAs(""); lookupMapping(headers).then((m) => { if (m) { setSaved(m); setUsedMapping(m); } }).catch(() => {}); }
      setStep(4);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  /** «Νέα προεπισκόπηση» μιας αποθηκευμένης εισαγωγής: ξαναϋπολογίζεται με τον τωρινό διακόπτη και ανοίγει το βήμα 4 (χωρίς αρχείο). */
  const reopen = async (job: RecentJob) => {
    setBusy(`replan:${job.id}`); setErr(null);
    try {
      const r = await replanJob(job.id);
      if ("error" in r) throw new Error(r.error);
      setFile(null); setSheets(null); setSaveAs("");
      setPlan({ jobId: r.jobId, rows: r.rows, writeOn: r.writeOn, reopened: r.fileName });
      setStep(4);
      router.refresh(); // οι μετρητές της λίστας
    } catch (e) { setErr((e as Error).message || "Η νέα προεπισκόπηση απέτυχε."); } finally { setBusy(null); }
  };

  // Στο βήμα 3 μπαίνεις μόνο μέσω goValues (αυτόματη προεπιλογή) και μόνο με έγκυρες στήλες· το 4 θέλει προεπισκόπηση
  const composeMissing = compose.some((f) => f.target.kind === "spec" && !f.target.label.trim() && f.parts.length);
  const colsOk = (mapped > 0 || compose.some((f) => f.parts.length)) && !specMissing && !composeMissing && !unsure.size;
  const can = (s: Step) => s === 1 || (s >= 4 && !!plan) || (!!sheet && (s === 2 || (colsOk && s === 3)));
  const STEPS: [Step, string][] = [[1, "Αρχείο"], [2, "Στήλες"], [3, "Τιμή & κατηγορία"], [4, "Προεπισκόπηση"], [5, "Δημιουργία"]];

  return (
    <div className="grid gap-4 min-w-0">
      <ol data-help="foreign.steps" aria-label="Βήματα" className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STEPS.map(([n, l]) => (
          <li key={n}><button type="button" disabled={!can(n) || !!busy} onClick={() => (n === 3 ? goValues() : setStep(n))} aria-current={step === n ? "step" : undefined}
            className={`w-full flex items-center gap-2 rounded-xl border-2 px-3 min-h-11 md:min-h-9 text-left font-bold text-[length:var(--fs-14)] disabled:opacity-50 disabled:cursor-not-allowed ${step === n ? "border-eu-navy bg-eu-navy text-white" : n < step ? "border-eu-blue/40 bg-eu-chip/40 text-eu-navy" : "border-eu-line bg-white text-eu-ink-3"}`}>
            <span className={`grid place-items-center size-6 shrink-0 rounded-full text-[length:var(--fs-12)] ${step === n ? "bg-white text-eu-navy" : "bg-eu-surface text-eu-ink-2"}`}>{n < step ? <Check className="size-3.5" aria-hidden /> : n}</span>{l}
          </button></li>
        ))}
      </ol>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}

      {step === 1 && (
        <>
          <section data-help="foreign.upload" className={card} aria-labelledby="f-file">
            <div>
              <h3 id="f-file" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">1. Αρχείο</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">.xlsx ή .csv (με ; , ή tab), έως 15 MB και 10.000 γραμμές. Τίποτα δεν γράφεται πριν πατήσεις «Εκτέλεση» στο τελευταίο βήμα. {writeOn ? "Οι αλλαγές προς το SoftOne είναι ανοιχτές: τα κενά στοιχεία των υπαρχόντων ειδών θα γραφτούν στο ERP." : "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne): τα στοιχεία θα μείνουν σε αναμονή, οι φωτογραφίες θα ανέβουν κανονικά."}</p>
            </div>
            <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void inspect(f); }}
              className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-eu-line-2 bg-eu-surface/50 p-4 cursor-pointer hover:border-eu-blue focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-eu-blue min-w-0">
              {busy === "inspect" ? <Loader2 className="size-6 text-eu-blue shrink-0 animate-spin" aria-hidden /> : <Upload className="size-6 text-eu-blue shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 grid">
                <span className="font-bold text-eu-ink text-[length:var(--fs-15)] break-all">{busy === "inspect" ? "Διαβάζω το αρχείο…" : file ? file.name : "Διάλεξε ή σύρε εδώ ένα .xlsx / .csv"}</span>
                <span className="text-eu-muted text-[length:var(--fs-12)]">{file ? `${Math.round(file.size / 1024)} KB${sheets ? ` · ${sheets.length} ${sheets.length === 1 ? "φύλλο" : "φύλλα"}` : ""}` : "Τιμοκατάλογος προμηθευτή, λίστα προϊόντων κ.λπ."}</span>
              </span>
              <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!!busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void inspect(f); e.target.value = ""; }} />
            </label>
            {sheet && (
              <div data-help="foreign.media-file" className="grid gap-1.5 rounded-xl border border-eu-line p-3 min-w-0">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><Images className="size-4 text-eu-blue" aria-hidden /> Οι φωτογραφίες είναι σε άλλο αρχείο; <span className="font-normal text-eu-muted">(προαιρετικό)</span></span>
                <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Δώσε και το Excel με τις διευθύνσεις φωτογραφιών / βίντεο. Τα ταιριάζω με τα προϊόντα από τον κωδικό, το barcode ή το MTRL — από όλα τα φύλλα του — και τα βλέπεις στην προεπισκόπηση.</span>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <label className={`${secondary} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-eu-blue`}><Upload className="size-4" aria-hidden />{mediaFile ? "Άλλο αρχείο" : "Διάλεξε αρχείο φωτογραφιών"}
                    <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickMedia(f); e.target.value = ""; }} />
                  </label>
                  {mediaFile && <><span className="min-w-0 break-all font-bold text-eu-ink text-[length:var(--fs-13)]">{mediaFile.name}</span><button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline" onClick={() => pickMedia(null)}>Αφαίρεση</button></>}
                </div>
                {mediaFile && mediaExtra && (
                  <p role="status" className={`m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] ${mediaExtra !== "loading" && "error" in mediaExtra ? "text-eu-red" : "text-eu-ink-2"}`}>
                    {mediaExtra === "loading" ? <><Loader2 className="size-4 animate-spin shrink-0" aria-hidden />Διαβάζω τις φωτογραφίες…</>
                      : "error" in mediaExtra ? <><CircleAlert className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{mediaExtra.error}</span></>
                      : <><Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{mediaExtra.rows.length === 1 ? "1 γραμμή" : `${mediaExtra.rows.length} γραμμές`} με φωτογραφίες ({((n) => (n === 1 ? "1 φωτογραφία" : `${n} φωτογραφίες`))(mediaExtra.rows.reduce((n, r) => n + r.media.image.length, 0))}). {mediaHits && <> Στις πρώτες {mediaHits.of} γραμμές του φύλλου «{sheet?.name}» βρίσκουν φωτογραφία <strong className={mediaHits.hit ? "" : "text-eu-red"}>{mediaHits.hit}</strong>{mediaHits.hit ? " — φαίνονται στην κάρτα του eshop των επόμενων βημάτων." : ". Έλεγξε ότι οι κωδικοί / barcodes είναι ίδιοι στα δύο αρχεία και ότι διάλεξες το σωστό φύλλο."}</>}</span></>}
                  </p>
                )}
              </div>
            )}
            {sheets && sheets.length > 1 && (
              <label className="grid gap-1 max-w-md">
                <span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Φύλλο</span>
                <select value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); choose(sheets[i], i, sheets[i].headerRow, sheets[i].mapping); }} className={input}>
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name} · {s.rowCount} γραμμές</option>)}
                </select>
              </label>
            )}
          </section>

          {sheet && (
            <section data-help="foreign.header-row" className={card} aria-labelledby="f-head">
              <div>
                <h3 id="f-head" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Γραμμή επικεφαλίδας</h3>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η γραμμή με τους τίτλους των στηλών. Προτείνεται αυτόματα· αν δεν είναι σωστή, διάλεξε άλλη από τις πρώτες {PREVIEW_ROWS}. Οι γραμμές από πάνω αγνοούνται.</p>
              </div>
              <fieldset className="m-0 p-0 border-0 grid gap-1 max-h-96 overflow-y-auto min-w-0">
                <legend className="sr-only">Γραμμή επικεφαλίδας</legend>
                {sheet.preview.map((r, i) => {
                  const cells = r.filter(Boolean);
                  if (!cells.length) return null;
                  const on = i === headerRow;
                  return (
                    <label key={i} className={`flex gap-2 items-start rounded-lg px-2 py-1.5 cursor-pointer min-w-0 ${on ? "bg-eu-navy text-white" : i < headerRow ? "text-eu-muted hover:bg-eu-surface" : "text-eu-ink hover:bg-eu-surface"}`}>
                      <input type="radio" name="headerRow" checked={on} onChange={() => choose(sheet, sheetIdx, i)} className="size-5 mt-0.5 accent-eu-yellow shrink-0" />
                      <span className={`shrink-0 tabular-nums font-bold text-[length:var(--fs-12)] mt-0.5 ${on ? "text-eu-yellow" : "text-eu-muted"}`}>{i + 1}</span>
                      <span className="min-w-0 [overflow-wrap:anywhere] line-clamp-2 text-[length:var(--fs-13)]">{cells.join(" · ")}</span>
                    </label>
                  );
                })}
              </fieldset>
            </section>
          )}

          {sheet && saved && (
            <section data-help="foreign.saved-mapping" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-eu-chip/50 border border-eu-blue/30 p-3 min-w-0">
              <span className="flex gap-2 items-start min-w-0 text-eu-ink text-[length:var(--fs-14)]"><BookmarkCheck className="size-5 text-eu-blue shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{usedMapping?.id === saved.id ? <>Εφαρμόστηκε η αποθηκευμένη αντιστοίχιση «<strong>{saved.name}</strong>».</> : <>Υπάρχει αποθηκευμένη αντιστοίχιση για αυτές τις επικεφαλίδες: «<strong>{saved.name}</strong>».</>}</span>
              </span>
              {usedMapping?.id !== saved.id && <button type="button" className={secondary} onClick={() => initColumns(sheet, headerRow, saved)}>Χρήση αποθηκευμένης αντιστοίχισης «{saved.name}»</button>}
            </section>
          )}

          {sheet && <div className="flex flex-wrap justify-end gap-2"><button type="button" className={primary} onClick={() => setStep(2)}>Στήλες <ArrowRight className="size-4" aria-hidden /></button></div>}

          {recent.length > 0 && (
            <section data-help="foreign.recent" className={card} aria-labelledby="f-recent">
              <div>
                <h3 id="f-recent" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-1.5"><History className="size-4 text-eu-blue" aria-hidden /> Πρόσφατες εισαγωγές</h3>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Οι τελευταίες 10. Η «Νέα προεπισκόπηση» ξαναελέγχει όλες τις γραμμές της εισαγωγής με τα τωρινά δεδομένα και τον τωρινό διακόπτη — π.χ. για τις γραμμές «Σε αναμονή» όταν ανοίξουν οι αλλαγές προς το SoftOne. Δεν χρειάζεται το αρχείο.</p>
              </div>
              <ul className="m-0 p-0 list-none grid gap-2">
                {recent.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-eu-line p-2 min-w-0">
                    <span className="grid gap-0.5 min-w-0 flex-1">
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 break-all">{j.fileName}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-eu-muted text-[length:var(--fs-12)]">
                        <span className="tabular-nums">{when.format(new Date(j.createdAt))}</span>
                        <span className={`${chip} bg-eu-surface text-eu-ink-2`}>{JOB_STATUS[j.status] ?? j.status}</span>
                        {STATUS_ORDER.filter((k) => j.counts[k]).map((k) => <span key={k} className={`${chip} ${STATUS[k].cls}`}>{STATUS[k].label} {j.counts[k]}</span>)}
                      </span>
                    </span>
                    <button type="button" className={secondary} disabled={!!busy} onClick={() => void reopen(j)}>
                      {busy === `replan:${j.id}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Νέα προεπισκόπηση
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {step === 2 && sheet && (() => {
        const all = sheet.cols.map((_, i) => ({ i, h: (headers[i] ?? "").trim(), ex: sheet.preview.slice(headerRow + 1).map((r) => (r[i] ?? "").trim()).filter(Boolean).slice(0, 3) })).filter((c) => c.h || c.ex.length);
        // στήλες που περνούν ως χαρακτηριστικό σε κάποια από τις κατηγορίες της καρτέλας «Κατηγορίες και χαρακτηριστικά»
        const usedCols = new Set([...Object.entries(cols).filter(([, t]) => t !== "ignore").map(([i]) => Number(i)), ...usedInCompose.keys()]);
        const inCats = catUsed;
        const off = all.filter((c) => (cols[c.i] ?? "ignore") === "ignore" && !unsure.has(c.i) && !usedInCompose.has(c.i) && !inCats.has(c.i));
        // Αγνοημένη στήλη με τιμές μένει σε κοινή θέα: μπορεί να είναι χαρακτηριστικό που χάνεται· κρύβονται μόνο οι κενές
        const idle = off.filter((c) => c.ex.length > 0), quiet = off.filter((c) => !c.ex.length);
        const shown = all.filter((c) => !off.includes(c));
        const colRow = (c: (typeof all)[number]) => {
          const v = cols[c.i] ?? "ignore", t = TARGET_OF.get(v), ask = unsure.has(c.i);
          return (
            <li key={c.i} className={`grid grid-cols-[1.75rem_minmax(0,1fr)] sm:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,15rem)] gap-x-3 gap-y-2 items-start px-3 py-2.5 min-w-0 ${ask ? "bg-eu-yellow/15" : ""}`}>
              <span className="font-mono text-eu-ink-3 text-[length:var(--fs-12)] pt-0.5">{colName(c.i)}</span>
              <div className="grid gap-0.5 min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                  {ask && <span className="inline-flex items-center gap-1 rounded-md bg-eu-yellow px-1.5 font-semibold text-eu-navy text-[length:var(--fs-12)]"><HelpCircle className="size-3.5" aria-hidden />Τι είναι;</span>}
                  <span className="font-semibold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{c.h || <span className="text-eu-muted font-normal">(χωρίς τίτλο)</span>}</span>
                </span>
                <span className="text-eu-ink-3 text-[length:var(--fs-12)] truncate">{c.ex.length ? c.ex.join(" · ") : "κενή στις πρώτες γραμμές"}</span>
                {usedInCompose.has(c.i) && <span className="inline-flex items-center gap-1 text-eu-blue text-[length:var(--fs-12)]"><Link2 className="size-3" aria-hidden />μέρος του σύνθετου: {usedInCompose.get(c.i)}</span>}
                {inCats.has(c.i) && v === "ignore" && <span className="inline-flex items-center gap-1 text-eu-blue text-[length:var(--fs-12)]"><ListChecks className="size-3" aria-hidden />χαρακτηριστικό ανά κατηγορία</span>}
                {!ask && t && v !== "ignore" && <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">{t.help}</span>}
              </div>
              <div className="col-span-2 sm:col-span-1 grid gap-2 min-w-0">
                <select aria-label={`Στόχος της στήλης ${colName(c.i)} ${c.h}`} value={ask ? "" : v} onChange={(e) => setTarget(c.i, e.target.value)} className={input}>
                  {ask && <option value="" disabled>Διάλεξε τι είναι…</option>}
                  {TARGETS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((o) => <option key={o.value} value={o.value}>{o.value === "ignore" && usedInCompose.has(c.i) ? "Μόνο στο σύνθετο πεδίο" : o.label}</option>)}</optgroup>)}
                </select>
                {v === "spec" && !ask && <input aria-label={`Ετικέτα χαρακτηριστικού για τη στήλη ${colName(c.i)}`} value={labels[c.i] ?? ""} onChange={(e) => { const nv = e.target.value; setLabels((l) => ({ ...l, [c.i]: nv })); touch(); }} maxLength={80} placeholder="Ετικέτα, π.χ. Χρώμα" className={`${input} ${(labels[c.i] ?? "").trim() ? "" : "border-eu-red"}`} />}
                {ask && <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setTarget(c.i, "spec")}>Χαρακτηριστικό</button><button type="button" className={secondary} onClick={() => setTarget(c.i, "ignore")}>Αγνόηση</button></div>}
              </div>
            </li>
          );
        };
        return (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] items-start min-w-0">
            <div className="grid gap-4 min-w-0">
              <div role="tablist" aria-label="Αντιστοίχιση" data-help="foreign.tabs" className="flex flex-wrap gap-1 border-b border-eu-line min-w-0">
                {([["cols", "Στήλες", Columns3, String(all.length)], ["cats", "Κατηγορίες και χαρακτηριστικά", ListChecks, catBadge]] as const).map(([k, l, Icon, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={catTab === k} onClick={() => setCatTab(k)}
                    className={`-mb-px inline-flex items-center gap-2 px-3 min-h-11 border-b-2 text-[length:var(--fs-14)] transition-colors ${catTab === k ? "border-eu-blue text-eu-ink font-semibold" : "border-transparent text-eu-ink-3 hover:text-eu-ink"}`}>
                    <Icon className="size-4" aria-hidden />{l}{n && <span className={`rounded-md px-1.5 text-[length:var(--fs-12)] tabular-nums ${k === "cats" && catNeeds ? "bg-eu-amber/20 text-eu-ink font-semibold" : "text-eu-muted"}`}>{n}</span>}
                  </button>
                ))}
              </div>
              {catTab === "cats" ? (
                <CategorySpecsTab mode={catMode} onMode={(m) => { setCatMode(m); touch(); }} sheetCategoryId={sheetCategoryId} onSheetCategory={(v) => { setSheetCategoryId(v); touch(); }} catOpts={catOpts}
                  columnCats={columnCats} ai={ai} onAsk={askAi} aiDisabled={!file ? "Χρειάζεται το αρχείο στον browser — ανέβασέ το ξανά στο βήμα 1." : null}
                  rowCats={rowCats} onRowCat={(rowNos, id) => { setRowCats((m) => { const x = { ...m }; for (const n of rowNos) { if (id) x[n] = id; else delete x[n]; } return x; }); touch(); }}
                  specInfo={specInfo} cols={catCols(all)} catSpecs={catSpecs} onCatSpec={setCatSpec} usedCols={usedCols} />
              ) : (<>
              <section data-help="foreign.columns" className="rounded-xl border border-eu-line bg-white min-w-0" aria-labelledby="f-cols">
                <div className="grid gap-1 p-3 md:p-4 border-b border-eu-line">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="f-cols" className="m-0 font-heading font-semibold text-eu-ink text-[length:var(--fs-16)]">Τι είναι κάθε στήλη</h3>
                    <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{shown.length} από {all.length} χρησιμοποιούνται</span>
                  </div>
                  <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[70ch]">Η πρόταση βγαίνει από τον τίτλο της στήλης — άλλαξέ τη όπου χρειάζεται. Στα υπάρχοντα είδη γράφονται <strong className="font-semibold text-eu-ink-2">μόνο τα κενά</strong> πεδία. Δεξιά βλέπεις αμέσως πώς θα βγει το προϊόν.</p>
                </div>
                {unsure.size > 0 && (
                  <div data-help="foreign.questions" role="status" className="grid gap-2 border-b border-eu-line bg-eu-yellow/15 px-3 py-2.5 text-eu-ink text-[length:var(--fs-13)]">
                    <p className="m-0 flex gap-2 items-start"><HelpCircle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0"><strong className="font-semibold">Δεν κατάλαβα {unsure.size === 1 ? "1 στήλη" : `${unsure.size} στήλες`}.</strong> Πες τι είναι η καθεμία, ή απάντησε για όλες μαζί. Δεν προχωράμε πριν απαντηθούν, για να μη χαθεί κάτι χωρίς να το ξέρεις.</span></p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={secondary} onClick={() => answerAll("spec")}>Όλες είναι χαρακτηριστικά</button>
                      <button type="button" className={secondary} onClick={() => answerAll("ignore")}>Αγνόησέ τες όλες</button>
                    </div>
                  </div>
                )}
                {!hasKey && <p className="m-0 flex gap-2 items-start border-b border-eu-line bg-eu-yellow/15 px-3 py-2.5 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />Καμία στήλη-κλειδί (κωδικός, EAN, κωδικός κατασκευαστή ή MTRL): κανένα είδος δεν θα αναγνωριστεί — όλες οι γραμμές θα βγουν «νέα είδη».</p>}
                <ul className="m-0 p-0 list-none divide-y divide-eu-line min-w-0">{shown.map(colRow)}</ul>
                {idle.length > 0 && (
                  <div data-help="foreign.idle" className="border-t border-eu-line">
                    <div className="grid gap-2 bg-eu-amber/10 px-3 py-2.5 text-[length:var(--fs-13)]">
                      <p className="m-0 flex gap-2 items-start text-eu-ink"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0"><strong className="font-semibold">{idle.length === 1 ? "1 στήλη έχει τιμές αλλά δεν περνά πουθενά" : `${idle.length} στήλες έχουν τιμές αλλά δεν περνούν πουθενά`}.</strong> Αν είναι χαρακτηριστικά (χωρητικότητα, τύπος, ισχύς…), αντιστοίχισέ τες στα χαρακτηριστικά κάθε κατηγορίας (ή «Χαρακτηριστικό» για όλα τα προϊόντα)· αλλιώς άφησέ τες στην αγνόηση.</span></p>
                      <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setCatTab("cats")}><ListChecks className="size-4" aria-hidden />Αντιστοίχισέ τες ανά κατηγορία</button><button type="button" className={secondary} onClick={() => idle.forEach((c) => setTarget(c.i, "spec"))}>{idle.length === 1 ? "Κάν' τη χαρακτηριστικό για όλα" : "Κάν' τες χαρακτηριστικά για όλα"}</button></div>
                    </div>
                    <ul className="m-0 p-0 list-none divide-y divide-eu-line border-t border-eu-line min-w-0">{idle.map(colRow)}</ul>
                  </div>
                )}
                {quiet.length > 0 && (
                  <details className="border-t border-eu-line group">
                    <summary className="flex items-center gap-2 px-3 min-h-11 cursor-pointer text-eu-ink-3 text-[length:var(--fs-13)] hover:text-eu-ink"><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />{quiet.length === 1 ? "1 κενή στήλη αγνοείται" : `${quiet.length} κενές στήλες αγνοούνται`}: {quiet.slice(0, 4).map((c) => c.h || colName(c.i)).join(", ")}{quiet.length > 4 ? "…" : ""}</summary>
                    <ul className="m-0 p-0 list-none divide-y divide-eu-line border-t border-eu-line min-w-0">{quiet.map(colRow)}</ul>
                  </details>
                )}
              </section>

              <ComposeBuilder compose={compose} onChange={changeCompose} rows={liveRows} line={composeLine} suggest={suggestCompose}
                columns={all.map((c) => ({ i: c.i, letter: colName(c.i), title: c.h || "(χωρίς τίτλο)" }))} />
              </>)}
            </div>

            {livePanel}
          </div>

          <section data-help="foreign.sheet-defaults" className={card} aria-labelledby="f-def">
            <div>
              <h3 id="f-def" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Για όλο το φύλλο</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Όταν το αρχείο δεν έχει στήλη μάρκας (π.χ. τιμοκατάλογος μίας μάρκας) ή το κελί είναι κενό. Η μάρκα βοηθά να βρεθεί το είδος από τον κωδικό κατασκευαστή και ορίζει τη μάρκα των νέων ειδών. Η κατηγορία ορίζεται στο επόμενο βήμα.</p>
            </div>
            {!colsOf("brand").length && !sheetBrandId && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><HelpCircle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">Το αρχείο δεν έχει στήλη μάρκας. Διάλεξε εδώ τη μάρκα όλων των προϊόντων του φύλλου — χωρίς αυτήν τα <strong>νέα είδη</strong> δεν δημιουργούνται. Για ενημέρωση υπαρχόντων δεν χρειάζεται.</span></p>}
            <div className="grid gap-1 content-start min-w-0 max-w-md"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Μάρκα για όλο το φύλλο</span><OptionPicker label="Μάρκα για όλο το φύλλο" options={brandOpts} value={sheetBrandId} onChange={(v) => { setSheetBrandId(v); touch(); }} empty="Καμία (από τη στήλη)" /></div>
            <label className="grid gap-1 max-w-md">
              <span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Αποθήκευση αντιστοίχισης ως… (προαιρετικό)</span>
              <input value={saveAs} onChange={(e) => setSaveAs(e.target.value)} maxLength={80} placeholder={usedMapping ? usedMapping.name : "π.χ. Τιμοκατάλογος Allwan"} className={input} />
              <span className="text-eu-muted text-[length:var(--fs-12)]">Την επόμενη φορά που θα ανεβάσεις αρχείο με τις ίδιες επικεφαλίδες θα σου προταθεί αυτόματα. Αποθηκεύεται με την προεπισκόπηση.</span>
            </label>
          </section>

          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={secondary} onClick={() => setStep(1)}><ArrowLeft className="size-4" aria-hidden /> Αρχείο</button>
            <span className="flex flex-wrap items-center gap-2">
              {unsure.size > 0 ? <span className="text-eu-ink text-[length:var(--fs-13)]">Απάντησε πρώτα για {unsure.size === 1 ? "τη στήλη" : `τις ${unsure.size} στήλες`} με «Τι είναι;».</span> : (specMissing || composeMissing) && <span className="text-eu-red text-[length:var(--fs-13)]">Συμπλήρωσε τις ετικέτες χαρακτηριστικών.</span>}
              <button type="button" className={primary} disabled={!colsOk} onClick={goValues}>Τιμή &amp; κατηγορία <ArrowRight className="size-4" aria-hidden /></button>
            </span>
          </div>
        </>
      );
      })()}

      {step === 3 && sheet && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] items-start min-w-0">
          <div className="grid gap-4 min-w-0">
          <section data-help="foreign.price" className={card} aria-labelledby="f-price">
            <div>
              <h3 id="f-price" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">3. Τιμή πώλησης</h3>
              {(costCol || retailCol) && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Από ποια στήλη ξεκινά η τιμή, αν το ποσό του αρχείου έχει ΦΠΑ και αν μπαίνει markup. Η τελική τιμή είναι πάντα με ΦΠΑ.</p>}
            </div>
            {!costCol && !retailCol ? (
              <div className="grid gap-2 rounded-lg bg-eu-yellow/20 px-3 py-3 text-eu-ink">
                <p className="m-0 flex gap-2 items-start font-bold text-[length:var(--fs-15)]"><AlertTriangle className="size-5 text-eu-navy shrink-0" aria-hidden />Αυτό το αρχείο δεν έχει τιμές</p>
                <ul className="m-0 pl-5 grid gap-1 text-[length:var(--fs-14)]">
                  <li>Δεν βρήκα στήλη με κόστος ή λιανική, άρα δεν έχω από πού να βγάλω τιμή πώλησης.</li>
                  <li>Μπορείς να συνεχίσεις: τα προϊόντα θα εισαχθούν <strong>χωρίς τιμή</strong> και στο eshop θα γράφουν «Τιμή στο κατάστημα» μέχρι να τη βάλεις στο SoftOne.</li>
                  <li>Αν το αρχείο έχει στήλη τιμής που δεν αναγνώρισα, δείξε μου ποια είναι.</li>
                </ul>
                <div><button type="button" className={secondary} onClick={() => setStep(2)}><ArrowLeft className="size-4" aria-hidden /> Να ορίσω στήλη τιμής</button></div>
              </div>
            ) : <PriceOptions value={priceOpts} onChange={(v) => { setPriceOpts(v); touch(); }} costCol={costCol} retailCol={retailCol} />}
          </section>
          <section data-help="foreign.category" className={card} aria-labelledby="f-cat">
            <div>
              <h3 id="f-cat" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-1.5"><FolderTree className="size-4 text-eu-blue" aria-hidden /> Κατηγορία στο eshop</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Σε ποια κατηγορία του site μπαίνουν τα νέα προϊόντα. Η κατηγορία ορίζει και την ομάδα χαρακτηριστικών τους και τον κανόνα τιμής. Τα υπάρχοντα είδη κρατούν την κατηγορία που έχουν.</p>
            </div>
            {catCol
              ? <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-chip/60 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><Check className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">Η κατηγορία κάθε προϊόντος βγαίνει από τη στήλη «<strong>{catCol}</strong>»: αντιστοίχισε πιο κάτω κάθε τιμή της με δική μας κατηγορία ({catVals.values.filter((v) => categoryMap[v]).length} από {catVals.values.length} έτοιμες). Η επιλογή εδώ ισχύει για όσα μείνουν χωρίς αντιστοίχιση.</span></p>
              : <p className="m-0 text-eu-ink text-[length:var(--fs-14)]">Το αρχείο δεν έχει στήλη κατηγορίας, οπότε διαλέγεις <strong>μία κατηγορία για όλα τα προϊόντα του φύλλου</strong>.</p>}
            <div className="grid gap-1 content-start min-w-0 max-w-xl"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">{catCol ? "Κατηγορία για όσα μείνουν χωρίς αντιστοίχιση" : "Κατηγορία για όλο το φύλλο"}</span><OptionPicker label="Κατηγορία για όλο το φύλλο" options={catOpts} value={sheetCategoryId} onChange={(v) => { setSheetCategoryId(v); touch(); }} empty="Καμία" /></div>
            {sheetCategoryId
              ? <p className="m-0 flex gap-2 items-start text-eu-ink text-[length:var(--fs-13)]"><Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{catCol ? "Όσα δεν έχουν αντιστοίχιση" : "Όλα τα νέα προϊόντα"} θα μπουν στην «{catOpts.find((c) => c.id === sheetCategoryId)?.name ?? "—"}».</span></p>
              : !catCol && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">Χωρίς κατηγορία τα νέα προϊόντα δεν δημιουργούνται αμέσως: στο βήμα 5 θα χρειαστεί να ορίσεις ομάδα χαρακτηριστικών σε καθένα ξεχωριστά.</span></p>}
          </section>
          <section data-help="foreign.values" className={card} aria-labelledby="f-vals">
            <div>
              <h3 id="f-vals" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Μάρκες και κατηγορίες του αρχείου</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κάθε τιμή του αρχείου με δική μας μάρκα / κατηγορία. Όσα έχουν ίδιο όνομα προεπιλέγονται· ό,τι μείνει χωρίς επιλογή παίρνει την τιμή «για όλο το φύλλο» (αν έχεις ορίσει) ή μένει κενό.</p>
            </div>
            {!colsOf("brand").length && !colsOf("category").length && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν αντιστοιχίστηκε στήλη μάρκας ή κατηγορίας — δεν χρειάζεται κάτι εδώ.</p>}
            {[{ kind: "brand" as const, title: "Μάρκες", vals: brandVals, map: brandMap, set: setBrandMap, opts: brandOpts }, { kind: "category" as const, title: "Κατηγορίες", vals: catVals, map: categoryMap, set: setCategoryMap, opts: catOpts }]
              .filter((g) => colsOf(g.kind).length).map((g) => (
                <div key={g.kind} className="grid gap-2 min-w-0">
                  <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{g.title} <span className="text-eu-muted font-normal">· {g.vals.values.length} τιμές{g.vals.values.length ? ` · ${g.vals.values.filter((v) => g.map[v]).length} αντιστοιχισμένες` : ""}</span></h4>
                  {g.vals.many && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />Η στήλη έχει πάνω από 300 διαφορετικές τιμές — μάλλον δεν είναι {g.kind === "brand" ? "μάρκα" : "κατηγορία"}. Έλεγξε την αντιστοίχιση στο βήμα 2.</p>}
                  <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
                    {g.vals.values.map((v) => (
                      <li key={v} className="grid gap-1 rounded-lg border border-eu-line p-2 min-w-0">
                        <span className="font-bold text-eu-ink text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere]">{v}</span>
                        <OptionPicker label={`${g.kind === "brand" ? "Μάρκα" : "Κατηγορία"} για «${v}»`} options={g.opts} value={g.map[v] ?? null} onChange={(id) => { g.set((m) => ({ ...m, [v]: id })); touch(); }} empty="Χωρίς αντιστοίχιση" />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </section>
          </div>
          {livePanel}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={secondary} onClick={() => setStep(2)}><ArrowLeft className="size-4" aria-hidden /> Στήλες</button>
            <button type="button" className={primary} disabled={!!busy} onClick={preview}>{busy === "plan" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />} Προεπισκόπηση</button>
          </div>
          {busy === "plan" && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Βρίσκω τα είδη στο SoftOne και υπολογίζω τις αλλαγές — σε μεγάλα αρχεία μπορεί να πάρει λίγο.</p>}
        </>
      )}

      {step === 4 && plan && <Preview key={`${plan.jobId}:${plan.rows.length}:${plan.reopened ?? ""}`} plan={plan} canSync={canSync} settings={settings} backLabel={sheet ? "Τιμή & κατηγορία" : "Αρχείο"} onBack={() => { if (sheet) setStep(3); else { setPlan(null); setStep(1); } }} onNext={() => setStep(5)}
        onReplanned={(r) => setPlan((p) => (p ? { ...p, rows: r.rows, writeOn: r.writeOn } : p))} />}
      {step === 5 && plan && <Finish jobId={plan.jobId} brands={brandOpts} settings={settings} onBack={() => setStep(4)} />}
    </div>
  );
}

// ======================= 4. Προεπισκόπηση & εκτέλεση =======================

/** note = εκτελέστηκε χωρίς σφάλμα αλλά με δικό της μήνυμα (π.χ. ήδη στη λίστα «Νέα είδη») */
type RowResult = { ok: boolean; text: string; note?: boolean };

function Preview({ plan, canSync, settings, onBack, onNext, onReplanned, backLabel }: { plan: Plan; canSync: boolean; settings: Settings; onBack: () => void; onNext: () => void; /** οι κατηγορίες που δέχτηκε ο χρήστης μπήκαν στις γραμμές — νέο σχέδιο */ onReplanned: (r: { rows: ForeignPlanRow[]; writeOn: boolean }) => void; backLabel: string }) {
  /** νέα είδη χωρίς κατηγορία eshop: γι' αυτά προτείνει το AI, όταν το ζητήσει ο χρήστης */
  const noCategory = plan.rows.filter((r) => r.status === "new" && r.card && !r.card.category).length;
  const [ai, setAi] = useState<Exclude<JobCategoryAi, { error: string }> | null>(null);
  const [aiBusy, setAiBusy] = useState<"ask" | "apply" | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const askAi = async () => {
    setAiErr(null); setAi(null); setAiBusy("ask");
    let r: JobCategoryAi;
    try { r = await suggestJobCategories(plan.jobId); } catch { r = { error: "Η σύνδεση διακόπηκε." }; }
    setAiBusy(null);
    if ("error" in r) setAiErr(r.error); else setAi(r);
  };
  const applyAi = async (picks: { key: string; categoryId: string }[]) => {
    if (!ai) return;
    setAiBusy("apply"); setAiErr(null);
    let r;
    try { r = await applyJobCategories(plan.jobId, picks.map((p) => ({ rowNo: Number(p.key), categoryId: p.categoryId }))); } catch { r = { error: "Η σύνδεση διακόπηκε." }; }
    setAiBusy(null);
    if ("error" in r) { setAiErr(r.error); return; }
    setAi(null); onReplanned(r);
  };
  /** μία κάρτα ανοιχτή τη φορά (η κάρτα του site θέλει μοναδικό όνομα μετάβασης στη σελίδα) */
  const [cardRow, setCardRow] = useState<number | null>(null);
  const writeOn = plan.writeOn;
  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { update: 0, unchanged: 0, new: 0, waiting: 0, problem: 0 };
    for (const r of plan.rows) c[r.status]++;
    return c;
  }, [plan.rows]);
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [page, setPage] = useState(0);
  // Προεπιλογή: ενημερώσεις, νέα ΚΑΙ «σε αναμονή» (οι φωτογραφίες τους περνούν και με κλειστό SoftOne)
  const [sel, setSel] = useState<Set<number>>(() => new Set(plan.rows.filter((r) => (r.status === "update" || r.status === "new" || r.status === "waiting") && !r.webExcluded).map((r) => r.rowNo)));
  const excludedCount = plan.rows.filter((r) => r.webExcluded && r.status !== "problem" && r.status !== "unchanged").length;
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const blocked = writeOn && !canSync ? "Η εγγραφή στο SoftOne είναι ανοιχτή: για εκτέλεση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." : null;

  const shown = useMemo(() => plan.rows.filter((r) => filter === "all" || r.status === filter), [plan.rows, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const pageRows = shown.slice(cur * PAGE, cur * PAGE + PAGE);
  const statusOf = useMemo(() => new Map(plan.rows.map((r) => [r.rowNo, r.status])), [plan.rows]);
  const todo = plan.rows.filter((r) => sel.has(r.rowNo) && r.status !== "problem" && !results[r.rowNo]?.ok);
  const pendingDone = Object.entries(results).filter(([n, r]) => r.ok && !r.note && statusOf.get(Number(n)) === "new").length;

  const toggle = (n: number) => setSel((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const setMany = (rows: ForeignPlanRow[], on: boolean) => setSel((s) => { const x = new Set(s); for (const r of rows) if (r.status !== "problem") { if (on) x.add(r.rowNo); else x.delete(r.rowNo); } return x; });

  const run = async () => {
    if (!todo.length || blocked) return;
    const ex = todo.filter((r) => r.status !== "new").length, nw = todo.length - ex;
    const what = [ex ? `${ex} υπάρχοντα είδη ${writeOn ? "θα πάρουν τα κενά τους στοιχεία στο SoftOne και τις νέες φωτογραφίες" : "θα πάρουν τις νέες φωτογραφίες (τα στοιχεία μένουν σε αναμονή)"}` : "", nw ? `${nw} νέα είδη θα ετοιμαστούν για δημιουργία (τα δημιουργείς στο επόμενο βήμα)` : ""].filter(Boolean).join(" και ");
    if (!confirm(`Εκτέλεση ${todo.length} ${todo.length === 1 ? "γραμμής" : "γραμμών"}: ${what}. Συνέχεια;`)) return;
    setErr(null);
    const rows = todo.map((r) => r.rowNo);
    setProgress({ done: 0, total: rows.length }); setRunning(true);
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      let res;
      try { res = await runForeignBatch(plan.jobId, part, plan.writeOn); } catch (e) { res = { error: (e as Error).message || "Η σύνδεση διακόπηκε." }; }
      if ("error" in res) { setErr(`${res.error} — όσα έγιναν μέχρι εδώ έμειναν· πάτα ξανά «Εκτέλεση» για τα υπόλοιπα.`); setRunning(false); return; }
      const errs = new Map(res.errors.map((e) => [e.rowNo, e.error]));
      const notes = new Map((res.notes ?? []).map((x) => [x.rowNo, x.note]));
      setResults((prev) => {
        const next = { ...prev };
        for (const n of part) next[n] = errs.has(n) ? { ok: false, text: errs.get(n)! } : notes.has(n) ? { ok: true, text: notes.get(n)!, note: true } : { ok: true, text: DONE_TEXT[statusOf.get(n) ?? "unchanged"] };
        return next;
      });
      setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
    }
    setRunning(false);
  };
  const okCount = Object.values(results).filter((r) => r.ok).length, failCount = Object.values(results).filter((r) => !r.ok).length;

  return (
    <section data-help="foreign.preview" className={card} aria-labelledby="f-plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="f-plan" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] min-w-0 [overflow-wrap:anywhere]">4. Προεπισκόπηση{plan.reopened ? ` · ${plan.reopened}` : ""}</h3>
        <span className="text-eu-muted text-[length:var(--fs-13)]">{plan.rows.length} γραμμές</span>
      </div>
      <p className={`m-0 flex gap-2 items-start rounded-lg px-3 py-2 text-eu-ink text-[length:var(--fs-13)] ${writeOn ? "bg-eu-chip/60" : "bg-eu-yellow/20"}`}>
        {writeOn ? <Check className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /> : <Clock className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />}
        {writeOn ? "Οι αλλαγές θα γραφτούν στο SoftOne — μόνο κενά πεδία." : "Οι αλλαγές προς το SoftOne είναι κλειστές — τα στοιχεία θα μείνουν σε αναμονή, οι φωτογραφίες θα ανέβουν."}
      </p>
      {plan.mediaMatch && (
        <p className={`m-0 flex gap-2 items-start rounded-lg px-3 py-2 text-eu-ink text-[length:var(--fs-13)] ${plan.mediaMatch.matched === plan.mediaMatch.total ? "bg-eu-green/12" : "bg-eu-yellow/20"}`}>
          <Images className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">Φωτογραφίες από «{plan.mediaMatch.file}»: <strong>{plan.mediaMatch.matched} από {plan.mediaMatch.total}</strong> γραμμές του βρήκαν προϊόν σε αυτό το φύλλο.{plan.mediaMatch.matched < plan.mediaMatch.total ? " Οι υπόλοιπες είναι για προϊόντα άλλου φύλλου ή έχουν κωδικό που δεν υπάρχει εδώ — δεν χρησιμοποιούνται." : ""}</span>
        </p>
      )}
      {noCategory > 0 && (
        <div data-help="foreign.category-ai" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-eu-yellow/20 px-3 py-2 min-w-0">
          <span className="flex gap-2 items-start text-eu-ink text-[length:var(--fs-13)] min-w-0"><FolderTree className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0"><strong>{noCategory} νέα {noCategory === 1 ? "είδος δεν έχει" : "είδη δεν έχουν"} κατηγορία eshop.</strong> Μπορώ να προτείνω κατηγορία για το καθένα από το όνομα και την περιγραφή του· εσύ βλέπεις τις προτάσεις και δέχεσαι όσες θέλεις.</span></span>
          <button type="button" className={secondary} disabled={!!aiBusy || running} onClick={askAi}>{aiBusy === "ask" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {aiBusy === "ask" ? "Ρωτάω το AI…" : "Πρότεινε κατηγορία"}</button>
        </div>
      )}
      {aiErr && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{aiErr}</span></p>}
      {ai && <CategoryProposals key={ai.guesses.map((g) => g.key).join()} asked={ai.asked} left={ai.left} busy={aiBusy === "apply"} onClose={() => setAi(null)} onApply={applyAi} options={ai.options}
        rows={ai.guesses.map((g) => ({ key: g.key, label: g.label || `γραμμή ${g.key}`, sub: `γραμμή ${g.key}`, categoryId: g.categoryId, sure: g.sure }))} />}
      {excludedCount > 0 && (
        <p data-help="foreign.web-excluded" className="m-0 flex gap-2 items-start rounded-lg bg-eu-surface px-3 py-2 text-eu-ink text-[length:var(--fs-13)]">
          <EyeOff className="size-4 text-eu-ink-2 shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0"><strong>{excludedCount} {excludedCount === 1 ? "είδος έχει" : "είδη έχουν"} «Εξαίρεση Web» στο SoftOne</strong> και δεν {excludedCount === 1 ? "ανεβαίνει" : "ανεβαίνουν"} στο site. Δεν {excludedCount === 1 ? "είναι προεπιλεγμένο" : "είναι προεπιλεγμένα"}: τσέκαρε όσα θέλεις να ενημερωθούν παρ&apos; όλα αυτά.</span>
        </p>
      )}
      <div role="tablist" aria-label="Φίλτρο γραμμών" className="flex flex-wrap gap-2">
        {(["all", ...STATUS_ORDER] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setPage(0); }} disabled={k !== "all" && !counts[k]}
            className={`${btn} px-3 ${filter === k ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip"}`}>
            {k === "all" ? "Όλες" : STATUS[k].label} <span className="tabular-nums opacity-80">{k === "all" ? plan.rows.length : counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
        <span className="text-eu-ink-3">Επιλεγμένες: <strong className="text-eu-ink tabular-nums">{sel.size}</strong></span>
        <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setMany(shown, true)}>Όλες του φίλτρου</button>
        <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setMany(shown, false)}>Καμία του φίλτρου</button>
      </div>

      <ul className="m-0 p-0 list-none grid gap-2">
        {pageRows.map((r) => <PlanItem key={r.rowNo} r={r} checked={sel.has(r.rowNo)} onToggle={() => toggle(r.rowNo)} res={results[r.rowNo]} disabled={running}
          cardOpen={cardRow === r.rowNo} onCard={() => setCardRow(cardRow === r.rowNo ? null : r.rowNo)} settings={settings} />)}
        {!pageRows.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Καμία γραμμή σε αυτό το φίλτρο.</li>}
      </ul>
      {pages > 1 && (
        <nav aria-label="Σελίδες" className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={secondary} disabled={cur === 0} onClick={() => setPage(cur - 1)}><ArrowLeft className="size-4" aria-hidden /> Προηγούμενες</button>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{cur * PAGE + 1}–{Math.min(shown.length, cur * PAGE + PAGE)} από {shown.length}</span>
          <button type="button" className={secondary} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Επόμενες <ArrowRight className="size-4" aria-hidden /></button>
        </nav>
      )}

      {okCount > 0 && !running && (
        <p role="status" className="m-0 flex flex-wrap gap-x-3 gap-y-2 items-center justify-between rounded-lg bg-eu-green/12 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
          <span className="flex gap-2 items-start min-w-0"><Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{pendingDone > 0 ? `${pendingDone} νέα είδη είναι έτοιμα για δημιουργία στο SoftOne και στο eshop.` : "Η εκτέλεση ολοκληρώθηκε."} Στο τελευταίο βήμα βλέπεις και ποια προϊόντα της μάρκας λείπουν από το αρχείο.</span></span>
          <button type="button" className={primary} onClick={onNext}>Δημιουργία <ArrowRight className="size-4" aria-hidden /></button>
        </p>
      )}
      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {blocked && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />{blocked}</p>}

      <div data-help="foreign.run" className="sticky bottom-2 z-10 grid gap-2 rounded-2xl bg-eu-navy text-white px-4 py-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} disabled={running} className={`${btn} border-2 border-white/60 text-white hover:bg-white/10`}><ArrowLeft className="size-4" aria-hidden /> {backLabel}</button>
          <span className="text-[length:var(--fs-14)] min-w-0" aria-live="polite">
            {progress ? `${progress.done}/${progress.total} · ${okCount} έγιναν${failCount ? ` · ${failCount} με σφάλμα` : ""}` : `${todo.length} προς εκτέλεση`}
          </span>
          <button type="button" onClick={run} disabled={!todo.length || running || !!blocked} className={`${btn} bg-eu-yellow text-eu-navy hover:bg-white`}>
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Εκτέλεση {todo.length || ""}
          </button>
        </div>
        {progress && <progress value={progress.done} max={progress.total || 1} aria-label="Πρόοδος εκτέλεσης" className="w-full h-2 appearance-none rounded-full overflow-hidden bg-white/20 [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-eu-yellow [&::-moz-progress-bar]:bg-eu-yellow" />}
      </div>
    </section>
  );
}

function PlanItem({ r, checked, onToggle, res, disabled, cardOpen, onCard, settings }: { r: ForeignPlanRow; checked: boolean; onToggle: () => void; res?: RowResult; disabled: boolean; cardOpen: boolean; onCard: () => void; settings: Settings }) {
  const st = STATUS[r.status];
  const problem = r.status === "problem";
  return (
    <li className={`rounded-xl border p-3 grid gap-1.5 min-w-0 ${res ? (res.ok ? "border-eu-green/50" : "border-eu-red/50") : "border-eu-line"}`}>
      <div className="flex items-start gap-2 min-w-0">
        <input type="checkbox" checked={checked && !problem} disabled={problem || disabled} onChange={onToggle} aria-label={`Επιλογή γραμμής ${r.rowNo}`} className="size-5 mt-0.5 accent-eu-navy shrink-0 disabled:opacity-40" />
        <div className="grid gap-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className={`${chip} ${st.cls}`}>{st.label}</span>
            {r.webExcluded && <span className={`${chip} bg-eu-surface text-eu-ink-2 inline-flex items-center gap-1`}><EyeOff className="size-3" aria-hidden />Εξαίρεση Web</span>}
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere]">{r.title || "—"}</span>
            <span className="min-w-0 break-all text-eu-muted text-[length:var(--fs-12)]">γραμμή {r.rowNo}{r.mtrl ? ` · MTRL ${r.mtrl}` : ""}{r.code ? ` · ${r.code}` : ""}{r.matchedBy ? ` · ταίριαξε με: ${MATCHED_BY[r.matchedBy]}` : ""}</span>
          </div>
          {r.fileName && r.fileName !== r.title && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] min-w-0 [overflow-wrap:anywhere]">Στο αρχείο: <span className="text-eu-ink">{r.fileName}</span></p>}
          {r.problem && <p className="m-0 flex gap-1.5 items-start text-eu-red text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{r.problem}</span></p>}
          {r.changes.length > 0 && !problem && (
            <ul className="m-0 p-0 list-none grid gap-0.5 text-[length:var(--fs-13)]">
              {r.changes.slice(0, 8).map((c, i) => <li key={i} className="min-w-0 [overflow-wrap:anywhere]"><span className="text-eu-ink-3">{c.label}:</span> {r.status !== "new" && <><s className="text-eu-muted">{c.from || "—"}</s> → </>}<strong className="text-eu-ink">{c.to}</strong></li>)}
              {r.changes.length > 8 && <li className="text-eu-muted">+{r.changes.length - 8} ακόμη</li>}
            </ul>
          )}
          {(r.media > 0 || r.price) && !problem && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
              {r.media > 0 && <span className="inline-flex items-center gap-1 text-eu-ink-2"><Images className="size-3.5" aria-hidden /> {r.media} {r.media === 1 ? "νέο πολυμέσο" : "νέα πολυμέσα"}</span>}
              {r.price && (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-eu-ink-2">
                  Τιμή web: {r.price.was != null && <><s className="text-eu-muted tabular-nums">{eur.format(r.price.was)}</s> → </>}<strong className="text-eu-ink tabular-nums">{eur.format(r.price.price)}</strong>
                  {r.price.was != null && <span className={`${chip} bg-eu-yellow/30 text-eu-ink`}>αύξηση {eur.format(r.price.price - r.price.was)}</span>}
                  <span className="text-eu-muted">από κόστος <span className="tabular-nums">{eur.format(r.price.cost)}</span></span>
                  {r.price.capped && <span className={`${chip} bg-eu-yellow/30 text-eu-ink`}>πλαφόν</span>}
                  <span className="text-eu-muted">· {r.price.rule} · περιθώριο <span className="tabular-nums">{eur.format(r.price.margin)}</span></span>
                </span>
              )}
            </div>
          )}
          {r.status === "new" && r.card && <p className="m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere]"><FolderTree className={`size-3.5 shrink-0 mt-0.5 ${r.card.category ? "text-eu-blue" : "text-eu-ink-3"}`} aria-hidden /><span className="min-w-0"><span className="text-eu-ink-3">Κατηγορία eshop:</span> {r.card.category ? <strong className="text-eu-ink">{r.card.category}</strong> : <span className="text-eu-ink-3">καμία — όρισέ τη στο βήμα «Τιμή & κατηγορία»</span>}</span></p>}
          {r.card && !problem && (
            <CardPeek open={cardOpen} onToggle={onCard} settings={settings}
              data={{ key: String(r.rowNo), title: r.title, sku: r.code, brand: r.card.brand, images: r.card.images, price: r.price?.price ?? r.card.current ?? null }}
              notes={[r.status === "new" ? "Ενεργειακή κλάση, απόθεμα και προσφορές μπαίνουν μετά τη δημιουργία." : r.price ? "Η τιμή είναι αυτή που θα γράψει η εισαγωγή." : "Η τιμή είναι αυτή που έχει ήδη το είδος."]} />
          )}
          {r.warnings.slice(0, 4).map((w, i) => <p key={i} className="m-0 flex gap-1.5 items-start text-eu-ink-3 text-[length:var(--fs-12)] min-w-0 [overflow-wrap:anywhere]"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{w}</span></p>)}
          {r.warnings.length > 4 && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">+{r.warnings.length - 4} ακόμη προειδοποιήσεις</p>}
          {res && <p className={`m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere] ${res.ok ? "text-eu-ink" : "text-eu-red"}`}>{res.ok ? <Check className="size-3.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}<span className="min-w-0">{res.text}</span></p>}
        </div>
      </div>
    </li>
  );
}

// ======================= 5. Δημιουργία νέων ειδών & όσα λείπουν από το αρχείο =======================

function Finish({ jobId, brands, settings, onBack }: { jobId: string; brands: PickOpt[]; settings: Settings; onBack: () => void }) {
  const [data, setData] = useState<Exclude<FinishData, { error: string }> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [off, setOff] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    finishData(jobId).then((r) => { if ("error" in r) setErr(r.error); else { setErr(null); setData(r); } }).catch(() => setErr("Η σύνδεση διακόπηκε — ξαναδοκίμασε."));
  }, [jobId]);
  useEffect(load, [load]);

  if (!data) return (
    <section className={card}>
      {err ? <p role="alert" className="m-0 flex gap-2 items-start text-eu-red text-[length:var(--fs-14)]"><CircleAlert className="size-4 shrink-0 mt-0.5" aria-hidden />{err}</p>
        : <p role="status" className="m-0 flex gap-2 items-center text-eu-ink-3 text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden />Φορτώνω τα νέα είδη της εισαγωγής…</p>}
      <div><button type="button" className={secondary} onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Προεπισκόπηση</button></div>
    </section>
  );
  const open = data.pending.filter((p) => p.mtrl == null && (p.status === "pending" || p.status === "error"));
  const created = data.pending.length - open.length, ready = open.filter((p) => !p.missing.length).length;
  const left = data.missing.filter((p) => !off[p.id]?.ok);
  const lock = !data.writeOn ? "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne) — μέχρι να ανοίξουν, μπορείς να διαλέξεις αλλά όχι να απενεργοποιήσεις." : !data.flagOn ? "Η εγγραφή της «Εξαίρεσης Web» στο SoftOne δεν έχει ενεργοποιηθεί σε αυτό το περιβάλλον (S1_WEB_FLAG_WRITE) — μπορείς να διαλέξεις αλλά όχι να απενεργοποιήσεις." : !data.canApprove ? "Για απενεργοποίηση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." : null;
  const deactivate = async () => {
    const ids = left.filter((p) => sel.has(p.id)).map((p) => p.id);
    if (!ids.length || lock) return;
    const withStock = left.filter((p) => sel.has(p.id) && (p.stock ?? 0) > 0).length;
    if (!confirm(`${ids.length} ${ids.length === 1 ? "προϊόν" : "προϊόντα"}: στο SoftOne τσεκάρεται η «Εξαίρεση Web» και γίνεται ανενεργό (ISACTIVE=0), οπότε φεύγει από το eshop.${withStock ? ` ${withStock} από αυτά έχουν ακόμη απόθεμα.` : ""} Τα ξαναενεργοποιείς από το SoftOne. Συνέχεια;`)) return;
    setBusy(true); setErr(null);
    for (let i = 0; i < ids.length; i += 20) {
      let res;
      try { res = await deactivateMissingProducts(jobId, ids.slice(i, i + 20)); } catch { res = { error: "Η σύνδεση διακόπηκε." }; }
      if ("error" in res) { setErr(`${res.error}${i ? " — όσα έγιναν μέχρι εδώ έμειναν." : ""}`); break; }
      setOff((o) => ({ ...o, ...Object.fromEntries(res.map((r) => [r.id, r])) }));
    }
    setBusy(false); setSel(new Set());
  };

  return (
    <>
      <section data-help="foreign.create" className={card} aria-labelledby="f-create">
        <div>
          <h3 id="f-create" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-1.5"><PackagePlus className="size-4 text-eu-blue" aria-hidden /> 5. Δημιουργία νέων ειδών</h3>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τα νέα είδη αυτής της εισαγωγής. Με την έγκριση δημιουργούνται στο SoftOne και στο eshop <strong>ανενεργά</strong>, παίρνουν τιμή και φωτογραφίες, και τα δημοσιεύεις όταν είναι έτοιμα. Όπου λείπει κάτι, πάτα «Επεξεργασία» και συμπλήρωσέ το.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[length:var(--fs-13)]">
          <span className={`${chip} bg-eu-green/12 text-eu-ink`}>Έτοιμα για δημιουργία {ready}</span>
          <span className={`${chip} ${open.length - ready ? "bg-eu-yellow/30 text-eu-ink" : "bg-eu-surface text-eu-ink-3"}`}>Τους λείπει κάτι {open.length - ready}</span>
          <span className={`${chip} bg-eu-chip text-eu-navy`}>Δημιουργήθηκαν {created}</span>
        </div>
        {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />{err}</p>}
        <PendingItems items={data.pending} status="pending" writeOn={data.writeOn} canWrite canApprove={data.canApprove} brands={brands} groups={data.groups} units={data.units} erpOpts={data.erpOpts} onChanged={load} flagOn={data.flagOn} settings={settings} />
      </section>

      <section data-help="foreign.missing" className={card} aria-labelledby="f-missing">
        <div>
          <h3 id="f-missing" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-1.5"><PowerOff className="size-4 text-eu-blue" aria-hidden /> Λείπουν από το αρχείο</h3>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Ενεργά προϊόντα της ίδιας μάρκας που δεν υπάρχουν σε αυτό το φύλλο — ίσως ο προμηθευτής τα κατάργησε. Τίποτα δεν απενεργοποιείται μόνο του: τσέκαρε όσα θέλεις και πάτα «Ανενεργά σε eshop και SoftOne» — γίνονται ανενεργά (ISACTIVE=0) με «Εξαίρεση Web», ακόμη κι αν έχουν απόθεμα. Αν το αρχείο έχει κι άλλα φύλλα ή είναι μέρος του καταλόγου, κάποια από αυτά απλώς βρίσκονται αλλού.</p>
        </div>
        {!data.missing.length ? <p className="m-0 flex gap-2 items-center text-eu-ink text-[length:var(--fs-14)]"><Check className="size-4 text-eu-green shrink-0" aria-hidden />Κανένα ενεργό προϊόν της μάρκας δεν λείπει από το αρχείο.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
              <span className="text-eu-ink-3">Λείπουν: <strong className="text-eu-ink tabular-nums">{left.length}</strong> · επιλεγμένα: <strong className="text-eu-ink tabular-nums">{sel.size}</strong></span>
              <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" disabled={busy} onClick={() => setSel(new Set(left.map((p) => p.id)))}>Όλα</button>
              {left.some((p) => !(p.stock ?? 0)) && left.some((p) => (p.stock ?? 0) > 0) && <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" disabled={busy} onClick={() => setSel(new Set(left.filter((p) => !(p.stock ?? 0)).map((p) => p.id)))}>Μόνο χωρίς απόθεμα</button>}
              <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" disabled={busy} onClick={() => setSel(new Set())}>Κανένα</button>
            </div>
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {data.missing.map((p) => {
                const r = off[p.id];
                return (
                  <li key={p.id} className={`rounded-lg border p-2 min-w-0 ${r ? (r.ok ? "border-eu-green/50" : "border-eu-red/50") : "border-eu-line"}`}>
                    <label className="flex items-start gap-2 min-w-0 cursor-pointer min-h-11 md:min-h-9">
                      <input type="checkbox" checked={sel.has(p.id)} disabled={busy || !!r?.ok} onChange={() => setSel((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="size-5 mt-0.5 accent-eu-navy shrink-0 disabled:opacity-40" />
                      <span className="grid gap-0.5 min-w-0">
                        <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere]">{p.title}</span>
                        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-eu-muted text-[length:var(--fs-12)] break-all">
                          <span>{p.brand} · {p.sku} · MTRL {p.mtrl}</span>
                          {p.stock != null && <span className={`rounded-md px-1.5 font-semibold ${p.stock > 0 ? "bg-eu-amber/20 text-eu-ink" : "bg-eu-surface text-eu-ink-3"}`}>{p.stock > 0 ? `απόθεμα ${p.stock.toLocaleString("el-GR")}` : "χωρίς απόθεμα"}</span>}
                          {p.webExcluded && <span className="rounded-md bg-eu-surface px-1.5 text-eu-ink-3">ήδη «Εξαίρεση Web»</span>}
                        </span>
                        {r && <span className={`flex gap-1.5 items-start text-[length:var(--fs-13)] ${r.ok ? "text-eu-ink" : "text-eu-red"}`}>{r.ok ? <Check className="size-3.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}{r.ok ? "Έγινε ανενεργό στο SoftOne (ISACTIVE=0, «Εξαίρεση Web») και έφυγε από το eshop." : r.error}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div data-help="foreign.missing-action" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              {lock && <p className="m-0 flex gap-2 items-start text-eu-ink text-[length:var(--fs-13)] max-w-[60ch]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />{lock}</p>}
              <button type="button" onClick={deactivate} disabled={busy || !!lock || !sel.size} className={`${btn} border-2 border-eu-red/60 text-eu-red hover:bg-eu-red/10`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PowerOff className="size-4" aria-hidden />} Ανενεργά σε eshop και SoftOne {sel.size || ""}</button>
            </div>
          </>
        )}
      </section>
      <div><button type="button" className={secondary} onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Προεπισκόπηση</button></div>
    </>
  );
}
