/**
 * Καθαρή λογική της εισαγωγής μελών από το SoftOne (χωρίς βάση/δίκτυο, για tests).
 * Μέλος = CUSTOMER (TRDR, SODTYPE 13) με TRDBUSINESS · κατάστημα = CUSBRANCH (TRDBRANCH).
 */

export const MEMBER_FIELDS = ["TRDR", "CODE", "NAME", "AFM", "IRSDATA", "ADDRESS", "ZIP", "CITY", "DISTRICT", "PHONE01", "PHONE02", "EMAIL", "WEBPAGE", "TRDBUSINESS", "TRDPGROUP", "ISACTIVE", "UPDDATE"] as const;
export const BRANCH_FIELDS = ["TRDBRANCH", "TRDR", "CODE", "NAME", "ADDRESS", "ZIP", "CITY", "DISTRICT", "PHONE1", "PHONE2", "EMAIL", "ISACTIVE", "ISCENTER", "IRSDATA"] as const;

export type S1Member = Record<(typeof MEMBER_FIELDS)[number], string>;
export type S1Branch = Record<(typeof BRANCH_FIELDS)[number], string>;

export const rowsToObjects = <F extends readonly string[]>(fields: F, rows: string[][]) =>
  rows.map((r) => Object.fromEntries(fields.map((f, i) => [f, (r[i] ?? "").trim()]))) as Record<F[number], string>[];

const t = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const int = (v: string | undefined) => (v && /^-?\d+$/.test(v.trim()) ? Number(v) : null);

