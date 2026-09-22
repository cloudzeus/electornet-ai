import "dotenv/config";
import { db } from "@/lib/db";
import { smartAdvisor } from "@/lib/advisor/engine";
import { defaultSettings } from "@/lib/cms/settings";
async function main() {
  const ctx = { name: "Ερμής", commerce: defaultSettings.site.commerce };
  const turns = ["θέλω κλιματιστικό για σαλόνι 30 τετραγωνικά", "ναι inverter, να είναι οικονομικό στο ρεύμα", "από αυτά ποιο είναι πιο αθόρυβο;", "και το toyotomi που είδα πιο πριν;"];
  let prev: string | undefined;
  for (const q of turns) {
    const a = await smartAdvisor({ q, prev }, ctx);
    console.log(`\n>>> ${q}\n    κατάλαβε: ${a?.understood.join(" · ")}\n    ${a?.text}`);
    for (const p of a?.products ?? []) console.log(`    • ${p.brand} ${p.title.slice(0, 55)} — ${p.price} € — ${p.why}`);
    prev = q;
  }
  const f = await db.facet.findMany({ where: { category: { name: "Κλιματιστικά Inverter" }, productCount: { gt: 0 } }, select: { label: true, productCount: true, valueCount: true } });
  console.log("\nΦΙΛΤΡΑ:", f.map((x) => `${x.label} [${x.productCount}/${x.valueCount}]`).join(" · "));
  await db.$disconnect();
}
main();
