/**
 * Video οδηγών της διαχείρισης: γυρίζει σύντομες «ξεναγήσεις» (με λεζάντες) σε πραγματικές οθόνες και τις αποθηκεύει στο
 * help-shots/video (mp4 + εικόνα εξωφύλλου). Ίδιο Chrome και ίδιο προφίλ με το help:shots (.help-profile — συνδέεσαι ΕΣΥ μία φορά).
 * Οι ξεναγήσεις ανοίγουν ρυθμίσεις και αλλάζουν επιλογές ΜΟΝΟ σε οθόνες που δεν αποθηκεύουν μόνες τους· ποτέ «Αποθήκευση» / «Δημοσίευση».
 *
 *   npm run help:videos                 όλες
 *   npm run help:videos -- banner-posts μόνο αυτή
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

const BASE = process.env.HELP_BASE ?? "http://localhost:3111";
const PROFILE = join(process.cwd(), ".help-profile");
const OUT = join(process.cwd(), "help-shots", "video");
// Το Chrome σε headless γράφει τη σελίδα χωρίς τα κάτω 144px (μένει γκρι λωρίδα). Γι' αυτό η σελίδα στήνεται 144px ψηλότερη,
// το video κόβεται στα 1280×720 και η λεζάντα κάθεται πάνω από το σημείο κοπής.
const CUT = 144;
const SIZE = { width: 1280, height: 720 + CUT };

type Say = (text: string, ms?: number) => Promise<void>;
type Tour = { name: string; run: (page: Page, say: Say) => Promise<void> };

/** Κλικ σε κουμπί/σύνδεσμο με αυτό το κείμενο, με ορατό «δαχτυλίδι» πριν το κλικ· αν δεν βρεθεί, η ξενάγηση συνεχίζει. */
async function tap(page: Page, text: string | RegExp, opts: { role?: "button" | "link" | "tab"; exact?: boolean; nth?: number } = {}) {
  const loc = (opts.role ? page.getByRole(opts.role, { name: text, exact: opts.exact }) : page.getByText(text, { exact: opts.exact })).nth(opts.nth ?? 0);
  try {
    await loc.evaluate((el) => el.scrollIntoView({ block: "center" }), undefined, { timeout: 4000 });
    const box = await loc.boundingBox();
    if (box) await page.evaluate(([x, y]) => { const r = document.createElement("div"); r.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;border:4px solid #f1c400;box-shadow:0 0 0 6px rgba(241,196,0,.3);z-index:2147483646;pointer-events:none`; document.body.appendChild(r); setTimeout(() => r.remove(), 900); }, [box.x + box.width / 2, box.y + box.height / 2]);
    await page.waitForTimeout(650);
    await loc.click({ timeout: 4000 });
    await page.waitForTimeout(900);
    return true;
  } catch (e) { console.log(`   · δεν βρέθηκε: ${text} — ${e instanceof Error ? e.message.split("\n").slice(0, 6).join(" | ").slice(0, 400) : e}`); return false; }
}
const scroll = async (page: Page, y: number) => { await page.mouse.wheel(0, y); await page.waitForTimeout(900); };

const TOURS: Tour[] = [
  { name: "banners-lista", run: async (page, say) => {
    await page.goto(`${BASE}/admin/prosfores/theseis`, { waitUntil: "networkidle" });
    await say("Τα banners βρίσκονται στο μενού: Προσφορές & υπηρεσίες → Banners.", 3500);
    await say("Κάθε πλαίσιο είναι μια θέση του site: αρχική, σελίδα προσφορών, λίστες κατηγοριών, σελίδα προϊόντος, καλάθι.", 4500);
    await scroll(page, 500);
    await say("Μέσα σε κάθε θέση βλέπεις τα banners της, αν είναι ενεργά, και πόσες εμφανίσεις και κλικ έχουν.", 4500);
    await scroll(page, 600);
    await say("«+ Banner» φτιάχνει νέο στη θέση αυτή. Το μολύβι ανοίγει ένα υπάρχον για αλλαγές.", 4500);
    await scroll(page, -1100);
  } },
  { name: "banner-posts", run: async (page, say) => {
    await page.goto(`${BASE}/admin/prosfores/theseis`, { waitUntil: "networkidle" });
    const href = await page.locator('a[href*="/admin/prosfores/theseis/c"]').evaluateAll((as) => (as.find((a) => /βάθρο/i.test(a.closest("li")?.textContent ?? "")) ?? as[0])?.getAttribute("href"));
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await say("Ο editor ενός banner: αριστερά οι ρυθμίσεις, δεξιά το banner όπως θα το δει ο πελάτης.", 4000);
    await tap(page, "Προϊόντα", { role: "tab", exact: true });
    await say("Στα «Προϊόντα» διαλέγεις διάταξη: λωρίδα ή τετράγωνα post, ένα ανά προϊόν.", 4000);
    await tap(page, "Λευκή κάρτα", { role: "button" });
    await say("Τέσσερα στυλ τετραγώνου. Εδώ η «Λευκή κάρτα»…", 3000);
    await tap(page, "Ζώνη τιμής", { role: "button" });
    await say("…η «Ζώνη τιμής», όταν η τιμή είναι το μήνυμα…", 3000);
    await tap(page, "Βάθρο", { role: "button" });
    await say("…και το «Βάθρο», όπως στα φυλλάδια.", 3000);
    await tap(page, "Αστέρι", { role: "button" });
    await say("«Σχήμα τιμής»: η τιμή μπαίνει μέσα σε αστέρι, σφραγίδα, κύκλο ή εξάγωνο.", 4000);
    await tap(page, "Η τιμή ανασαίνει", { role: "button" });
    await say("«Κίνηση στο τετράγωνο»: το προϊόν αιωρείται, η τιμή ανασαίνει ή περνά μια λάμψη.", 4000);
    await say("Τίποτα δεν αλλάζει στο site μέχρι να πατήσεις «Αποθήκευση».", 3500);
  } },
  { name: "banner-fonto-keimeno", run: async (page, say) => {
    await page.goto(`${BASE}/admin/prosfores/theseis`, { waitUntil: "networkidle" });
    const href = await page.locator('a[href*="/admin/prosfores/theseis/c"]').evaluateAll((as) => (as.find((a) => /βάθρο/i.test(a.closest("li")?.textContent ?? "")) ?? as[0])?.getAttribute("href"));
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await tap(page, "Κείμενο", { role: "tab", exact: true });
    await say("«Κείμενο»: σήμα καμπάνιας, μικρός τίτλος, τίτλος, κείμενο και το κουμπί.", 4000);
    await scroll(page, 400);
    await say("Εδώ διαλέγεις και sticker από τη συλλογή — μπαίνει στη γωνία ή σε κάθε τετράγωνο.", 4000);
    await scroll(page, -400);
    await tap(page, "Φόντο", { role: "tab", exact: true });
    await say("«Φόντο»: έτοιμοι συνδυασμοί χρωμάτων με ένα κλικ.", 3500);
    await tap(page, "Κίτρινο με ακτίνες", { role: "button" });
    await say("Π.χ. «Κίτρινο με ακτίνες»…", 3000);
    await tap(page, "Σκούρο με προβολέα", { role: "button" });
    await say("…ή «Σκούρο με προβολέα». Από κάτω: δικά σου χρώματα, κίνηση φόντου, εικόνα ή video.", 4500);
    await tap(page, "Πού και πότε", { role: "tab" });
    await say("«Πού και πότε»: θέση, ημερομηνίες, προσφορά και σύνδεσμος του banner.", 4000);
  } },
  { name: "zones-selides", run: async (page, say) => {
    await page.goto(`${BASE}/admin/cms/pages`, { waitUntil: "networkidle" });
    await say("Ζώνες σελίδων: κάθε πληροφοριακή σελίδα έχει ζώνες όπου βάζεις components.", 4000);
    await scroll(page, 400);
    await say("Το μικρό σχέδιο σε κάθε κάρτα δείχνει ποιες ζώνες έχει η σελίδα και πόσα components.", 4000);
    await scroll(page, -400);
    const href = await page.locator('a[href*="/admin/cms/pages/"]').first().getAttribute("href");
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await say("Αριστερά ο χάρτης της σελίδας: σταθερά μέρη με λουκέτο και οι ζώνες με τα components τους.", 4500);
    await say("Δεξιά η ζωντανή προεπισκόπηση. Σέρνεις μια γραμμή για να αλλάξεις σειρά.", 4000);
    await tap(page, /Προσθήκη στη ζώνη/, { role: "button" });
    await say("«Προσθήκη»: διαλέγεις component από τη συλλογή — banner, προϊόντα προσφοράς, κουπόνι, κείμενο…", 5000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    await say("Πατώντας ένα component ανοίγουν οι ρυθμίσεις του: φόντο, χρώμα γραμμάτων, χρώματα ανά στοιχείο.", 4500);
  } },
  { name: "zones-arxiki", run: async (page, say) => {
    await page.goto(`${BASE}/admin/cms/home`, { waitUntil: "networkidle" });
    await say("Ζώνες αρχικής: οι ενότητες της αρχικής σελίδας, με τη σειρά που εμφανίζονται.", 4000);
    await say("Κάθε ενότητα κρύβεται, μετακινείται ή παίρνει ημερομηνίες. Ανάμεσά τους μπαίνουν components.", 4500);
    await page.locator('button[aria-label*="Άνοιγμα ρυθμίσεων"]').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await say("Στα «Κεντρικά slides» ορίζεις χρώμα φόντου, έμφασης, τίτλου και κειμένου, και το σήμα της καμπάνιας.", 5000);
    await scroll(page, 400);
    await say("Όλα μένουν πρόχειρα. Στο site περνούν μόνο όταν πατήσεις «Δημοσίευση».", 4500);
  } },
  { name: "kampanies", run: async (page, say) => {
    await page.goto(`${BASE}/admin/prosfores/kampanies`, { waitUntil: "networkidle" });
    await say("Καμπάνιες: ένας φάκελος που μαζεύει προσφορές, κουπόνια, banners, landing page και newsletter.", 4500);
    await say("Πάνω φιλτράρεις ανά κατάσταση: σε εξέλιξη, προγραμματισμένες, πρόχειρες, σε παύση, όσες έληξαν.", 4500);
    const href = await page.locator('a[href*="/admin/prosfores/kampanies/c"]').first().getAttribute("href");
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await say("Μια καμπάνια στήνεται σε πέντε βήματα. Πρώτο: «Στόχος & ημερομηνίες».", 4000);
    await scroll(page, 380);
    await say("Ο στόχος ορίζει τι θα μετρηθεί. Η «Λήξη» οδηγεί κάθε αντίστροφη μέτρηση στο site.", 4500);
    await scroll(page, -380);
    await tap(page, /Budget/, { role: "button" });
    await say("«Budget»: πόσα σκοπεύεις να δώσεις σε εκπτώσεις, για να φαίνεται αν ξεφεύγεις.", 4500);
    await tap(page, /Περιεχόμενα/, { role: "button" });
    await say("«Περιεχόμενα»: οι προσφορές, οι landing pages και τα banners της καμπάνιας.", 4500);
    await scroll(page, 420);
    await say("Φτιάχνεις νέα προσφορά μέσα στην καμπάνια ή προσθέτεις μια υπάρχουσα. Το Χ τη βγάζει από τον φάκελο.", 4500);
    await scroll(page, -420);
    await tap(page, /Προβολή/, { role: "button" });
    await say("«Προβολή»: η landing page και κάθε θέση banner, με εμφανίσεις και κλικ.", 4500);
    await tap(page, /Έλεγχος & δημοσίευση/, { role: "button" });
    await say("«Έλεγχος & δημοσίευση»: τι λείπει και, όσο είναι πρόχειρη, η δημοσίευση όλων μαζί.", 4500);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
    await page.waitForTimeout(1200);
    await say("Κάτω-κάτω: «Παύση», «Λήξη τώρα» και «Αρχείο». Προσφορές και banners ακολουθούν την καμπάνια.", 5000);
  } },
];

async function main() {
  const only = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  for (const t of TOURS.filter((x) => !only.length || only.includes(x.name))) {
    const tmp = join(OUT, `.tmp-${t.name}`);
    rmSync(tmp, { recursive: true, force: true });
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: true, viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style"); s.textContent = "[data-private]{filter:blur(7px)!important}nextjs-portal{display:none!important}#help-cap{position:fixed;left:50%;bottom:168px;transform:translateX(-50%);max-width:min(900px,86vw);background:rgba(11,16,32,.94);color:#fff;font:700 21px/1.35 system-ui,sans-serif;padding:14px 22px;border-radius:16px;z-index:2147483647;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35);border-left:6px solid #f1c400;pointer-events:none}"; document.head.appendChild(s);
      });
    });
    const say: Say = async (text, ms = 3500) => {
      await page.evaluate((x) => { let c = document.getElementById("help-cap"); if (!c) { c = document.createElement("div"); c.id = "help-cap"; document.body.appendChild(c); } c.textContent = x; }, text);
      await page.waitForTimeout(ms);
    };
    try {
      await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      if (page.url().includes("/admin/login")) throw new Error("Δεν είσαι συνδεδεμένος στο .help-profile — τρέξε πρώτα «npm run help:shots» και συνδέσου.");
      await t.run(page, say);
    } catch (e) { console.log(`✗ ${t.name}: ${e instanceof Error ? e.message.split("\n")[0] : e}`); }
    await ctx.close();
    const webm = readdirSync(tmp).filter((f) => f.endsWith(".webm")).map((f) => join(tmp, f));
    if (webm.length) {
      // η εγγραφή ξεκινά με το άνοιγμα του browser: κόβονται τα πρώτα δευτερόλεπτα της φόρτωσης
      const src = webm.sort((a, b) => b.length - a.length)[0];
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2.5", "-i", src, "-an", "-vf", `crop=${SIZE.width}:${SIZE.height - CUT}:0:0`, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "20", join(OUT, `${t.name}.mp4`)]);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "5", "-i", join(OUT, `${t.name}.mp4`), "-frames:v", "1", "-q:v", "5", join(OUT, `${t.name}.jpg`)]);
      console.log(`✓ ${t.name}`);
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}
main().then(() => process.exit(0));
