/**
 * Import member stores from euronics.gr into the Store table.
 * Run: npx tsx prisma/seed-stores.ts [--offline prisma/data/stores.json]
 * Online run also refreshes prisma/data/stores.json (snapshot for offline seeds).
 */
import { writeFile, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { fetchLiveStores, upsertStores, type ImportedStore } from "../lib/stores/import";

const db = new PrismaClient();
async function main() {
  const offline = process.argv.indexOf("--offline");
  let list: ImportedStore[];
  if (offline > -1) list = JSON.parse(await readFile(process.argv[offline + 1] ?? "prisma/data/stores.json", "utf8"));
  else {
    list = await fetchLiveStores();
    await writeFile("prisma/data/stores.json", JSON.stringify(list, null, 1), "utf8");
  }
  const r = await upsertStores(list, { overwriteContact: process.argv.includes("--overwrite") });
  console.log(`stores: ${r.total} parsed, ${r.created} created, ${r.updated} updated, ${r.noCoords} without coordinates`);
}
main().finally(() => db.$disconnect());
