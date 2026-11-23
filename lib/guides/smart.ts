import type { Product } from "@/lib/data/types";
import { attributesOf } from "@/lib/data/attributes";

/**
 * Smart buying guides («Έξυπνος οδηγός αγοράς»). Pure, client-safe.
 * A guide is a short questionnaire; every answer becomes a weighted
 * criterion that is scored against the canonical attributes of each
 * product (lib/data/attributes). The result is not a black box: every
 * recommendation carries the reasons that produced it, in the customer's
 * words («κάθεσαι 2,5–3 m → 50–58"»), and the trade-offs it accepted.
 * Tomorrow the same definitions drive the ERP-fed catalogue.
 */
export type GuideKind = "tileoraseis" | "ypologistes" | "klimatistika";

export interface Option {
  value: string;
  label: string;
  sub?: string;
}
export interface Question {
  id: string;
  title: string;
  help?: string;
  multi?: boolean;
  options: Option[];
}
export interface GuideDef {
  kind: GuideKind;
  title: string;
  noun: string;
  intro: string;
  image: string;
  l1: string;
  l2s: string[];
  listHref: string;
  questions: Question[];
}
export type Answers = Record<string, string[]>;

export interface Need {
  label: string;
  value: string;
}
export interface Scored {
  product: Product;
  score: number;
  pct: number;
  reasons: string[];
  cons: string[];
  overBudget: boolean;
}
export interface GuideResult {
  needs: Need[];
  ranked: Scored[];
  /** URL of the listing pre-filtered to the derived needs. */
  listHref: string;
}

