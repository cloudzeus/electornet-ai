import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { MediaLibrary } from "@/components/admin/media/MediaLibrary";

export const metadata = { title: "Media" };
export const dynamic = "force-dynamic";

/** Media library page. Same component serves as picker inside CMS forms. */
export default async function MediaPage() {
  const user = await requirePermission("cms.media.read");
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Βιβλιοθήκη</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Media</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Εικόνες, video και αρχεία για όλο το site. Οι εικόνες μετατρέπονται σε WebP με thumbnail και placeholder· τα video παίρνουν poster. Σύρε αρχεία οπουδήποτε για upload, σύρε κάρτες σε φάκελο για μεταφορά.</p>
      </div>
      <MediaLibrary canWrite={can(user.permissions, "cms.media.write")} />
    </>
  );
}
