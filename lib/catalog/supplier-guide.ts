import "server-only";
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import { db } from "@/lib/db";
import { FIELDS, groupOfCategory, loadGroups, plain, type SheetKind } from "@/lib/catalog/supplier-sheet";
import { BANNERS, IMAGES, VIDEOS } from "@/lib/catalog/supplier-media";

/**
 * «Οδηγίες συμπλήρωσης» σε Word, για το πακέτο που στέλνουμε στον προμηθευτή μαζί με τα excel. Φτιάχνεται τη στιγμή της
 * λήψης, για τη συγκεκριμένη μάρκα και τις κατηγορίες της: βήματα, κανόνες, κάθε στήλη με παράδειγμα, τα χαρακτηριστικά
 * κάθε κατηγορίας με τις προτεινόμενες τιμές τους, πολυμέσα, συχνά λάθη και έλεγχος πριν την αποστολή.
 */
const NAVY = "0B1F4D", BLUE = "1E5AAB", GREY = "EEF1F6", LINE = "C9D1DE", FONT = "Arial";
/** A4 (11906 twips) μείον περιθώρια 2 × 1100 → πλάτος κειμένου σε twips· οι πίνακες με σταθερές στήλες για κάθε πρόγραμμα (Word, Pages, LibreOffice) */
const TEXT_W = 11906 - 2 * 1100;
const dxa = (pct: number) => Math.round((TEXT_W * pct) / 100);
const EXAMPLE: Partial<Record<string, string>> = {
  mtrl: "84512 (υπάρχει ήδη, μην το αλλάξετε)", code: "WW90T554DAW", name: "WW90T554DAW ΠΛΥΝΤΗΡΙΟ ΡΟΥΧΩΝ 9KG", barcode: "8806094587345", factoryCode: "WW90T554DAW/S6",
  shortDesc: "Πλυντήριο ρούχων 9 kg με τεχνολογία EcoBubble και ατμό.", descText: "Δύο-τρεις παράγραφοι για το προϊόν, χωρίς τα χαρακτηριστικά.",
  guaranteeMonths: "24", widthCm: "60", heightCm: "85", lengthCm: "55", weightKg: "68,5",
};

const t = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color });
const p = (runs: string | TextRun[], o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) => new Paragraph({ children: typeof runs === "string" ? [t(runs)] : runs, spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 300 }, alignment: o.align });
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(text, { bold: true, color: NAVY, size: 32 })], spacing: { before: 360, after: 160 }, pageBreakBefore: false });
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(text, { bold: true, color: BLUE, size: 26 })], spacing: { before: 280, after: 120 } });
const h3 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t(text, { bold: true, color: NAVY, size: 22 })], spacing: { before: 200, after: 80 } });
const bullet = (text: string | TextRun[]) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: typeof text === "string" ? [t(text)] : text, spacing: { after: 80, line: 290 } });
const step = (text: string | TextRun[], ref = "steps") => new Paragraph({ numbering: { reference: ref, level: 0 }, children: typeof text === "string" ? [t(text)] : text, spacing: { after: 100, line: 290 } });
const check = (text: string) => new Paragraph({ children: [t("☐  ", { color: BLUE, bold: true }), t(text)], spacing: { after: 90, line: 290 }, indent: { left: 240 } });
const tip = (title: string, text: string) => new Paragraph({
  children: [t(`${title}  `, { bold: true, color: NAVY }), t(text)],
  shading: { type: ShadingType.CLEAR, fill: GREY, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 8 } },
  spacing: { before: 120, after: 160, line: 290 }, indent: { left: 120, right: 120 },
});

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const cell = (text: string | TextRun[], o: { head?: boolean; width?: number; fill?: string } = {}) => new TableCell({
  children: [new Paragraph({ children: typeof text === "string" ? [t(text, o.head ? { bold: true, color: "FFFFFF", size: 19 } : { size: 19 })] : text, spacing: { after: 40, line: 270 } })],
  width: o.width ? { size: dxa(o.width), type: WidthType.DXA } : undefined,
  shading: o.head ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  borders: { top: border, bottom: border, left: border, right: border },
});
const table = (head: string[], rows: (string | TextRun[])[][], widths: number[]) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA },
  columnWidths: widths.map(dxa),
  layout: TableLayoutType.FIXED,
  rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { head: true, width: widths[i] })) }), ...rows.map((r, k) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, { width: widths[i], fill: k % 2 ? "F7F9FC" : undefined })) }))],
});
const gap = () => p("", { after: 60 });

