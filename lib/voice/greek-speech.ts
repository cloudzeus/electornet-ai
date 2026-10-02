/**
 * Ό,τι η μηχανή φωνής (ElevenLabs) διαβάζει άσχημα στα ελληνικά, γραμμένο όπως το λέει ένας Έλληνας πωλητής:
 *  - αριθμοί σε λέξεις, με το σωστό γένος («τρεις ώρες», «τρία χρόνια», «είκοσι μία χιλιάδες»), δεκαδικά, τιμές, διαστήματα
 *  - αγγλικά αρκτικόλεξα και μάρκες με ελληνική φωνητική γραφή («μπι-τι-γιου», «ελ-τζι», «σάμσουνγκ»)
 *  - κωδικοί μοντέλων γράμμα-γράμμα («CTN-335BRM» → «σι-τι-εν τριακόσια τριάντα πέντε μπι-αρ-εμ»)
 * Καθαρή συνάρτηση, ίδιο αποτέλεσμα σε browser και server (κλειδί cache).
 */

const U_N = ["μηδέν", "ένα", "δύο", "τρία", "τέσσερα", "πέντε", "έξι", "εφτά", "οχτώ", "εννιά", "δέκα", "έντεκα", "δώδεκα", "δεκατρία", "δεκατέσσερα", "δεκαπέντε", "δεκαέξι", "δεκαεφτά", "δεκαοχτώ", "δεκαεννιά"];
const TENS = ["", "", "είκοσι", "τριάντα", "σαράντα", "πενήντα", "εξήντα", "εβδομήντα", "ογδόντα", "ενενήντα"];
const HUND = ["", "εκατό", "διακόσια", "τριακόσια", "τετρακόσια", "πεντακόσια", "εξακόσια", "εφτακόσια", "οχτακόσια", "εννιακόσια"];

/** g: n = ουδέτερο (προεπιλογή), f = θηλυκό, m = αρσενικό (επηρεάζει 1, 3, 4, 13, 14 και τις εκατοντάδες) */
type G = "n" | "f" | "m";
function under100(n: number, g: G): string {
  if (n < 20) {
    if (g !== "n") {
      if (n === 1) return g === "f" ? "μία" : "ένας";
      if (n === 3) return "τρεις";
      if (n === 4) return "τέσσερις";
      if (n === 13) return "δεκατρείς";
      if (n === 14) return "δεκατέσσερις";
    }
    return U_N[n];
  }
  const t = Math.floor(n / 10), u = n % 10;
  return u ? `${TENS[t]} ${under100(u, g)}` : TENS[t];
}
function under1000(n: number, g: G): string {
  if (n < 100) return under100(n, g);
  const h = Math.floor(n / 100), r = n % 100;
  let hw = HUND[h];
  if (h === 1) hw = r ? "εκατόν" : "εκατό";
  else if (g === "f") hw = hw.replace(/α$/, "ες");
  else if (g === "m") hw = hw.replace(/α$/, "οι");
  return r ? `${hw} ${under100(r, g)}` : hw;
}
/** Ακέραιος σε λέξεις (έως δισεκατομμύρια). */
export function greekNumber(n: number, g: G = "n"): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `μείον ${greekNumber(-n, g)}`;
  n = Math.floor(n);
  if (n === 0) return "μηδέν";
  const parts: string[] = [];
  const bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  if (bil) parts.push(bil === 1 ? "ένα δισεκατομμύριο" : `${greekNumber(bil)} δισεκατομμύρια`);
  if (mil) parts.push(mil === 1 ? "ένα εκατομμύριο" : `${under1000(mil, "n")} εκατομμύρια`);
  if (th) parts.push(th === 1 ? (g === "f" ? "χίλιες" : g === "m" ? "χίλιοι" : "χίλια") : `${under1000(th, "f")} χιλιάδες`);
  if (rest) parts.push(under1000(rest, g));
  return parts.join(" ");
}

