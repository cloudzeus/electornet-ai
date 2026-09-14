/**
 * Σπέρνει τη διοικητική διαίρεση (Καλλικράτης) από prisma/data/kallikratis.json
 * και δένει τους νομούς του SoftOne (District) με την περιφέρειά τους.
 * Τρέξε: npx tsx --conditions=react-server scripts/seed-regions.ts
 */
import { readFileSync } from "node:fs";
import { db } from "../lib/db";
import { DISTRICTS, nameMatchCandidate, coreName } from "../lib/geo/regions";

interface Row { code: string; nameEL: string; nameEN: string | null; level: number; parentCode: string | null; path: string; latitude: number | null; longitude: number | null }

async function main() {
  const rows: Row[] = JSON.parse(readFileSync("prisma/data/kallikratis.json", "utf8"));
  // γονείς πριν τα παιδιά, ώστε να ισχύει το FK
  for (const level of [3, 4, 5]) {
    const batch = rows.filter((r) => r.level === level);
    for (let i = 0; i < batch.length; i += 200) {
      await Promise.all(batch.slice(i, i + 200).map((r) => db.region.upsert({ where: { code: r.code }, create: r, update: { nameEL: r.nameEL, nameEN: r.nameEN, parentCode: r.parentCode, path: r.path, latitude: r.latitude, longitude: r.longitude } })));
    }
    console.log(`level ${level}: ${batch.length}`);
  }

  // SoftOne νομός → Καλλικράτης περιφέρεια (level 3)
  const l3 = await db.region.findMany({ where: { level: 3 }, select: { code: true, nameEL: true } });
  const l4 = await db.region.findMany({ where: { level: 4 }, select: { code: true, nameEL: true, parentCode: true } });
  let ok = 0; const miss: string[] = [];
  for (const d of DISTRICTS) {
    // πρώτα με την ΠΕ (πιο ειδική), αλλιώς με το όνομα της περιφέρειας
    const unit = nameMatchCandidate(d.name, l4) ?? nameMatchCandidate(d.s1Name, l4);
    const regionCode = unit?.parentCode ?? nameMatchCandidate(d.region, l3)?.code ?? null;
    if (!regionCode) { miss.push(d.name); continue; }
    const r = await db.district.updateMany({ where: { s1Id: String(d.s1) }, data: { regionCode, region: d.region } });
    if (r.count) ok++;
  }
  console.log(`District → Region: ${ok}/${DISTRICTS.length}${miss.length ? ` · χωρίς αντιστοίχιση: ${miss.join(", ")}` : ""}`);
  const byRegion = await db.district.groupBy({ by: ["regionCode"], _count: { _all: true } });
  console.log("νομοί ανά περιφέρεια:", byRegion.filter((b) => b.regionCode).length, "περιφέρειες");
  console.log("δείγμα:", (await db.region.findMany({ where: { level: 5 }, take: 3, select: { code: true, nameEL: true, path: true } })).map((r) => `${r.code} ${r.nameEL} [${r.path}]`).join(" | "));
  await db.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