export async function buildSupplierGuide(brandId: string, groupIds: number[], kinds: SheetKind[], files: string[]): Promise<{ buffer: Buffer; filename: string }> {
  const brand = await db.brand.findUnique({ where: { id: brandId }, select: { name: true } });
  if (!brand) throw new Error("Η μάρκα δεν βρέθηκε.");
  const groups = await loadGroups(groupIds);
  const ordered = groupIds.map((id) => groups.get(id)).filter((g): g is NonNullable<typeof g> => !!g);
  // προτεινόμενες τιμές ανά χαρακτηριστικό: όσες ορίζει το SoftOne και οι πιο συχνές που ήδη χρησιμοποιούνται
  const cats = await db.category.findMany({ where: { erpCode: { in: ordered.map((g) => `s1:g:${g.s1Id}`) } }, select: { id: true, erpCode: true, name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } });
  const catOf = new Map(cats.map((c) => [groupOfCategory(c.erpCode)!, c]));
  const specs = await db.spec.findMany({ where: { product: { categoryId: { in: cats.map((c) => c.id) } } }, select: { key: true, value: true, product: { select: { categoryId: true } } } });
  // ίδια τιμή με άλλη γραφή («ΝΑΙ», «Ναι», «Yes») = μία πρόταση, στην ελληνική μορφή
  const canon = (v: string) => { const k = plain(v); return /^(ναι|yes|true)$/.test(k) ? "Ναι" : /^(οχι|no|false)$/.test(k) ? "Όχι" : v.trim(); };
  const suggest = (catId: string | undefined, name: string, options: string[]) => {
    const used = new Map<string, { v: string; n: number }>();
    for (const s of specs) if (s.product.categoryId === catId && plain(s.key) === plain(name) && s.value.length <= 40) { const v = canon(s.value), k = plain(v); const e = used.get(k); used.set(k, { v: e?.v ?? v, n: (e?.n ?? 0) + 1 }); }
    const seen = new Set<string>(), out: string[] = [];
    for (const v of [...options.map(canon), ...[...used.values()].sort((a, b) => b.n - a.n).map((x) => x.v)]) { const k = plain(v); if (k && !seen.has(k)) { seen.add(k); out.push(v); } }
    return out.slice(0, 8);
  };
  const auto = (name: string) => { const k = plain(name); return /^(εταιρε?ια|κατασκευαστησ|μαρκα|brand)$/.test(k) ? "Συμπληρώνεται αυτόματα από τη μάρκα. Αφήστε το κενό." : /^(ευροσ τιμησ|τιμη)$/.test(k) ? "Υπολογίζεται αυτόματα από την τιμή. Αφήστε το κενό." : null; };
  const hasData = kinds.includes("existing") || kinds.includes("new"), hasMedia = kinds.includes("media");
  const date = new Date().toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });
  // αρίθμηση ενοτήτων: 1-3 πάντα, 4-5 στοιχεία, μετά πολυμέσα, μετά συχνά λάθη / έλεγχος / αποστολή
  const secMedia = hasData ? 6 : 4, secErrors = (hasMedia ? secMedia : hasData ? 5 : 3) + 1, secCheck = secErrors + 1, secSend = secCheck + 1;
  const clean = (s: string) => s.replace(/\s+—\s+/g, ": ").replace(/–/g, "-");

  const body: (Paragraph | Table)[] = [
    new Paragraph({ children: [t("Euronics", { bold: true, color: BLUE, size: 22 })], spacing: { after: 40 } }),
    new Paragraph({ children: [t("Οδηγίες συμπλήρωσης", { bold: true, color: NAVY, size: 44 })], spacing: { after: 60 } }),
    new Paragraph({ children: [t(`${brand.name} · ${ordered.length} ${ordered.length === 1 ? "κατηγορία" : "κατηγορίες"} · ${date}`, { color: "5B6577", size: 22 })], spacing: { after: 240 } }),
    p("Σας ευχαριστούμε που μας βοηθάτε να παρουσιάσουμε σωστά τα προϊόντα σας. Τα αρχεία αυτού του πακέτου είναι φτιαγμένα ειδικά για τη μάρκα σας και τις κατηγορίες της, με τα χαρακτηριστικά που χρησιμοποιεί σήμερα το κατάστημά μας. Αυτό το έγγραφο εξηγεί βήμα-βήμα πώς τα συμπληρώνετε, ώστε τα στοιχεία να περάσουν αυτόματα και χωρίς διορθώσεις."),

    h1("1. Τι περιέχει το πακέτο"),
    table(["Αρχείο", "Σε τι χρησιμεύει"], [
      ...files.map((f) => [f, /yparxonta/.test(f) ? "Τα προϊόντα σας που υπάρχουν ήδη στο κατάστημα, με τα στοιχεία που έχουμε. Διορθώνετε ή συμπληρώνετε ό,τι λείπει." : /nea/.test(f) ? "Κενές γραμμές για νέα προϊόντα που θέλετε να προσθέσουμε." : /fotografies|media/.test(f) ? "Διευθύνσεις (links) για φωτογραφίες, banners και βίντεο ανά προϊόν." : "Αρχείο συμπλήρωσης."]),
      ["Οδηγίες συμπλήρωσης (αυτό το έγγραφο)", "Πώς συμπληρώνονται τα παραπάνω, με παραδείγματα."],
    ], [38, 62]),
    tip("Σημαντικό:", "Συμπληρώνετε μόνο τα excel. Μην δημιουργήσετε δικά σας αρχεία ή αντίγραφα με άλλη μορφή: το σύστημά μας αναγνωρίζει τα αρχεία από κρυφά στοιχεία που περιέχουν."),

    h1("2. Γρήγορα, σε 6 βήματα"),
    step("Ανοίξτε κάθε excel και διαβάστε το πρώτο φύλλο «Οδηγίες»."),
    step("Κάθε φύλλο (καρτέλα κάτω) είναι μία κατηγορία προϊόντων, π.χ. «Πλυντήρια ρούχων». Μία γραμμή = ένα προϊόν."),
    step("Συμπληρώστε τα βασικά στοιχεία (σκούρες στήλες) και τα χαρακτηριστικά της κατηγορίας (μπλε στήλες)."),
    step("Στα χαρακτηριστικά διαλέξτε από τη λίστα του κελιού όταν ταιριάζει· αλλιώς γράψτε δική σας τιμή με τον ίδιο τρόπο."),
    step(`Ελέγξτε τη λίστα της ενότητας ${secCheck} («Έλεγχος πριν την αποστολή»).`),
    step("Στείλτε μας πίσω τα excel με τα ίδια ονόματα αρχείων."),

    h1("3. Γενικοί κανόνες"),
    bullet([t("Μην αλλάζετε ", {}), t("ονόματα φύλλων, επικεφαλίδες στηλών ή τη σειρά τους", { bold: true }), t(" και μην προσθέτετε ή διαγράφετε στήλες. Με αυτά αναγνωρίζουμε τι είναι κάθε τιμή.")]),
    bullet([t("Κενό κελί σημαίνει «καμία αλλαγή»", { bold: true }), t(": δεν σβήνει ό,τι υπάρχει ήδη στο κατάστημα. Για να διορθώσετε μια τιμή, γράψτε τη σωστή.")]),
    bullet("Ένα προϊόν ανά γραμμή. Χωρίς κενές γραμμές ανάμεσα, χωρίς συγχωνευμένα κελιά, χωρίς τύπους (formulas) και χωρίς εικόνες μέσα στο excel."),
    bullet([t("Μονάδες: ", { bold: true }), t("διαστάσεις σε εκατοστά (cm), βάρος σε κιλά (kg), εγγύηση σε μήνες. Γράφετε μόνο τον αριθμό, χωρίς τη μονάδα.")]),
    bullet("Δεκαδικοί αριθμοί με κόμμα ή τελεία (68,5 ή 68.5). Χωρίς διαχωριστικό χιλιάδων."),
    bullet("Κείμενα στα ελληνικά, όπως θα τα διαβάσει ο πελάτης. Αποφύγετε κεφαλαία σε ολόκληρες φράσεις και διαφημιστικά σύμβολα (★, !!!)."),
    bullet("Τα σχόλια στις επικεφαλίδες (κόκκινο τρίγωνο στη γωνία) εξηγούν κάθε στήλη. Περάστε το ποντίκι από πάνω για να τα δείτε."),
    bullet("Οι στήλες με κίτρινο φόντο σε μια γραμμή που έχει στοιχεία σημαίνουν ότι λείπει υποχρεωτικό πεδίο."),
  ];

  if (hasData) {
    body.push(
      h1("4. Τα βασικά στοιχεία κάθε προϊόντος"),
      p("Οι σκούρες στήλες στην αρχή κάθε φύλλου. Ίδιες σε όλες τις κατηγορίες."),
      table(["Στήλη", "Τι γράφετε", "Παράδειγμα"], FIELDS.filter((f) => !f.only || kinds.includes(f.only)).map((f) => [
        [t(f.header, { bold: true, size: 19 }), ...(f.required ? [t("  υποχρεωτικό", { color: "B42318", size: 17, bold: true })] : []), ...(f.only === "existing" ? [t("  μόνο στα υπάρχοντα", { color: "5B6577", size: 17 })] : [])],
        clean(f.note), EXAMPLE[f.key] ?? "",
      ]), [24, 50, 26]),
      kinds.includes("existing") ? tip("Υπάρχοντα προϊόντα:", "Οι γκρι στήλες MTRL και «Κωδικός είδους» είναι το κλειδί του προϊόντος στο σύστημά μας. Μην τις αλλάξετε και μην αλλάξετε τη σειρά των γραμμών μεταξύ φύλλων. Αν ένα προϊόν δεν κυκλοφορεί πια, γράψτε το στο σημείωμα της αποστολής σας, μην σβήσετε τη γραμμή.") : gap(),
      kinds.includes("new") ? tip("Νέα προϊόντα:", "Συμπληρώστε τουλάχιστον Όνομα και Barcode (EAN-13). Ο «Κωδικός είδους» είναι προαιρετικός: αν μείνει κενός χρησιμοποιούμε τον κωδικό κατασκευαστή. Κάθε barcode πρέπει να είναι μοναδικό.") : gap(),
      h2("Περιγραφή και χαρακτηριστικά: τι μπαίνει πού"),
      p("Η «Περιγραφή» είναι ελεύθερο κείμενο για τη σελίδα του προϊόντος (2-4 παράγραφοι): τι κάνει, για ποιον είναι, τι το ξεχωρίζει. Τα τεχνικά χαρακτηριστικά δεν γράφονται εκεί· έχουν δικές τους μπλε στήλες, γιατί από αυτές φτιάχνονται τα φίλτρα και οι συγκρίσεις στο κατάστημα."),

      h1("5. Χαρακτηριστικά ανά κατηγορία"),
      p("Για κάθε κατηγορία, οι μπλε στήλες του φύλλου της. Όσα σημειώνονται ως «Φίλτρο» εμφανίζονται στον πελάτη για να περιορίσει την αναζήτηση: εκεί η ομοιομορφία είναι πολύ σημαντική."),
      bullet([t("Γράψτε την τιμή με τον ίδιο τρόπο σε όλα τα προϊόντα: ", {}), t("«Inverter»", { bold: true }), t(" παντού, όχι μία «Inverter» και μία «Ναι - Inverter».")]),
      bullet([t("Για ναι/όχι γράψτε ", {}), t("Ναι", { bold: true }), t(" ή "), t("Όχι", { bold: true }), t(". Κενό σημαίνει «δεν ξέρω», όχι «Όχι».")]),
      bullet([t("Αριθμοί με τη μονάδα όπως στις προτάσεις, π.χ. ", {}), t("9 kg", { bold: true }), t(", "), t("1400 rpm", { bold: true }), t(", "), t("55\"", { bold: true }), t(".")]),
      bullet("Οι «Προτεινόμενες τιμές» παρακάτω είναι αυτές που ήδη χρησιμοποιούνται στο κατάστημα. Προτιμήστε τες όταν ταιριάζουν."),
    );
    for (const g of ordered) {
      const c = catOf.get(g.s1Id);
      const path = [c?.parent?.parent?.name, c?.parent?.name].filter(Boolean).join(" › ");
      body.push(h2(g.name));
      if (path) body.push(p([t(path, { color: "5B6577", size: 19 })], { after: 80 }));
      if (!g.specs.length) { body.push(p("Η κατηγορία δεν έχει χαρακτηριστικά: συμπληρώστε μόνο τα βασικά στοιχεία.")); continue; }
      body.push(table(["Χαρακτηριστικό", "Φίλτρο", "Προτεινόμενες τιμές"], g.specs.map((d) => {
        const a = auto(d.name);
        if (a) return [[t(d.name, { bold: true, size: 19 })], d.isFilter ? "Ναι" : "", [t(a, { italics: true, color: "5B6577", size: 19 })]];
        const vals = suggest(c?.id, d.name, d.options.map((o) => o.name));
        return [[t(d.name, { bold: true, size: 19 })], d.isFilter ? "Ναι" : "", vals.length ? vals.join(" · ") : "ελεύθερη τιμή"];
      }), [34, 10, 56]));
    }
  }

  if (hasMedia) {
    body.push(
      h1(`${secMedia}. Φωτογραφίες, banners και βίντεο`),
      p(`Στο excel πολυμέσων κάθε γραμμή είναι ένα προϊόν, με έως ${IMAGES} φωτογραφίες, ${BANNERS} banners και ${VIDEOS} βίντεο. Σε κάθε κελί γράφετε μια διεύθυνση (link), όχι την ίδια την εικόνα.`),
      h3("Πώς βρίσκουμε το προϊόν"),
      bullet("Υπάρχοντα: από το MTRL ή τον «Κωδικό είδους» (είναι ήδη συμπληρωμένα)."),
      bullet("Νέα προϊόντα: αφήστε κενό το MTRL και γράψτε Barcode (EAN) ή κωδικό κατασκευαστή."),
      h3("Φωτογραφίες"),
      table(["Απαίτηση", "Τι σημαίνει"], [
        ["Μορφή", "JPG, PNG ή WebP"], ["Μέγεθος", "τουλάχιστον 800 px στη μικρή πλευρά, ιδανικά 1500-2500 px"], ["Φόντο", "λευκό ή διάφανο για την κύρια φωτογραφία"],
        ["Σειρά", "η στήλη «Φωτογραφία 1 (κύρια)» είναι η πρώτη που βλέπει ο πελάτης· οι υπόλοιπες με τη σειρά των στηλών"], ["Περιεχόμενο", "χωρίς υδατογράφημα (watermark), χωρίς τιμές ή κείμενα προσφορών"],
        ["Διεύθυνση", "δημόσιο link https που ανοίγει απευθείας την εικόνα (όχι σελίδα Google Drive / Dropbox με κουμπί λήψης)"],
      ], [26, 74]),
      tip("Πώς ελέγχετε ένα link:", "ανοίξτε το σε ιδιωτικό παράθυρο του browser. Πρέπει να εμφανιστεί αμέσως η εικόνα, χωρίς σύνδεση και χωρίς ενδιάμεση σελίδα."),
      h3("Banners"),
      p("Εικόνες του κατασκευαστή με κείμενο και γραφικά για τη σελίδα του προϊόντος (π.χ. «Τεχνολογία EcoBubble»). Ίδιοι κανόνες με τις φωτογραφίες, χωρίς απαίτηση για λευκό φόντο."),
      h3("Βίντεο"),
      p("Σύνδεσμος YouTube ή Vimeo, ή διεύθυνση αρχείου .mp4 (https). Ένα βίντεο ανά κελί."),
    );
  }

  body.push(
    h1(`${secErrors}. Συχνά λάθη`),
    table(["Λάθος", "Σωστό"], [
      ["Διαστάσεις σε χιλιοστά (600 × 850 × 550)", "Σε εκατοστά: 60 · 85 · 55"],
      ["Μονάδα μέσα στο κελί αριθμού («68 kg»)", "Μόνο ο αριθμός: 68"],
      ["Χαρακτηριστικά μέσα στην «Περιγραφή»", "Στις μπλε στήλες της κατηγορίας"],
      ["Διαφορετική γραφή της ίδιας τιμής («WiFi», «Wi-Fi», «wifi»)", "Μία γραφή παντού, όπως στις προτεινόμενες τιμές"],
      ["Barcode με λιγότερα ψηφία ή ως 8,80609E+12", "Όλα τα 13 ψηφία. Αν το excel το δείχνει έτσι, ορίστε τη στήλη ως «Κείμενο»"],
      ["Νέα στήλη ή μετονομασμένο φύλλο", "Μόνο οι στήλες και τα φύλλα που υπάρχουν"],
      ["Link σε φάκελο ή σελίδα κοινής χρήσης", "Link που ανοίγει απευθείας το αρχείο εικόνας"],
    ], [50, 50]),

    h1(`${secCheck}. Έλεγχος πριν την αποστολή`),
    check("Κάθε προϊόν έχει «Όνομα»."),
    ...(kinds.includes("new") ? [check("Κάθε νέο προϊόν έχει μοναδικό barcode 13 ψηφίων.")] : []),
    ...(kinds.includes("existing") ? [check("Δεν άλλαξα MTRL ή «Κωδικό είδους» (γκρι στήλες).")] : []),
    check("Διαστάσεις σε εκατοστά, βάρος σε κιλά, εγγύηση σε μήνες, μόνο αριθμοί."),
    check("Τα χαρακτηριστικά-φίλτρα έχουν την ίδια γραφή σε όλα τα προϊόντα."),
    check("Δεν πρόσθεσα, δεν έσβησα και δεν μετονόμασα στήλες ή φύλλα."),
    ...(hasMedia ? [check("Κάθε link εικόνας ανοίγει απευθείας την εικόνα σε ιδιωτικό παράθυρο.")] : []),
    check("Αποθήκευσα ως .xlsx με το ίδιο όνομα αρχείου."),

    h1(`${secSend}. Αποστολή`),
    p("Στείλτε τα συμπληρωμένα excel στον υπεύθυνο της Euronics που σας έστειλε το πακέτο. Δεν χρειάζεται να επιστρέψετε αυτό το έγγραφο. Αν κάτι δεν είναι σαφές ή μια κατηγορία δεν ταιριάζει στα προϊόντα σας, γράψτε το στο μήνυμά σας: θα το διορθώσουμε πριν την εισαγωγή."),
    tip("Μετά την αποστολή:", "ελέγχουμε τα αρχεία αυτόματα πριν περάσει οτιδήποτε στο κατάστημα. Αν βρεθούν λάθη, θα σας στείλουμε τις γραμμές που θέλουν διόρθωση."),
  );

  const doc = new Document({
    creator: "Euronics", title: `Οδηγίες συμπλήρωσης - ${brand.name}`, description: "Οδηγίες για τα templates προμηθευτών",
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 300 } }, run: { bold: true, color: BLUE } } }] },
    ] },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t(`Euronics · Οδηγίες συμπλήρωσης · ${brand.name}`, { color: "8A93A6", size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Σελίδα ", PageNumber.CURRENT, " από ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "8A93A6" })] })] }) },
      children: body,
    }],
  });
  const buffer = Buffer.from(await Packer.toBuffer(doc));
  return { buffer, filename: `Οδηγίες συμπλήρωσης - ${brand.name.replace(/[\\/:*?"<>|]+/g, " ").trim()}.docx` };
}
