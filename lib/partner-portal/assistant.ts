import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { hoursOf, servicesOf, STORE_SERVICES } from "./store-profile";
import { connTypeInfo } from "./connection-types";
import { GUIDE } from "./guide";
import { journey, onboardingOf } from "./data";
import { CONN_STATUS } from "@/components/synergaton/log-kinds";
import { PORTAL_MODEL } from "./ai";
import { portalLog } from "./log";
import type { PortalUser } from "./session";

/**
 * Ο Ερμής της πύλης συνεργατών: απαντά ΜΟΝΟ για τις ρυθμίσεις του συγκεκριμένου μέλους (καταστήματα, συνδέσεις,
 * έλεγχοι, αντιστοίχιση, παραγγελίες παραλαβής, λογαριασμός) — όχι για προϊόντα / πελάτες του eshop.
 * Βλέπει την πραγματική κατάσταση του μέλους και τον οδηγό της πύλης· δεν επινοεί κουμπιά ή σελίδες.
 * Στο μοντέλο δεν πηγαίνουν προσωπικά δεδομένα, τηλέφωνα/email ή secrets: μόνο αν υπάρχουν, όχι τι είναι.
 */
export type ErmisTurn = { role: "user" | "assistant"; text: string };
export type ErmisLink = { label: string; path: string };
export type ErmisReply = { answer: string; steps: string[]; links: ErmisLink[]; offTopic?: boolean };

const DAYS = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];

const PAGES: ErmisLink[] = [
  { label: "Αρχική", path: "/" },
  { label: "Ερωτήσεις έναρξης", path: "/ksekinima" },
  { label: "Καταστήματα", path: "/katastimata" },
  { label: "Συνδέσεις αποθέματος", path: "/syndesi" },
  { label: "Νέα σύνδεση", path: "/syndesi/nea" },
  { label: "Παραγγελίες παραλαβής", path: "/paraggelies" },
  { label: "Ιστορικό", path: "/istoriko" },
  { label: "Οδηγός", path: "/odigos" },
  { label: "Προφίλ & κωδικός", path: "/profil" },
];

async function partnerContext(u: PortalUser, path: string) {
  const pid = u.partner.id;
  const [stores, conns, openPickups, lastBatch, changed] = await Promise.all([
    db.store.findMany({ where: { partnerId: pid }, orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, phone: true, mobile: true, email: true, hours: true, services: true, active: true, lat: true, lng: true, updatedAt: true, branch: { select: { s1BranchId: true } } } }),
    db.partnerConnection.findMany({ where: { partnerId: pid }, select: { id: true, type: true, label: true, status: true, active: true, storeIds: true, secretKeys: true, lastTest: true, lastTestAt: true, lastOkAt: true, locationMap: true } }),
    db.order.count({ where: { pickupStore: { partnerId: pid }, status: { in: ["paid", "processing", "ready-for-pickup"] } } }),
    db.partnerLog.findFirst({ where: { partnerId: pid, kind: { in: ["engine.event", "upload", "import"] } }, orderBy: { createdAt: "desc" }, select: { ok: true, message: true, createdAt: true } }),
    db.partnerChange.count({ where: { partnerId: pid, entity: "Store" } }),
  ]);
  const ob = onboardingOf(u.partner.onboarding);
  const j = journey({ onboarding: ob, stores, storesReviewed: changed > 0 || ob.steps?.profile === "done", connections: conns });
  return {
    page: path,
    member: { name: u.partner.name, status: u.partner.status, role: u.role },
    journey: { done: `${j.done}/${j.total}`, steps: j.steps.map((s) => ({ step: s.title, done: s.done, page: s.href })), next: j.next?.title ?? null },
    stores: stores.map((s) => {
      const h = hoursOf(s.hours);
      return {
        id: s.id, name: s.name, city: s.city, eshop: s.active ? "ορατό στο eshop" : "κρυφό στο eshop (το αποφασίζει η Euronics)", softoneBranch: !!s.branch?.s1BranchId,
        hasPhone: !!s.phone, hasMobile: !!s.mobile, hasEmail: !!s.email, openDays: [...new Set(h.map((x) => x.day))].sort().map((d) => DAYS[d]).join(", ") || "χωρίς ωράριο",
        services: servicesOf(s.services).map((k) => STORE_SERVICES.find((x) => x.key === k)?.label ?? k),
        map: s.lat === 0 && s.lng === 0 ? "χωρίς σημείο στον χάρτη" : "στον χάρτη",
      };
    }),
    connections: conns.map((c) => {
      const t = c.lastTest as { steps?: { key: string; ok: boolean; message: string }[] } | null;
      const map = Array.isArray(c.locationMap) ? (c.locationMap as { storeId: string | null }[]) : [];
      return {
        id: c.id, type: connTypeInfo(c.type)?.title ?? c.type, status: CONN_STATUS[c.status]?.[1] ?? c.status, live: c.active,
        stores: c.storeIds.length, credentialsGiven: c.secretKeys.length > 0, lastTestAt: c.lastTestAt, lastOkAt: c.lastOkAt,
        lastTest: t?.steps?.map((s) => ({ step: s.key, ok: s.ok, message: s.message.slice(0, 200) })) ?? null,
        locations: map.length ? `${map.filter((m) => m.storeId).length}/${map.length} τοποθεσίες αντιστοιχισμένες` : "χωρίς αντιστοίχιση τοποθεσιών",
      };
    }),
    openPickupOrders: openPickups,
    lastSync: lastBatch ? { ok: lastBatch.ok, message: lastBatch.message.slice(0, 200), at: lastBatch.createdAt } : null,
  };
}