/** Τα ψηφία μετά την υποδιαστολή: «0,08» → «μηδέν οχτώ», «2,5» → «πέντε», «2,25» → «είκοσι πέντε». */
function decimals(d: string): string {
  const lead = d.match(/^0+/)?.[0] ?? "";
  const rest = d.slice(lead.length);
  return [...lead].map(() => "μηδέν").concat(rest ? [greekNumber(Number(rest))] : []).join(" ");
}

// γένος από τη λέξη που ακολουθεί τον αριθμό
const FEM = /^(ώρ|ημέρ|μέρ|εβδομάδ|κιλοβατώρ|βατώρ|ίντσ|ιντσ|στροφ|θέσ|θέσε|ταχύτητ|ζών|λειτουργ|πόρτ|εστί|φορ|χιλιάδ|θερμίδ|μονάδ|συσκευ|δόσ|μπαταρ|κάμερ|οθόν|λάμπ|γραμμ|μέθοδ|επιλογ|ρυθμίσ|κλάσ|βαθμίδ|άτοκ|έντοκ|μηνιαί|ετήσι)/i;
// αρσενικά — ακριβείς τύποι: «χρόνια» είναι ουδέτερο («τρία χρόνια»), «χρόνος» αρσενικό («ένας χρόνος»)
const MASC = /^(μήνας|μήνα|μήνες|χρόνος|χρόνο|βαθμός|βαθμό|βαθμοί|βαθμούς|τόνοι|τόνους|κύκλοι|κύκλους|τροχοί|ανεμιστήρες|πελάτες|τεχνικοί)$/i;
function genderOf(after: string): G {
  const next = after.trimStart().match(/^[\p{L}]+/u)?.[0] ?? "";
  if (!next) return "n";
  if (FEM.test(next)) return "f";
  if (MASC.test(next)) return "m";
  return "n";
}

const LETTER: Record<string, string> = { A: "έι", B: "μπι", C: "σι", D: "ντι", E: "ι", F: "εφ", G: "τζι", H: "έιτς", I: "άι", J: "τζέι", K: "κέι", L: "ελ", M: "εμ", N: "εν", O: "όου", P: "πι", Q: "κιου", R: "αρ", S: "ες", T: "τι", U: "γιου", V: "βι", W: "ντάμπλιου", X: "εξ", Y: "γουάι", Z: "ζεντ" };
const spellLetters = (s: string) => [...s.toUpperCase()].map((c) => LETTER[c] ?? c).join("-");