/** Πρώτο έγκυρο email από πεδίο που μπορεί να έχει περισσότερα (`;`, `,`, κενό). */
export function normEmail(v: string | null | undefined): string | null {
  const first = (v ?? "").toLowerCase().split(/[;,\s]+/).find((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  return first ?? null;
}

/** Στο WEBPAGE συχνά είναι γραμμένο κινητό: κρατάμε μόνο ό,τι μοιάζει με διεύθυνση. */
export function normWebsite(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s || /^[\d\s+()-]+$/.test(s) || !/[a-z]\.[a-z]/i.test(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** «2026-07-02 15:55:00» (ώρα Ελλάδας) → Date. */
export function s1Date(v: string | null | undefined): Date | null {
  const m = (v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type Lookups = { business: Map<number, string>; group: Map<number, string> };

export function toPartner(m: S1Member, lk: Lookups) {
  const s1Business = int(m.TRDBUSINESS), s1Group = int(m.TRDPGROUP);
  return {
    s1Trdr: Number(m.TRDR),
    code: t(m.CODE),
    name: t(m.NAME) ?? `Μέλος ${m.TRDR}`,
    afm: t(m.AFM),
    taxOffice: t(m.IRSDATA),
    s1Business,
    category: s1Business === null ? null : lk.business.get(s1Business) ?? null,
    s1Group,
    groupName: s1Group === null ? null : lk.group.get(s1Group) ?? null,
    address: t(m.ADDRESS),
    city: t(m.CITY),
    zip: t(m.ZIP),
    district: t(m.DISTRICT),
    phone: t(m.PHONE01),
    phone2: t(m.PHONE02),
    email: normEmail(m.EMAIL),
    website: normWebsite(m.WEBPAGE),
    active: m.ISACTIVE !== "0",
    s1UpdatedAt: s1Date(m.UPDDATE),
  };
}

export function toBranch(b: S1Branch) {
  return {
    s1BranchId: Number(b.TRDBRANCH),
    code: t(b.CODE),
    name: t(b.NAME) ?? `Υποκατάστημα ${b.TRDBRANCH}`,
    isCenter: b.ISCENTER === "1",
    address: t(b.ADDRESS),
    city: t(b.CITY),
    zip: t(b.ZIP),
    district: t(b.DISTRICT),
    phone: t(b.PHONE1),
    phone2: t(b.PHONE2),
    email: normEmail(b.EMAIL),
    taxOffice: t(b.IRSDATA),
    active: b.ISACTIVE !== "0",
  };
}

/** Μέλος χωρίς υποκατάστημα στο SoftOne: ένα κατάστημα από τη διεύθυνση του πελάτη. */
export function virtualBranch(p: ReturnType<typeof toPartner>) {
  return {
    s1BranchId: null,
    code: p.code,
    name: p.name,
    isCenter: true,
    address: p.address,
    city: p.city,
    zip: p.zip,
    district: p.district,
    phone: p.phone,
    phone2: p.phone2,
    email: p.email,
    taxOffice: p.taxOffice,
    active: p.active,
  };
}

// ---------- Αντιστοίχιση με τα καταστήματα του eshop ----------

export type MatchBranch = { key: string; partnerKey: string; email: string | null; isCenter: boolean; storeId: string | null; matchedBy: string | null; zip?: string | null; city?: string | null };
export type MatchPartner = { key: string; email: string | null };
export type MatchStore = { id: string; email: string | null; zip?: string | null; city?: string | null };

const zipKey = (z: string | null | undefined) => (z ?? "").replace(/\D/g, "") || null;
/** «ΠΤΟΛΕΜΑ'Ι'ΔΑ» = «Πτολεμαΐδα»: χωρίς τόνους/διαλυτικά/σημεία, κεφαλαία. */
export const cityKey = (c: string | null | undefined) => (c ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g, "") || null;

/** Ζεύγη ένα-προς-ένα με βάση ένα κλειδί (κάθε τιμή ακριβώς μία φορά και στις δύο πλευρές). */
function pairBy<S, B>(ss: S[], bs: B[], ks: (s: S) => string | null, kb: (b: B) => string | null): [S, B][] {
  const out: [S, B][] = [];
  for (const s of ss) {
    const k = ks(s);
    if (!k || ss.filter((x) => ks(x) === k).length !== 1) continue;
    const hit = bs.filter((b) => kb(b) === k);
    if (hit.length === 1) out.push([s, hit[0]]);
  }
  return out;
}
export type Match = { branchKey: string; storeId: string; matchedBy: "email-branch" | "email-partner" };

/**
 * Πρόταση σύνδεσης υποκαταστημάτων SoftOne ↔ καταστημάτων eshop. Μόνο μονοσήμαντες αντιστοιχίσεις:
 * 1) ίδιο email καταστήματος και υποκαταστήματος (ένα προς ένα)· αν το ίδιο email έχουν περισσότερα, ζευγαρώνουν
 *    με τον ταχυδρομικό κώδικα και μετά με την πόλη (μόνο όπου είναι μονοσήμαντα)
 * 2) email καταστήματος = email μέλους → στο μοναδικό ελεύθερο υποκατάστημα του μέλους, ή στην έδρα του.
 * Οι χειροκίνητες επιλογές (`manual`, και η «χωρίς κατάστημα») και όσα είναι ήδη συνδεδεμένα δεν αλλάζουν.
 */
export function matchStores(branches: MatchBranch[], partners: MatchPartner[], stores: MatchStore[]): Match[] {
  const taken = new Set(branches.map((b) => b.storeId).filter(Boolean) as string[]);
  const free = stores.filter((s) => !taken.has(s.id) && normEmail(s.email));
  const open = new Map(branches.filter((b) => !b.storeId && b.matchedBy !== "manual").map((b) => [b.key, b]));
  const out: Match[] = [];
  const group = <T,>(xs: T[], k: (x: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const x of xs) { const key = k(x); if (key) m.set(key, [...(m.get(key) ?? []), x]); }
    return m;
  };

  // 1) email υποκαταστήματος
  const storesByEmail = group(free, (s) => normEmail(s.email));
  const branchesByEmail = group([...open.values()], (b) => normEmail(b.email));
  const used = new Set<string>();
  for (const [email, ss] of storesByEmail) {
    const bs = branchesByEmail.get(email);
    if (!bs) continue;
    const take = (st: MatchStore, b: MatchBranch) => { out.push({ branchKey: b.key, storeId: st.id, matchedBy: "email-branch" }); open.delete(b.key); used.add(st.id); };
    if (ss.length === 1 && bs.length === 1) { take(ss[0], bs[0]); continue; }
    for (const [st, b] of pairBy(ss, bs, (x) => zipKey(x.zip), (x) => zipKey(x.zip))) take(st, b);
    const restS = ss.filter((x) => !used.has(x.id)), restB = bs.filter((b) => open.has(b.key));
    for (const [st, b] of pairBy(restS, restB, (x) => cityKey(x.city), (x) => cityKey(x.city))) take(st, b);
  }

  // 2) email μέλους
  const partnersByEmail = group(partners, (p) => normEmail(p.email));
  for (const [email, ss] of storesByEmail) {
    const left = ss.filter((s) => !used.has(s.id));
    const ps = partnersByEmail.get(email);
    if (left.length !== 1 || ps?.length !== 1) continue;
    const mine = [...open.values()].filter((b) => b.partnerKey === ps[0].key);
    const pick = mine.length === 1 ? mine[0] : mine.filter((b) => b.isCenter).length === 1 ? mine.find((b) => b.isCenter)! : null;
    if (!pick) continue;
    out.push({ branchKey: pick.key, storeId: left[0].id, matchedBy: "email-partner" });
    open.delete(pick.key); used.add(left[0].id);
  }
  return out;
}