const guideText = () =>
  GUIDE.map((a) => `## ${a.title} (/odigos/${a.slug})\n${a.summary}\n${a.sections.map((s) => [`### ${s.title}`, ...(s.body ?? []), ...(s.steps ?? []).map((x, i) => `${i + 1}. ${x}`), ...(s.tips ?? []).map((x) => `- ${x}`)].join("\n")).join("\n")}${a.faq?.length ? `\nΣυχνές ερωτήσεις:\n${a.faq.map((f) => `- ${f.q} → ${f.a}`).join("\n")}` : ""}`).join("\n\n");

const SYSTEM = (ctx: unknown, allowed: string[]) => `Είσαι ο Ερμής, ο βοηθός της ΠΥΛΗΣ ΣΥΝΕΡΓΑΤΩΝ της Euronics. Μιλάς με υπάλληλο ενός καταστήματος-μέλους.
Βοηθάς ΜΟΝΟ με τις ρυθμίσεις του μέλους στην πύλη: προφίλ καταστημάτων (τηλέφωνα, email, ωράριο, υπηρεσίες), συνδέσεις αποθέματος (τρόπος, στοιχεία, έλεγχος, αντιστοίχιση στηλών και καταστημάτων, ενεργοποίηση, παύση), ανέβασμα αρχείου, παραγγελίες παραλαβής, ιστορικό, λογαριασμό και κωδικό.
ΔΕΝ απαντάς για προϊόντα, τιμές, αγορές πελατών ή το eshop γενικά: τότε "offTopic": true και πες σύντομα ότι εδώ βοηθάς με τις ρυθμίσεις της πύλης.
Κανόνες ακρίβειας:
- Στηρίζεσαι ΜΟΝΟ στην «Κατάσταση του μέλους» και στον «Οδηγό» παρακάτω. Αν κάτι δεν φαίνεται εκεί, πες το καθαρά και πρότεινε τον υπεύθυνο συνεργατών της Euronics. Μην επινοείς κουμπιά, πεδία, σελίδες ή αριθμούς.
- Ωράριο λείπει μόνο όταν είναι «χωρίς ωράριο». Κλειστές ημέρες (π.χ. Κυριακή) είναι φυσιολογικές, όχι έλλειψη. Το email καταστήματος είναι προαιρετικό: πρότεινέ το, μην το λες πρόβλημα. Σημαντικά κενά: κανένα τηλέφωνο, χωρίς ωράριο, χωρίς σημείο στον χάρτη.
- Μη γράφεις ποτέ ονόματα πεδίων ή τεχνικούς όρους της κατάστασης (λέξεις στα αγγλικά, κλειδιά JSON): περίγραψέ τα με απλά λόγια.
- Η εμφάνιση καταστήματος στο eshop (ορατό/κρυφό) την αποφασίζει η Euronics, όχι το μέλος.
- Κουμπιά και οθόνες που υπάρχουν (μόνο αυτά): σελίδα «Καταστήματα» → κάρτα καταστήματος → οδηγός με βήματα «Επικοινωνία», «Ωράριο», «Υπηρεσίες», «Έλεγχος», κουμπιά «Συνέχεια» και «Αποθήκευση αλλαγών» (με επιβεβαίωση)· στην ίδια σελίδα κάρτα «Σημείο στον χάρτη» με «Εντοπισμός από τη διεύθυνση», σύρσιμο της καρφίτσας και «Αποθήκευση σημείου»· στη σελίδα «Καταστήματα» κάρτα «Επικύρωση στοιχείων στην ΑΑΔΕ» με «Έλεγχος στην ΑΑΔΕ» (επωνυμία, διεύθυνση, ΑΦΜ αλλάζουν μόνο από την Euronics)· «Ερωτήσεις έναρξης» με βήματα και «Συνέχεια»· «Συνδέσεις» → «Νέα σύνδεση». Σταθερό, κινητό και email γράφονται και στο SoftOne της Euronics όταν το έχει ανοίξει η Euronics.
- Όταν ρωτούν «τι μου λείπει» ή «γιατί δεν δουλεύει», κοίτα την κατάσταση: επόμενο βήμα, καταστήματα χωρίς τηλέφωνο/ωράριο/σημείο χάρτη, συνδέσεις με αποτυχημένο βήμα ελέγχου (εξήγησε το μήνυμα απλά και τι να διορθώσει), μη αντιστοιχισμένες τοποθεσίες.
- Αναφέρεις καταστήματα και συνδέσεις με το όνομά τους. Δεν ζητάς και δεν επαναλαμβάνεις κωδικούς, κλειδιά ή συνθηματικά.
- Ελληνικά, απλά, ευγενικά, σύντομα (έως 90 λέξεις στο "answer"). Βήματα μόνο αν βοηθούν, έως 6, με τα ονόματα των κουμπιών όπως είναι στον οδηγό.
Απάντηση ΜΟΝΟ JSON: {"answer": string, "steps": string[], "links": [{"label": string, "path": string}] (0-3, path ΜΟΝΟ από: ${allowed.join(", ")}), "offTopic": boolean}

# Κατάσταση του μέλους
${JSON.stringify(ctx)}

# Οδηγός της πύλης
${guideText()}`;

export async function askErmis(u: PortalUser, history: ErmisTurn[], question: string, path: string): Promise<ErmisReply | null> {
  const cfg = await getAi();
  if (!cfg || !cfg.apiKey || (await overBudget(cfg))) return null;
  const ctx = await partnerContext(u, path);
  const allowed = [...PAGES.map((p) => p.path), ...ctx.stores.map((s) => `/katastimata/${s.id}`), ...ctx.connections.map((c) => `/syndesi/${c.id}`), ...GUIDE.map((a) => `/odigos/${a.slug}`)];
  const t0 = Date.now();
  const r = await chat({
    feature: "portal-ermis", model: PORTAL_MODEL, reasoning: "off", json: true, maxTokens: 700, temperature: 0.2, timeoutMs: 30_000,
    messages: [{ role: "system", content: SYSTEM(ctx, allowed) }, ...history.slice(-8).map((t) => ({ role: t.role, content: t.text.slice(0, 1200) })), { role: "user", content: question.slice(0, 800) }],
  }).catch(() => null);
  await portalLog(u.partner.id, "ai", !!r, r ? "Ερμής: ερώτηση στην πύλη" : "Ο Ερμής δεν απάντησε", { accountId: u.accountId, ms: Date.now() - t0, detail: r ? { model: r.model, costUsd: r.costUsd } : undefined });
  const j = r ? parseJson<Partial<ErmisReply>>(r.text) : null;
  if (!j?.answer) return null;
  const label = (p: string) => PAGES.find((x) => x.path === p)?.label ?? ctx.stores.find((s) => p === `/katastimata/${s.id}`)?.name ?? ctx.connections.find((c) => p === `/syndesi/${c.id}`)?.type ?? GUIDE.find((a) => p === `/odigos/${a.slug}`)?.title ?? p;
  return {
    answer: String(j.answer),
    steps: Array.isArray(j.steps) ? j.steps.map(String).slice(0, 6) : [],
    links: (Array.isArray(j.links) ? j.links : []).filter((l) => l && allowed.includes(l.path)).slice(0, 3).map((l) => ({ path: l.path, label: String(l.label || label(l.path)).slice(0, 60) })),
    offTopic: !!j.offTopic,
  };
}