/** Λέξεις και αρκτικόλεξα της αγοράς, όπως τα λέμε στα ελληνικά (χωρίς διάκριση πεζών/κεφαλαίων). */
const LEXICON: [string, string][] = [
  ["Wi-Fi", "γουάι-φάι"], ["WiFi", "γουάι-φάι"], ["Bluetooth", "μπλουτούθ"], ["Smart TV", "σμαρτ τι-βι"], ["Smart", "σμαρτ"], ["Inverter", "ινβέρτερ"],
  ["No Frost", "νο φροστ"], ["Total No Frost", "τοτάλ νο φροστ"], ["Full HD", "φουλ έιτς-ντι"], ["Ultra HD", "άλτρα έιτς-ντι"], ["UHD", "γιου-έιτς-ντι"],
  ["HDR10+", "έιτς-ντι-αρ τεν πλας"], ["HDR10", "έιτς-ντι-αρ τεν"], ["HDR", "έιτς-ντι-αρ"], ["Dolby Atmos", "ντόλμπι άτμος"], ["Dolby Vision", "ντόλμπι βίζιον"], ["Dolby", "ντόλμπι"],
  ["Mini LED", "μίνι λεντ"], ["MiniLED", "μίνι λεντ"], ["OLED", "όλεντ"], ["QLED", "κιου-λεντ"], ["QNED", "κιου-νεντ"], ["NanoCell", "νάνοσελ"], ["LED", "λεντ"], ["LCD", "ελ-σι-ντι"],
  ["4K", "φορ κέι"], ["8K", "έιτ κέι"], ["5G", "φάιβ τζι"], ["4G", "φορ τζι"], ["TV", "τι-βι"], ["AI", "έι-άι"], ["Google TV", "γκουγκλ τι-βι"], ["Google", "γκουγκλ"],
  ["Android TV", "άντροϊντ τι-βι"], ["Android", "άντροϊντ"], ["webOS", "γουέμπ-όου-ες"], ["Tizen", "τάιζεν"], ["VIDAA", "βίντα"], ["Netflix", "νέτφλιξ"], ["YouTube", "γιουτιούμπ"],
  ["BTU", "μπι-τι-γιου"], ["SEER", "σιρ"], ["SCOP", "σκοπ"], ["EER", "ι-ι-αρ"], ["COP", "κοπ"], ["HEPA", "χέπα"], ["Plasma", "πλάσμα"], ["Turbo", "τούρμπο"], ["Eco", "ίκο"],
  ["HDMI", "έιτς-ντι-εμ-άι"], ["USB-C", "γιου-ες-μπι σι"], ["USB", "γιου-ες-μπι"], ["NFC", "εν-εφ-σι"], ["GPS", "τζι-πι-ες"], ["RAM", "ραμ"], ["SSD", "ες-ες-ντι"], ["CPU", "σι-πι-γιου"],
  ["GB", "γκιγκαμπάιτ"], ["TB", "τεραμπάιτ"], ["MB", "μεγκαμπάιτ"], ["Hz", "χερτζ"], ["MHz", "μεγκαχέρτζ"], ["GHz", "γκιγκαχέρτζ"], ["fps", "καρέ το δευτερόλεπτο"],
  ["iPhone", "άιφον"], ["iPad", "άιπαντ"], ["MacBook", "μάκμπουκ"], ["AirPods", "έαρποντς"], ["Galaxy", "γκάλαξι"], ["PlayStation", "πλέιστέισον"], ["Xbox", "εξ-μποξ"],
  ["Samsung", "σάμσουνγκ"], ["LG", "ελ-τζι"], ["AEG", "έι-ι-τζι"], ["Bosch", "μπος"], ["Siemens", "ζίμενς"], ["Pitsos", "Πίτσος"], ["Toyotomi", "τογιοτόμι"], ["Inventor", "ινβέντορ"],
  ["Fujitsu", "φουτζίτσου"], ["Daikin", "ντάικιν"], ["Mitsubishi", "μιτσουμπίσι"], ["Gree", "γκρι"], ["Midea", "μίντεα"], ["Hisense", "χάισενς"], ["Sony", "σόνι"], ["Philips", "φίλιπς"],
  ["Whirlpool", "γουέρλπουλ"], ["Beko", "μπέκο"], ["Miele", "μίλε"], ["Indesit", "ιντεζίτ"], ["Candy", "κάντι"], ["Hotpoint", "χότποϊντ"], ["Electrolux", "ελεκτρολάξ"],
  ["Sharp", "σαρπ"], ["Panasonic", "πανασόνικ"], ["TCL", "τι-σι-ελ"], ["Xiaomi", "σιαόμι"], ["Apple", "άπλ"], ["Haier", "χάιερ"], ["Neff", "νεφ"], ["Gorenje", "γκορένιε"],
  ["Tefal", "τεφάλ"], ["Rowenta", "ροβέντα"], ["Delonghi", "ντελόνγκι"], ["De'Longhi", "ντελόνγκι"], ["Dyson", "ντάισον"], ["Kenwood", "κένγουντ"], ["Braun", "μπράουν"],
  ["Euronics", "Γιουρόνικς"], ["Ermis", "Ερμής"],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEX_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${LEXICON.map(([k]) => esc(k)).join("|")})(?![\\p{L}\\p{N}+])`, "giu");
const LEX = new Map(LEXICON.map(([k, v]) => [k.toLowerCase(), v]));

/** Κωδικός μοντέλου (γράμματα + ψηφία): γράμματα με το όνομά τους, ψηφία ως αριθμοί. */
function spellCode(code: string): string {
  return code.split(/[-/_.]+/).filter(Boolean).map((seg) => seg.match(/[A-Za-z]+|\d+/g)?.map((run) => {
    if (/^\d+$/.test(run)) return run.length <= 3 ? greekNumber(Number(run)) : run.length === 4 ? `${greekNumber(Number(run.slice(0, 2)))} ${greekNumber(Number(run.slice(2)))}` : [...run].map((d) => U_N[Number(d)]).join(" ");
    return spellLetters(run);
  }).join(" ") ?? seg).join(" ");
}

export function greekSpeech(input: string): string {
  let t = input;
  // ερωτηματικό: το ελληνικό «;» (και το U+037E) — αλλιώς η φωνή δεν ανεβαίνει στην ερώτηση
  t = t.replace(/[;;](?=\s|$|["»”)])/gu, "?");
  // λεξικό αγοράς (πριν από τους αριθμούς: «4K», «HDR10»)
  t = t.replace(LEX_RE, (m) => LEX.get(m.toLowerCase()) ?? m);
  // κωδικοί μοντέλων: λατινικά γράμματα ΚΑΙ ψηφία στο ίδιο «κομμάτι» (π.χ. CTN-335BRM, QE55Q70, R32)
  t = t.replace(/(?<![\p{L}\p{N}])(?=[A-Za-z0-9\-/]*\d)(?=[A-Za-z0-9\-/]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9\-/]{1,}(?![\p{L}\p{N}])/gu, (m) => spellCode(m));
  // αρκτικόλεξα με κεφαλαία (2–4 γράμματα) που δεν είναι στο λεξικό: γράμμα-γράμμα· μεγαλύτερα κεφαλαία → λέξη
  t = t.replace(/(?<![\p{L}\p{N}])[A-Z]{2,}(?![\p{L}\p{N}])/gu, (m) => (m.length <= 4 ? spellLetters(m) : m[0] + m.slice(1).toLowerCase()));
  // τιμές: «77,42 ευρώ» → «… ευρώ και σαράντα δύο λεπτά», «349,00 ευρώ» → «… ευρώ»
  t = t.replace(/(\d+),(\d{2}) ευρώ/gu, (_m, e: string, c: string) => `${greekNumber(Number(e))} ευρώ${Number(c) ? ` και ${greekNumber(Number(c))} λεπτά` : ""}`);
  // διαστήματα: «12-18» → «12 έως 18»
  t = t.replace(/(?<![\p{L}\p{N}])(\d+)\s?[-–]\s?(\d+)(?![\p{L}\p{N}])/gu, "$1 έως $2");
  // δεκαδικά (ελληνικό κόμμα ή τελεία με 1–2 ψηφία): «2,5» → «δύο κόμμα πέντε»
  t = t.replace(/(?<![\p{L}\p{N}])(\d+)[,.](\d{1,3})(?![\p{L}\p{N}])/gu, (_m, a: string, b: string) => `${greekNumber(Number(a))} κόμμα ${decimals(b)}`);
  // ακέραιοι, με το γένος της λέξης που ακολουθεί
  t = t.replace(/(?<![\p{L}\p{N}])(\d{1,12})(?![\p{L}\p{N}])/gu, (m, d: string, offset: number, all: string) => {
    const w = greekNumber(Number(d), genderOf(all.slice(offset + m.length)));
    // γενική μετά από «των»: «των δώδεκα χιλιάδων», «των δύο εκατομμυρίων»
    return /(?:^|\s)των\s$/u.test(all.slice(Math.max(0, offset - 5), offset)) ? w.replace(/χιλιάδες$/u, "χιλιάδων").replace(/εκατομμύρια$/u, "εκατομμυρίων") : w;
  });
  return t.replace(/\s+/g, " ").trim();
}
