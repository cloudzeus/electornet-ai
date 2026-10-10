/**
 * Παράγει το lib/help/generated.json — τρέχει σε κάθε αλλαγή της διαχείρισης (`npm run help:gen`):
 *   σελίδες (app/admin/(shell)/**​/page.tsx) → τίτλος, περιγραφή (το σχόλιο πάνω από το export default), δικαίωμα,
 *   θέση στο μενού · σημεία βοήθειας (data-help="…") σε όλο τον κώδικα · ιστορικό αλλαγών από το git · screenshots.
 * Στο τέλος αναφέρει τι λείπει: σελίδες χωρίς γραμμένο οδηγό, σημεία χωρίς περιγραφή, περιγραφές χωρίς σημείο.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ADMIN_NAV } from "../components/admin/nav";
import { HELP_PAGES } from "../lib/help/content";
import { routeSlug, type GenChange, type GenRoute, type Generated } from "../lib/help/types";

const ROOT = process.cwd();
const SHELL = "app/admin/(shell)";
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".next", ".git"].includes(f)) walk(p, out); }
    else out.push(p);
  }
  return out;
};

// 1) σελίδες
const pages = walk(join(ROOT, SHELL)).filter((f) => f.endsWith("/page.tsx")).map((f) => relative(ROOT, f));
const routeOf = (file: string) => `/admin${file.slice(SHELL.length).replace(/\/page\.tsx$/, "")}` || "/admin";
const navItems = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ group: g.label, label: i.label, href: i.href })));

// 2) σημεία βοήθειας σε όλο τον κώδικα
const helpKeys: Record<string, string[]> = {};
for (const f of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].filter((x) => /\.tsx?$/.test(x))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:data-help|help-key)="([a-z0-9.-]+)"/g)) (helpKeys[m[1]] ??= []).includes(relative(ROOT, f)) || helpKeys[m[1]].push(relative(ROOT, f));
}

// 3) ιστορικό αλλαγών από το git (αν υπάρχει)
type Commit = { hash: string; date: string; text: string; files: string[] };
let commits: Commit[] = [];
try {
  const raw = execFileSync("git", ["log", "-n", "600", "--name-only", "--pretty=format:@@%h|%aI|%s"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  commits = raw.split("@@").filter(Boolean).map((chunk) => {
    const [head, ...files] = chunk.trim().split("\n");
    const [hash, date, ...subj] = head.split("|");
    const text = subj.join("|");
    // πρώτη πρόταση/ενότητα του μηνύματος, σύντομη
    const short = text.split(/ · |· | — /)[0].replace(/:\s*$/, "");
    return { hash, date, text: short.length > 220 ? `${short.slice(0, 217)}…` : short, files: files.map((x) => x.trim()).filter(Boolean) };
  });
} catch { console.warn("· χωρίς git: το ιστορικό αλλαγών μένει κενό"); }

const routes: GenRoute[] = pages.map((file) => {
  const route = routeOf(file);
  const src = readFileSync(file, "utf8");
  const title = src.match(/metadata\s*=\s*\{\s*title:\s*"([^"]+)"/)?.[1] ?? navItems.find((n) => n.href === route)?.label ?? route.split("/").pop()!;
  // το σχόλιο ακριβώς πάνω από το export default (όχι κάποιο προηγούμενο)
  const docRaw = src.match(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(?:export const [^\n]*\n\s*)*export default/)?.[1] ?? "";
  const doc = docRaw.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  const perm = /requireSuperAdmin\(/.test(src) ? "super-admin" : src.match(/requirePermission\("([^"]+)"\)/)?.[1] ?? "*";
  const nav = navItems.find((n) => n.href === route) ?? null;
  const dir = file.replace(/page\.tsx$/, "");
  const curated = HELP_PAGES.find((h) => h.route === route);
  // αρχεία της σελίδας: ο φάκελός της (όχι υποσελίδες) + όσα δηλώνει ο οδηγός της
  const subdirs = pages.filter((p) => p !== file && p.startsWith(dir)).map((p) => p.replace(/page\.tsx$/, ""));
  const mine = (f: string) => (f.startsWith(dir) && !subdirs.some((s) => f.startsWith(s))) || (curated?.files ?? []).some((x) => f === x || f.startsWith(x));
  const changes: GenChange[] = commits.filter((c) => c.files.some(mine)).slice(0, 10).map(({ hash, date, text }) => ({ hash, date, text }));
  const slug = routeSlug(route);
  const shot = (k: string) => (existsSync(join(ROOT, "public/help/shots", `${slug}-${k}.jpg`)) ? `/help/shots/${slug}-${k}.jpg` : undefined);
  const keysHere = Object.entries(helpKeys).filter(([, fs]) => fs.some(mine)).map(([k]) => k);
  return { route, slug, file, title, doc, perm, nav: nav && { group: nav.group, label: nav.label }, dynamic: route.includes("["), helpKeys: keysHere, changes, updatedAt: changes[0]?.date ?? null, shots: { desktop: shot("d"), mobile: shot("m") } };
}).filter((r) => r.route !== "/admin/forbidden").sort((a, b) => a.route.localeCompare(b.route));

const touched = (c: Commit) => routes.filter((r) => c.files.some((f) => f.startsWith(r.file.replace(/page\.tsx$/, "")))).map((r) => r.route);
const recent = commits.slice(0, 40).map((c) => ({ hash: c.hash, date: c.date, text: c.text, routes: touched(c) }));

const out: Generated = { generatedAt: new Date().toISOString(), routes, recent, helpKeys };
writeFileSync(join(ROOT, "lib/help/generated.json"), JSON.stringify(out, null, 1) + "\n");

// αναφορά κάλυψης
const described = new Set(HELP_PAGES.flatMap((h) => (h.parts ?? []).map((p) => p.key)));
const noGuide = routes.filter((r) => !r.dynamic && !HELP_PAGES.some((h) => h.route === r.route));
const undocumented = Object.keys(helpKeys).filter((k) => !described.has(k));
const orphan = [...described].filter((k) => !helpKeys[k]);
console.log(`✓ ${routes.length} σελίδες · ${Object.keys(helpKeys).length} σημεία βοήθειας · ${routes.filter((r) => r.shots.desktop).length} με screenshot · ${recent.length} πρόσφατες αλλαγές`);
console.log(`· γραμμένοι οδηγοί: ${HELP_PAGES.length} · σελίδες μόνο με αυτόματο οδηγό: ${noGuide.length}`);
if (undocumented.length) console.log(`! σημεία χωρίς περιγραφή στους οδηγούς: ${undocumented.join(", ")}`);
if (orphan.length) console.log(`! περιγραφές για σημεία που δεν υπάρχουν πια στο UI: ${orphan.join(", ")}`);
