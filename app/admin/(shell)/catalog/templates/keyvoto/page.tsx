import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { brandOptions, categoryOptions, markOptions, unitOptions } from "@/lib/catalog/foreign-import/options";
import { supplierCards } from "@/lib/catalog/xml-import/suppliers";
import { getKeyvotoConfig } from "@/lib/keyvoto/client";
import { getSettings } from "@/lib/cms/settings-server";
import { XmlImportWizard } from "@/components/admin/catalog/xml/XmlImportWizard";
import { KeyvotoExplorer } from "@/components/admin/catalog/keyvoto/KeyvotoExplorer";

export const metadata = { title: "Keyvoto PIM" };
export const dynamic = "force-dynamic";

/**
 * Μαζική εισαγωγή προϊόντων από το Keyvoto (PIM των προμηθευτών), σε τέσσερα βήματα: πηγή (προμηθευτής + εκδότης) → τι ήρθε
 * (σύνοψη και ερωτήσεις) → έλεγχος και εισαγωγή → δημοσίευση. Μοιράζεται τη μηχανή των XML feeds, αλλά η αντιστοίχιση
 * πεδίων είναι έτοιμη (το έγγραφο του Keyvoto έχει σταθερή δομή) και μένει πίσω από το «Δες και άλλαξε όλα τα πεδία».
 */
export default async function KeyvotoPage() {
  const user = await requirePermission("catalog.products.write");
  const [cards, brands, categories, units, marks, writeOn, cfg, settings] = await Promise.all([
    supplierCards("", 60, "keyvoto"),
    brandOptions(),
    categoryOptions(),
    unitOptions(),
    markOptions(),
    itemWriteEnabled(),
    getKeyvotoConfig(),
    getSettings(),
  ]);
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates &amp; excel</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Boxes className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Keyvoto PIM</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Οι προμηθευτές δημοσιεύουν στο Keyvoto το περιεχόμενο των προϊόντων τους — περιγραφές, χαρακτηριστικά, φωτογραφίες — και μας το μοιράζονται. Διάλεξε προμηθευτή και εκδότη και πάτα «Φέρε τα προϊόντα»: βλέπεις τι ήρθε, απαντάς μόνο σε ό,τι χρειάζεται εσένα, ελέγχεις τη λίστα και δημοσιεύεις.</p>
      </div>
      {!cfg ? (
        <div className="rounded-xl border border-eu-line bg-white p-3 grid gap-3 min-w-0">
          <p className="m-0 text-eu-ink text-[length:var(--fs-14)]">Δεν υπάρχουν ακόμη στοιχεία σύνδεσης. Η Keyvoto δίνει <b>client_id</b>, <b>client_secret</b> και το <b>Business Account Id</b> του καταστήματος· μπαίνουν μία φορά στις ρυθμίσεις.</p>
          <Link href="/admin/settings/keyvoto" className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg px-4 bg-eu-blue text-white font-bold text-[length:var(--fs-14)] w-fit">Ρυθμίσεις Keyvoto</Link>
        </div>
      ) : (
        <>
          <XmlImportWizard
            source="keyvoto"
            suppliers={cards}
            brands={brands.map(({ id, name, s1 }) => ({ id, name, s1 }))}
            categories={categories.map(({ id, path }) => ({ id, name: path }))}
            units={units.map(({ id, name }) => ({ id, name }))}
            marks={marks.map(({ id, name }) => ({ id, name }))}
            writeOn={writeOn}
            settings={settings}
            canErp={can(user.permissions, "catalog.sync.run")}
          />
          <details data-help="keyvoto.explore" className="rounded-xl border border-dashed border-eu-line-2 p-3 min-w-0">
            <summary className="font-bold text-eu-ink text-[length:var(--fs-15)] cursor-pointer min-h-11 flex items-center">Δες τι στέλνει ένας εκδότης (δείγμα, χωρίς εισαγωγή)</summary>
            <div className="pt-3"><KeyvotoExplorer configured enabled={cfg.enabled} account={cfg.businessAccountId} /></div>
          </details>
        </>
      )}
    </div>
  );
}
