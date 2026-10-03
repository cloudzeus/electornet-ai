"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { defaultCopy, placeholdersOf, type CopyOverrides } from "@/lib/cms/copy";
import { getCopyDoc, publishCopy, revertCopyDraft, saveCopyDraft } from "@/lib/cms/copy-store";

const PERM = "cms.copy.write";
export type CopyIssue = { ns: string; key: string; msg: string };

/** Κρατά μόνο έγκυρες αλλαγές: υπαρκτό κείμενο, όχι ίδιο με το αρχικό, ίδια {placeholders}, λογικό μήκος. */
function clean(input: CopyOverrides): { out: CopyOverrides; issues: CopyIssue[] } {
  const defs = defaultCopy();
  const out: CopyOverrides = {};
  const issues: CopyIssue[] = [];
  for (const [ns, keys] of Object.entries(input ?? {})) {
    if (!defs[ns] || typeof keys !== "object") continue;
    for (const [key, raw] of Object.entries(keys)) {
      if (!(key in defs[ns]) || typeof raw !== "string") continue;
      const v = raw.replace(/\s+$/g, "");
      if (v === defs[ns][key]) continue;
      if (!v.trim()) { issues.push({ ns, key, msg: "Κενό κείμενο — γράψε κάτι ή πάτα «Επαναφορά»." }); continue; }
      if (v.length > 600) { issues.push({ ns, key, msg: "Πάνω από 600 χαρακτήρες." }); continue; }
      const want = placeholdersOf(defs[ns][key]).join(" "), got = placeholdersOf(v).join(" ");
      if (want !== got) { issues.push({ ns, key, msg: `Πρέπει να περιέχει ακριβώς: ${want || "κανένα {…}"} — αυτά αντικαθίστανται αυτόματα (π.χ. όνομα, προϊόν).` }); continue; }
      (out[ns] ??= {})[key] = v;
    }
  }
  return { out, issues };
}

export async function saveCopyAction(overrides: CopyOverrides): Promise<{ ok: boolean; at?: string; issues: CopyIssue[] }> {
  const user = await requirePermission(PERM);
  const { out, issues } = clean(overrides);
  const r = await saveCopyDraft(out, user.id);
  return { ok: true, at: r.updatedAt.toISOString(), issues };
}

export async function publishCopyAction(): Promise<{ ok: boolean; message: string; issues?: CopyIssue[]; published?: CopyOverrides }> {
  const user = await requirePermission(PERM);
  const doc = await getCopyDoc();
  const { out, issues } = clean(doc.draft);
  if (issues.length) return { ok: false, message: "Διόρθωσε τα σημειωμένα κείμενα πριν τη δημοσίευση.", issues };
  await saveCopyDraft(out, user.id);
  await publishCopy(user.id);
  const n = Object.values(out).reduce((a, x) => a + Object.keys(x).length, 0);
  await audit(user.id, "cms.copy.publish", "CmsDocument", "copy/ui", doc.published, out);
  revalidatePath("/", "layout");
  return { ok: true, message: `Δημοσιεύτηκε — ${n} αλλαγμένα κείμενα ισχύουν τώρα στο site (σε λίγα δευτερόλεπτα σε όλους τους servers).`, published: out };
}

export async function revertCopyAction() {
  const user = await requirePermission(PERM);
  await revertCopyDraft(user.id);
  await audit(user.id, "cms.copy.revert", "CmsDocument", "copy/ui", null, null);
  return { ok: true, message: "Το πρόχειρο επέστρεψε στα δημοσιευμένα κείμενα." };
}
