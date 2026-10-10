import { Fragment } from "react";
import { renderZone } from "@/lib/cms/render";
import { getDevice } from "@/lib/device";
import type { RenderContext } from "@/lib/cms/zones";
import { ZonesToggle } from "@/components/site/ZonesToggle";
import { AdSlot } from "@/components/promo/AdSlot";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { getCustomerSession } from "@/lib/account/session";
import { blockActive, type BrandBlock } from "@/lib/cms/brand-store";
import { renderBlock, resolveBlocks } from "@/lib/cms/blocks-render";
import { EURONICS_THEME } from "@/lib/cms/info-pages";
import { BrandFrame } from "@/components/brand/BrandFrame";
import { getHomeDoc, getPublishedHome } from "@/lib/cms/home-store";
import { previewTokenOk, runDueScenarios } from "@/lib/cms/home-plans";
import { afterZone, audienceOk, hideClass, sectionActive, sectionDef, sectionExtras, sectionWidget, TOP_ZONE } from "@/lib/cms/home-sections";

/**
 * Αρχική = οι ενότητες και τα components της διαχείρισης (Περιεχόμενο → Ζώνες αρχικής), όπως ισχύουν για αυτό το
 * αίτημα: ημερομηνίες, κοινό (επισκέπτης / πελάτης), συσκευή (με CSS). Χωρίς δημοσίευση: η προεπιλεγμένη αρχική.
 * ?preview=1: το πρόχειρο, μόνο για προσωπικό με δικαίωμα ζωνών αρχικής · ?pt=<token>: το πρόχειρο μέσω συνδέσμου
 * προεπισκόπησης (λήγει). Προγραμματισμένα σενάρια δημοσιεύονται εδώ στην ώρα τους. Το πλαίσιο (header, footer) είναι στο layout.
 */
/** Οι προεπισκοπήσεις του πρόχειρου δεν ευρετηριάζονται. */
export async function generateMetadata({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  return sp.pt || sp.preview ? { robots: { index: false, follow: false } } : {};
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const [{ device, saveData }, sp, me] = await Promise.all([getDevice(), searchParams, getCustomerSession().catch(() => null)]);
  await runDueScenarios().catch(() => false);
  let doc = await getPublishedHome();
  let preview = false;
  if (previewTokenOk(sp.pt)) { doc = (await getHomeDoc()).draft; preview = true; }
  else if (sp.preview === "1") {
    const user = (await auth())?.user;
    if (user && can(user.permissions, "cms.zones.read")) { doc = (await getHomeDoc()).draft; preview = true; }
  }
  const viewer = me ? "customer" : "guest";
  const now = new Date();
  const ctx: RenderContext = { now, device, audience: viewer, saveData, bucket: 0 };

  const blocks = doc.blocks.filter((b) => blockActive(b, now) && audienceOk(b.audience, viewer));
  const [data, sections] = await Promise.all([
    blocks.length ? resolveBlocks(blocks) : Promise.resolve(null),
    Promise.all(doc.sections.map(async (s) => {
      if (!sectionActive(s, now, viewer)) return { s, el: null };
      if (s.id === "ad-strip") return { s, el: <AdSlot slot="home-strip" className="eu-canvas eu-gutter py-6" /> };
      const w = sectionWidget(s);
      if (!w) return { s, el: null };
      const el = await renderZone({ id: s.id, label: sectionDef(s.id)!.label, slot: "main", widgets: [w, ...sectionExtras(s)] }, ctx);
      return { s, el };
    })),
  ]);
  const zone = (key: string) => {
    const here: BrandBlock[] = blocks.filter((b) => (b.zone ?? TOP_ZONE) === key);
    if (!here.length || !data) return null;
    return <div data-zone={key}><BrandFrame theme={EURONICS_THEME}>{here.map((b) => (preview ? <div key={b.id} data-home-item={`blk:${b.id}`}>{renderBlock(b, data, { brandName: "Euronics" })}</div> : renderBlock(b, data, { brandName: "Euronics" })))}</BrandFrame></div>;
  };
  return (
    <>
      {preview && <div role="status" className="sticky top-0 z-40 bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-14)] px-4 py-2">Προεπισκόπηση πρόχειρου της αρχικής — οι επισκέπτες δεν το βλέπουν</div>}
      <ZonesToggle enabled={sp.zones === "1"} />
      {zone(TOP_ZONE)}
      {sections.map(({ s, el }) => (
        <Fragment key={s.id}>
          {/* προεπισκόπηση: κάθε ενότητα σημαδεμένη, ώστε ο editor να κυλά / τονίζει / επιλέγει με κλικ */}
          {el && (preview ? <div data-home-item={`sec:${s.id}`} className={hideClass(s.hideOn)}>{el}</div> : s.hideOn?.length ? <div className={hideClass(s.hideOn)}>{el}</div> : el)}
          {zone(afterZone(s.id))}
        </Fragment>
      ))}
    </>
  );
}