const num = (v?: string) => {
  if (!v) return NaN;
  const m = v.replace(/\./g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const energyRank = (cls?: string) => (cls ? ["G", "F", "E", "D", "C", "B", "A", "A+", "A++", "A+++"].indexOf(cls) : -1);
const budgetCap = (v?: string) => (v === "b1" ? 400 : v === "b2" ? 700 : v === "b3" ? 1200 : v === "p1" ? 500 : v === "p2" ? 1000 : v === "p3" ? 1600 : v === "a1" ? 400 : v === "a2" ? 700 : v === "a3" ? 1000 : Infinity);

export const GUIDES: Record<GuideKind, GuideDef> = {
  tileoraseis: {
    kind: "tileoraseis",
    title: "Ποια τηλεόραση σού ταιριάζει;",
    noun: "τηλεόραση",
    intro: "Πέντε ερωτήσεις: απόσταση, χρήση, φως, περιεχόμενο, προϋπολογισμός. Σου προτείνουμε τη σωστή διαγώνιο και τεχνολογία και σου λέμε γιατί.",
    image: "/img/guide-tv.jpg",
    l1: "eikona-ixos",
    l2s: ["tileoraseis"],
    listHref: "/k/eikona-ixos/tileoraseis",
    questions: [
      {
        id: "distance",
        title: "Πόσο μακριά κάθεσαι από την τηλεόραση;",
        help: "Η απόσταση καθορίζει τη διαγώνιο. Πολύ μεγάλη οθόνη από κοντά κουράζει, μικρή από μακριά χάνει τη λεπτομέρεια του 4K.",
        options: [
          { value: "d1", label: "Κάτω από 2 μέτρα", sub: "Υπνοδωμάτιο, κουζίνα · 32–43\"" },
          { value: "d2", label: "2 – 2,5 μέτρα", sub: "Μικρό σαλόνι · 43–50\"" },
          { value: "d3", label: "2,5 – 3 μέτρα", sub: "Το πιο συνηθισμένο · 50–58\"" },
          { value: "d4", label: "3 – 3,5 μέτρα", sub: "Μεγάλο σαλόνι · 55–65\"" },
          { value: "d5", label: "Πάνω από 3,5 μέτρα", sub: "Ανοιχτός χώρος · 65\"+" },
        ],
      },
      {
        id: "use",
        title: "Τι βλέπεις κυρίως;",
        help: "Διάλεξε όσα ισχύουν. Ταινίες θέλουν αντίθεση, αθλητικά και gaming θέλουν 100 Hz.",
        multi: true,
        options: [
          { value: "movies", label: "Ταινίες & σειρές", sub: "Netflix, Disney+, Cosmote TV" },
          { value: "sports", label: "Αθλητικά", sub: "Γρήγορη κίνηση, φωτεινό γήπεδο" },
          { value: "gaming", label: "Gaming", sub: "PS5 / Xbox · 100–120 Hz" },
          { value: "daily", label: "Καθημερινή τηλεόραση", sub: "Ειδήσεις, εκπομπές" },
        ],
      },
      {
        id: "light",
        title: "Πόσο φως έχει ο χώρος;",
        help: "Σε φωτεινό δωμάτιο μετράει η φωτεινότητα (QLED / Mini LED). Σε σκοτεινό, το βαθύ μαύρο (OLED).",
        options: [
          { value: "dark", label: "Σκοτεινός / βραδινή χρήση", sub: "Κουρτίνες, home cinema" },
          { value: "normal", label: "Κανονικός", sub: "Σαλόνι με παράθυρο" },
          { value: "bright", label: "Πολύ φωτεινός", sub: "Μεγάλα παράθυρα, ήλιος" },
        ],
      },
      {
        id: "content",
        title: "Από πού θα βλέπεις;",
        multi: true,
        options: [
          { value: "apps", label: "Εφαρμογές streaming", sub: "Χρειάζεται Smart TV & Wi-Fi" },
          { value: "dvb", label: "Επίγεια / δορυφορικά κανάλια", sub: "Δέκτης DVB-T2 / S2" },
          { value: "hdmi", label: "Αποκωδικοποιητή ή κονσόλα", sub: "HDMI" },
        ],
      },
      {
        id: "budget",
        title: "Ποιος είναι ο προϋπολογισμός σου;",
        help: "Με έως 24 άτοκες δόσεις με κάρτα.",
        options: [
          { value: "b1", label: "Έως 400 €", sub: "ή 12 × 33 €" },
          { value: "b2", label: "400 – 700 €", sub: "ή 12 × 58 €" },
          { value: "b3", label: "700 – 1.200 €", sub: "ή 24 × 50 €" },
          { value: "b4", label: "Χωρίς όριο", sub: "Θέλω το καλύτερο" },
        ],
      },
    ],
  },
  ypologistes: {
    kind: "ypologistes",
    title: "Ποιος υπολογιστής σού ταιριάζει;",
    noun: "υπολογιστή",
    intro: "Πέντε ερωτήσεις: χρήση, μετακίνηση, λειτουργικό, αποθήκευση, προϋπολογισμός. Παίρνεις πρόταση με μνήμη, επεξεργαστή και οθόνη που ταιριάζουν σε αυτά που κάνεις.",
    image: "/img/hero-laptop.jpg",
    l1: "computing",
    l2s: ["laptops", "tablets"],
    listHref: "/k/computing/laptops",
    questions: [
      {
        id: "use",
        title: "Τι θα κάνεις κυρίως;",
        help: "Διάλεξε όσα ισχύουν. Το πιο απαιτητικό καθορίζει τη μνήμη και τον επεξεργαστή.",
        multi: true,
        options: [
          { value: "office", label: "Γραφείο & σπουδές", sub: "Office, email, βιντεοκλήσεις" },
          { value: "creative", label: "Φωτογραφία / βίντεο", sub: "Lightroom, Premiere, DaVinci" },
          { value: "dev", label: "Προγραμματισμός", sub: "IDE, containers, πολλά tabs" },
          { value: "gaming", label: "Gaming", sub: "Κάρτα γραφικών, 16 GB+" },
          { value: "media", label: "Περιήγηση & ταινίες", sub: "Καναπές, ταξίδι" },
        ],
      },
      {
        id: "mobility",
        title: "Πόσο θα τον μετακινείς;",
        options: [
          { value: "always", label: "Πάντα μαζί μου", sub: "Ελαφρύς, έως 14\", μεγάλη αυτονομία" },
          { value: "some", label: "Σπίτι – γραφείο", sub: "14–16\"" },
          { value: "desk", label: "Σταθερά στο γραφείο", sub: "16\"+ ή με εξωτερική οθόνη" },
        ],
      },
      {
        id: "os",
        title: "Έχεις προτίμηση σε λειτουργικό;",
        options: [
          { value: "any", label: "Δεν έχω προτίμηση", sub: "Πρότεινέ μου ό,τι ταιριάζει" },
          { value: "mac", label: "macOS / iPad", sub: "Έχω iPhone, θέλω το οικοσύστημα" },
          { value: "win", label: "Windows", sub: "Προγράμματα της δουλειάς" },
        ],
      },
      {
        id: "storage",
        title: "Πόσα αρχεία κρατάς τοπικά;",
        options: [
          { value: "s1", label: "Λίγα, δουλεύω στο cloud", sub: "256 GB αρκούν" },
          { value: "s2", label: "Πολλές φωτογραφίες / βίντεο", sub: "512 GB+" },
          { value: "s3", label: "Παιχνίδια, μεγάλες βιβλιοθήκες", sub: "1 TB" },
        ],
      },
      {
        id: "budget",
        title: "Ποιος είναι ο προϋπολογισμός σου;",
        options: [
          { value: "p1", label: "Έως 500 €", sub: "ή 12 × 42 €" },
          { value: "p2", label: "500 – 1.000 €", sub: "ή 12 × 83 €" },
          { value: "p3", label: "1.000 – 1.600 €", sub: "ή 24 × 67 €" },
          { value: "p4", label: "Χωρίς όριο" },
        ],
      },
    ],
  },
  klimatistika: {
    kind: "klimatistika",
    title: "Ποιο κλιματιστικό σού ταιριάζει;",
    noun: "κλιματιστικό",
    intro: "Έξι ερωτήσεις: τετραγωνικά, προσανατολισμός, μόνωση, θέρμανση, προτεραιότητες, προϋπολογισμός. Υπολογίζουμε τα BTU που χρειάζεσαι και προτείνουμε μοντέλο με αιτιολόγηση.",
    image: "/img/guide-ac.jpg",
    l1: "klimatismos",
    l2s: ["air-condition"],
    listHref: "/k/klimatismos/air-condition",
    questions: [
      {
        id: "area",
        title: "Πόσα τετραγωνικά είναι ο χώρος;",
        help: "Μετράμε τον χώρο που θα κλιματίζεται, όχι όλο το σπίτι.",
        options: [
          { value: "a10", label: "Έως 12 m²", sub: "Υπνοδωμάτιο, γραφείο" },
          { value: "a16", label: "12 – 20 m²", sub: "Μεγάλο υπνοδωμάτιο" },
          { value: "a25", label: "20 – 30 m²", sub: "Σαλόνι" },
          { value: "a38", label: "30 – 45 m²", sub: "Σαλοκουζίνα" },
          { value: "a50", label: "Πάνω από 45 m²", sub: "Ανοιχτός χώρος" },
        ],
      },
      {
        id: "sun",
        title: "Πόσο ήλιο έχει ο χώρος;",
        options: [
          { value: "north", label: "Βόρειος / σκιερός" },
          { value: "normal", label: "Κανονικός" },
          { value: "south", label: "Νότιος, πολύ ήλιο", sub: "+15% απόδοση" },
        ],
      },
      {
        id: "insul",
        title: "Μόνωση και όροφος;",
        options: [
          { value: "good", label: "Καλή μόνωση, διπλά τζάμια" },
          { value: "mid", label: "Μέτρια" },
          { value: "poor", label: "Ρετιρέ ή παλιά μόνωση", sub: "+15% απόδοση" },
        ],
      },
      {
        id: "heat",
        title: "Θα το χρησιμοποιείς και για θέρμανση;",
        options: [
          { value: "cool", label: "Μόνο ψύξη το καλοκαίρι" },
          { value: "both", label: "Ψύξη και θέρμανση", sub: "Μετράει η κλάση θέρμανσης (SCOP)" },
        ],
      },
      {
        id: "prio",
        title: "Τι σε νοιάζει περισσότερο;",
        multi: true,
        options: [
          { value: "energy", label: "Χαμηλή κατανάλωση", sub: "Κλάση A++ / A+++" },
          { value: "quiet", label: "Να είναι αθόρυβο", sub: "Υπνοδωμάτιο" },
          { value: "wifi", label: "Έλεγχος από το κινητό", sub: "Wi-Fi" },
          { value: "air", label: "Καθαρός αέρας", sub: "Ιονιστής, φίλτρα" },
        ],
      },
      {
        id: "budget",
        title: "Ποιος είναι ο προϋπολογισμός σου;",
        help: "Η εγκατάσταση από τεχνικό του καταστήματος κοστίζει από 60 €.",
        options: [
          { value: "a1", label: "Έως 400 €" },
          { value: "a2", label: "400 – 700 €" },
          { value: "a3", label: "700 – 1.000 €" },
          { value: "a4", label: "Χωρίς όριο" },
        ],
      },
    ],
  },
};

export function isKind(k: string): k is GuideKind {
  return k in GUIDES;
}

/* ---------------- scoring ---------------- */

type Ctx = { a: Answers; attr: (k: string) => string | undefined; p: Product; reasons: string[]; cons: string[] };
const has = (a: Answers, id: string, v: string) => (a[id] ?? []).includes(v);
const one = (a: Answers, id: string) => (a[id] ?? [])[0];

function budget(ctx: Ctx, id: string, weight: number) {
  const cap = budgetCap(one(ctx.a, id));
  if (ctx.p.price <= cap) {
    if (cap !== Infinity && ctx.p.price <= cap * 0.8) ctx.reasons.push(`Μέσα στον προϋπολογισμό σου, με περιθώριο ${Math.round(cap - ctx.p.price)} €.`);
    return { s: weight, over: false };
  }
  ctx.cons.push(`Ξεπερνά τον προϋπολογισμό σου κατά ${Math.round(ctx.p.price - cap)} € (ή ${Math.ceil((ctx.p.price - cap) / 12)} €/μήνα σε 12 δόσεις).`);
  return { s: 0, over: true };
}

function scoreTv(ctx: Ctx) {
  const { a, attr, p, reasons, cons } = ctx;
  let s = 0;
  const diag = num(attr("Διαγώνιος"));
  const range = { d1: [32, 43], d2: [43, 50], d3: [50, 58], d4: [55, 65], d5: [65, 99] }[one(a, "distance") ?? "d3"]!;
  if (!isNaN(diag)) {
    if (diag >= range[0] && diag <= range[1]) {
      s += 30;
      reasons.push(`Οι ${diag}" είναι η σωστή διαγώνιος για την απόσταση που κάθεσαι (${range[0]}–${range[1] === 99 ? "75" : range[1]}").`);
    } else if (diag < range[0]) {
      const off = range[0] - diag;
      s += Math.max(0, 30 - off * 3);
      cons.push(`Στις ${diag}" θα χάνεις λεπτομέρεια από την απόσταση που κάθεσαι — ιδανικά ${range[0]}" και πάνω.`);
    } else {
      const off = diag - range[1];
      s += Math.max(0, 30 - off * 2.5);
      cons.push(`Οι ${diag}" είναι μεγαλύτερες από όσο χρειάζεσαι — από κοντά κουράζει.`);
    }
  }
  const panel = (attr("Τεχνολογία panel") ?? "").toLowerCase();
  const res = attr("Ανάλυση") ?? "";
  const hz = num(attr("Ρυθμός ανανέωσης"));
  const premium = /oled|qned|neo|mini/.test(panel);
  const mid = /qled|nano/.test(panel);
  if (has(a, "use", "movies")) {
    if (/oled/.test(panel)) {
      s += 20;
      reasons.push("OLED: τέλειο μαύρο και αντίθεση για ταινίες στο σκοτάδι.");
    } else if (premium) {
      s += 15;
      reasons.push(`Panel ${attr("Τεχνολογία panel")} με τοπικό dimming — έντονη εικόνα σε ταινίες.`);
    } else if (mid) s += 10;
    else {
      s += 5;
      cons.push("Απλό LED panel: αρκετό για καθημερινή χρήση, λιγότερη αντίθεση σε ταινίες.");
    }
    if (/4k|8k/i.test(res)) {
      s += 5;
      reasons.push(`Ανάλυση ${res} για Netflix / Disney+ σε 4K.`);
    } else cons.push(`Ανάλυση ${res || "HD"}: το 4K περιεχόμενο δεν θα φαίνεται σε πλήρη λεπτομέρεια.`);
  }
  if (has(a, "use", "sports") || has(a, "use", "gaming")) {
    if (hz >= 100) {
      s += 15;
      reasons.push(`${hz} Hz: ομαλή κίνηση σε ${has(a, "use", "gaming") ? "παιχνίδια και " : ""}αθλητικά.`);
    } else {
      s += 4;
      cons.push(`${isNaN(hz) ? "50/60" : hz} Hz: για γρήγορη κίνηση θα προτιμούσες 100 Hz.`);
    }
  }
  if (has(a, "use", "daily") && !has(a, "use", "movies") && !has(a, "use", "gaming")) {
    s += 12;
    if (p.price < 500) reasons.push("Για καθημερινή τηλεόραση δεν χρειάζεσαι premium panel — καλύτερη σχέση τιμής/απόδοσης.");
  }
  const light = one(a, "light");
  if (light === "bright") {
    if (/qled|neo|mini|qned/.test(panel)) {
      s += 10;
      reasons.push("Υψηλή φωτεινότητα (QLED / Mini LED): δεν «σβήνει» σε φωτεινό δωμάτιο.");
    } else if (/oled/.test(panel)) {
      s += 3;
      cons.push("Το OLED δείχνει πιο σκούρο σε πολύ φωτεινό χώρο.");
    } else s += 6;
  } else if (light === "dark") {
    if (/oled/.test(panel)) {
      s += 10;
      reasons.push("Σε σκοτεινό χώρο το OLED κάνει τη διαφορά.");
    } else s += 7;
  } else s += 8;
  const smart = attr("Smart TV") === "Ναι" || attr("Wi-Fi") === "Ναι" || /smart|qled|oled|nano|qned|neo/i.test(`${panel} ${p.title}`);
  if (has(a, "content", "apps")) {
    if (smart) {
      s += 6;
      reasons.push("Smart TV με Wi-Fi: Netflix, YouTube, ERTflix χωρίς εξωτερική συσκευή.");
    } else cons.push("Χωρίς Smart TV — θα χρειαστείς stick ή αποκωδικοποιητή.");
  }
  if (has(a, "content", "dvb")) {
    if (attr("DVB-T2") === "Ναι") {
      s += 4;
      reasons.push("Ενσωματωμένος δέκτης DVB-T2 / δορυφορικός για επίγεια κανάλια.");
    }
  }
  if (p.rating && p.rating.value >= 4.5) {
    s += 4;
    reasons.push(`Αξιολόγηση ${p.rating.value.toLocaleString("el-GR")}/5 από ${p.rating.count} πελάτες Euronics.`);
  }
  const eb = energyRank(attr("Ενεργειακή κλάση"));
  if (eb >= 3) s += 3;
  const b = budget(ctx, "budget", 10);
  return { s: s + b.s, over: b.over };
}

function scoreAc(ctx: Ctx) {
  const { a, attr, p, reasons, cons } = ctx;
  let s = 0;
  const m2 = { a10: 10, a16: 16, a25: 25, a38: 38, a50: 50 }[one(a, "area") ?? "a25"]!;
  let need = m2 * 330;
  if (one(a, "sun") === "south") need *= 1.15;
  if (one(a, "sun") === "north") need *= 0.92;
  if (one(a, "insul") === "poor") need *= 1.15;
  if (one(a, "insul") === "good") need *= 0.93;
  const classes = [9000, 12000, 18000, 24000];
  const target = classes.find((c) => c >= need) ?? 24000;
  const btu = num(attr("Απόδοση (BTU)"));
  if (!isNaN(btu)) {
    const ti = classes.indexOf(target);
    const bi = classes.indexOf(btu);
    if (bi === ti) {
      s += 35;
      reasons.push(`${btu.toLocaleString("el-GR")} BTU: ακριβώς η κλάση που χρειάζεται ο χώρος σου (${m2} m² → ~${Math.round(need / 100) * 100} BTU).`);
    } else if (bi === ti + 1) {
      s += 24;
      cons.push(`${btu.toLocaleString("el-GR")} BTU είναι μια κλάση πάνω από όσο χρειάζεσαι — φτάνει γρήγορα στη θερμοκρασία, κοστίζει λίγο παραπάνω.`);
    } else if (bi === ti - 1) {
      s += 10;
      cons.push(`${btu.toLocaleString("el-GR")} BTU είναι λίγα για ${m2} m² — θα δυσκολεύεται στους καύσωνες.`);
    } else {
      s += 0;
      cons.push(`${btu.toLocaleString("el-GR")} BTU δεν ταιριάζουν σε χώρο ${m2} m².`);
    }
  }
  const er = energyRank(attr("Ενεργειακή κλάση"));
  if (has(a, "prio", "energy")) {
    if (er >= 9) {
      s += 20;
      reasons.push("Κλάση A+++ στην ψύξη — η χαμηλότερη κατανάλωση της κατηγορίας.");
    } else if (er === 8) {
      s += 14;
      reasons.push("Κλάση A++ στην ψύξη.");
    } else {
      s += 5;
      cons.push(`Κλάση ${attr("Ενεργειακή κλάση") ?? "—"}: θα καταναλώνει περισσότερο από ένα A++.`);
    }
  } else s += Math.max(0, (er - 6) * 3);
  if (one(a, "heat") === "both") {
    const hc = attr("Κλάση θέρμανσης");
    if (hc && energyRank(hc) >= 8) {
      s += 10;
      reasons.push(`Κλάση θέρμανσης ${hc}: οικονομική θέρμανση τον χειμώνα.`);
    } else if (hc) s += 5;
    else if (/inverter/i.test(p.title)) {
      s += 5;
      reasons.push("Inverter: θερμαίνει αποδοτικά και τον χειμώνα.");
    }
  }
  if (has(a, "prio", "quiet")) {
    const db = num(attr("Θόρυβος"));
    if (!isNaN(db) && db <= 42) {
      s += 10;
      reasons.push(`Μόλις ${db} dB στην εσωτερική μονάδα — κατάλληλο για υπνοδωμάτιο.`);
    } else if (!isNaN(db)) {
      s += 3;
      cons.push(`${db} dB: ακούγεται στο υπνοδωμάτιο τη νύχτα.`);
    } else s += 5;
  }
  if (has(a, "prio", "wifi")) {
    if (attr("Wi-Fi") === "Ναι" || /wifi|wfi/i.test(p.title)) {
      s += 10;
      reasons.push("Wi-Fi: το ανάβεις από το κινητό πριν γυρίσεις σπίτι.");
    } else cons.push("Χωρίς Wi-Fi από το εργοστάσιο.");
  }
  if (has(a, "prio", "air")) {
    if ((attr("Ιονιστής") ?? "").startsWith("Ναι")) {
      s += 6;
      reasons.push("Ιονιστής για καθαρότερο αέρα.");
    } else cons.push("Δεν έχει ιονιστή.");
  }
  if (p.rating && p.rating.value >= 4.4) {
    s += 4;
    reasons.push(`Αξιολόγηση ${p.rating.value.toLocaleString("el-GR")}/5 από ${p.rating.count} πελάτες.`);
  }
  if (p.installation) reasons.push("Τοποθέτηση από τεχνικό του καταστήματος της περιοχής σου, με ραντεβού.");
  const b = budget(ctx, "budget", 10);
  return { s: s + b.s, over: b.over, target };
}

function scorePc(ctx: Ctx) {
  const { a, attr, p, reasons, cons } = ctx;
  let s = 0;
  const ram = num(attr("Μνήμη RAM"));
  const stor = (() => {
    const v = attr("Χωρητικότητα") ?? "";
    const n = num(v);
    return /tb/i.test(v) ? n * 1024 : n;
  })();
  const diag = num(attr("Διαγώνιος"));
  const tablet = p.subcategory === "tablets";
  const apple = p.brandSlug === "apple";
  const heavyUse = has(a, "use", "creative") || has(a, "use", "gaming") || has(a, "use", "dev");
  const needRam = heavyUse ? 16 : 8;
  if (!isNaN(ram)) {
    if (ram >= needRam) {
      s += 25;
      reasons.push(`${ram} GB RAM: ${heavyUse ? "άνετα για επεξεργασία, IDE και πολλά tabs" : "παραπάνω από αρκετά για γραφείο και σπουδές"}.`);
    } else {
      s += 8;
      cons.push(`${ram} GB RAM: για ${has(a, "use", "creative") ? "βίντεο" : has(a, "use", "gaming") ? "gaming" : "προγραμματισμό"} θα ήθελες 16 GB.`);
    }
  } else s += tablet ? 10 : 12;
  const cpu = `${attr("Επεξεργαστής") ?? ""} ${p.title}`;
  if (has(a, "use", "creative")) {
    if (/\bM[1-5]\b/.test(cpu)) {
      s += 12;
      reasons.push("Apple Silicon: γρήγορη εξαγωγή βίντεο και αθόρυβη λειτουργία.");
    } else if (/rtx|ultra|i7|ryzen 7/i.test(cpu)) s += 10;
    else if (tablet) {
      s += 4;
      cons.push("Tablet: καλό για επεξεργασία φωτογραφίας, όχι για μεγάλα project βίντεο.");
    } else s += 5;
  }
  if (has(a, "use", "gaming")) {
    if (/rtx|gaming|rog|legion|omen|tuf/i.test(cpu)) {
      s += 12;
      reasons.push("Ξεχωριστή κάρτα γραφικών για gaming.");
    } else {
      s += 2;
      cons.push("Χωρίς ξεχωριστή κάρτα γραφικών — μόνο ελαφριά παιχνίδια.");
    }
  }
  if (has(a, "use", "dev")) {
    if (tablet) cons.push("Σε tablet δεν τρέχουν πλήρη εργαλεία ανάπτυξης.");
    else s += 8;
  }
  if (has(a, "use", "office") || has(a, "use", "media")) {
    s += 8;
    if (tablet && has(a, "use", "media")) reasons.push("Tablet: ό,τι πρέπει για καναπέ, ταξίδι και ταινίες.");
  }
  const mob = one(a, "mobility");
  if (!isNaN(diag)) {
    if (mob === "always") {
      if (diag <= 14) {
        s += 20;
        reasons.push(`${diag}": ελαφρύς, χωράει σε κάθε τσάντα.`);
      } else {
        s += 8;
        cons.push(`${diag}" είναι πολλά για καθημερινή μεταφορά.`);
      }
    } else if (mob === "some") {
      if (diag >= 13 && diag <= 16) {
        s += 20;
        reasons.push(`${diag}": ισορροπία οθόνης και βάρους.`);
      } else s += 10;
    } else {
      if (diag >= 15) {
        s += 20;
        reasons.push(`${diag}": μεγάλη οθόνη για το γραφείο.`);
      } else {
        s += 10;
        cons.push(`${diag}": στο γραφείο θα ήθελες 15–16" ή εξωτερική οθόνη.`);
      }
    }
  }
  const os = one(a, "os");
  if (os === "mac") {
    if (apple) {
      s += 15;
      reasons.push("macOS / iPadOS: συνεργάζεται με το iPhone σου (AirDrop, iMessage, Handoff).");
    } else cons.push("Windows, ενώ προτιμάς macOS.");
  } else if (os === "win") {
    if (!apple && !tablet) {
      s += 15;
      reasons.push("Windows 11 για τα προγράμματα της δουλειάς.");
    } else cons.push(apple ? "macOS, ενώ ζήτησες Windows." : "Tablet, όχι Windows.");
  } else s += 12;
  const needStor = { s1: 256, s2: 512, s3: 1024 }[one(a, "storage") ?? "s1"]!;
  if (!isNaN(stor)) {
    if (stor >= needStor) {
      s += 20;
      reasons.push(`${stor >= 1024 ? `${stor / 1024} TB` : `${stor} GB`} αποθηκευτικός χώρος — ${stor > needStor ? "με περιθώριο" : "όσος ζήτησες"}.`);
    } else {
      s += 6;
      cons.push(`${stor} GB: θα χρειαστείς εξωτερικό δίσκο ή cloud για ${needStor >= 1024 ? "1 TB" : `${needStor} GB`}.`);
    }
  }
  if (p.rating && p.rating.value >= 4.5) {
    s += 4;
    reasons.push(`Αξιολόγηση ${p.rating.value.toLocaleString("el-GR")}/5 από ${p.rating.count} πελάτες.`);
  }
  if (p.isRenew) reasons.push("Renew: ανακατασκευασμένο με εγγύηση Euronics, έως 40% φθηνότερο.");
  const b = budget(ctx, "budget", 10);
  return { s: s + b.s, over: b.over };
}

const MAX: Record<GuideKind, number> = { tileoraseis: 112, ypologistes: 118, klimatistika: 115 };

export function evaluate(kind: GuideKind, products: Product[], a: Answers): GuideResult {
  const def = GUIDES[kind];
  const ranked: Scored[] = products.map((p) => {
    const attrs = attributesOf(p);
    const ctx: Ctx = { a, attr: (k) => attrs.find((x) => x.key === k)?.value, p, reasons: [], cons: [] };
    const r = kind === "tileoraseis" ? scoreTv(ctx) : kind === "klimatistika" ? scoreAc(ctx) : scorePc(ctx);
    return { product: p, score: r.s, pct: Math.max(5, Math.min(99, Math.round((r.s / MAX[kind]) * 100))), reasons: ctx.reasons, cons: ctx.cons, overBudget: r.over };
  });
  ranked.sort((x, y) => Number(x.overBudget) - Number(y.overBudget) || y.score - x.score);

  const needs: Need[] = [];
  const qs = new URLSearchParams();
  if (kind === "tileoraseis") {
    const range = { d1: "32–43\"", d2: "43–50\"", d3: "50–58\"", d4: "55–65\"", d5: "65\"+" }[one(a, "distance") ?? "d3"]!;
    needs.push({ label: "Διαγώνιος", value: range });
    needs.push({ label: "Ανάλυση", value: has(a, "use", "movies") || has(a, "use", "gaming") ? "4K UHD" : "Full HD ή 4K" });
    needs.push({ label: "Ρυθμός ανανέωσης", value: has(a, "use", "sports") || has(a, "use", "gaming") ? "100 Hz" : "50/60 Hz αρκούν" });
    needs.push({ label: "Panel", value: one(a, "light") === "bright" ? "QLED / Mini LED" : one(a, "light") === "dark" && has(a, "use", "movies") ? "OLED" : "LED / QLED" });
    if (has(a, "content", "apps")) needs.push({ label: "Smart TV", value: "Ναι, με Wi-Fi" });
  } else if (kind === "klimatistika") {
    const t = (ranked[0] && (scoreAc({ a, attr: (k) => attributesOf(ranked[0].product).find((x) => x.key === k)?.value, p: ranked[0].product, reasons: [], cons: [] }).target as number)) || 12000;
    needs.push({ label: "Απόδοση", value: `${t.toLocaleString("el-GR")} BTU` });
    qs.set("f_Απόδοση (BTU)", `${t.toLocaleString("el-GR")} BTU`);
    needs.push({ label: "Ενεργειακή κλάση", value: has(a, "prio", "energy") ? "A+++" : "A++ και πάνω" });
    if (one(a, "heat") === "both") needs.push({ label: "Θέρμανση", value: "Κλάση θέρμανσης A++ / SCOP ≥ 4" });
    if (has(a, "prio", "quiet")) needs.push({ label: "Θόρυβος", value: "≤ 42 dB" });
    if (has(a, "prio", "wifi")) needs.push({ label: "Wi-Fi", value: "Ναι" });
  } else {
    const heavyUse = has(a, "use", "creative") || has(a, "use", "gaming") || has(a, "use", "dev");
    needs.push({ label: "Μνήμη RAM", value: heavyUse ? "16 GB" : "8 GB" });
    needs.push({ label: "Αποθήκευση", value: { s1: "256 GB", s2: "512 GB", s3: "1 TB" }[one(a, "storage") ?? "s1"]! });
    needs.push({ label: "Οθόνη", value: { always: "13–14\"", some: "14–16\"", desk: "15–16\"+" }[one(a, "mobility") ?? "some"]! });
    if (one(a, "os") !== "any") needs.push({ label: "Λειτουργικό", value: one(a, "os") === "mac" ? "macOS / iPadOS" : "Windows 11" });
    if (has(a, "use", "gaming")) needs.push({ label: "Γραφικά", value: "Ξεχωριστή κάρτα (RTX)" });
  }
  const cap = budgetCap(one(a, "budget"));
  if (cap !== Infinity) {
    needs.push({ label: "Προϋπολογισμός", value: `έως ${cap} €` });
    qs.set("max", String(cap));
  }
  const q = qs.toString();
  return { needs, ranked, listHref: q ? `${def.listHref}?${q}` : def.listHref };
}
