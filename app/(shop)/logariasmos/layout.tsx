import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { AccountNav } from "@/components/account/AccountNav";
import { StickySidebar } from "@/components/fluid/StickySidebar";
import { requireCustomer } from "@/lib/account/data";

/** Λογαριασμός: μόνο με σύνδεση (αλλιώς → /syndesi). Πλαϊνό μενού (desktop) / chips (κινητό) με τα στοιχεία του πελάτη. */
export default async function AccountLayout({ children }: LayoutProps<"/logariasmos">) {
  const me = await requireCustomer();
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Ο λογαριασμός μου" }]} />
      <div className="eu-canvas eu-gutter pb-12 grid grid-cols-1 @3xl:grid-cols-[260px_minmax(0,1fr)] gap-6 items-stretch">
        <StickySidebar className="min-w-0">
          <AccountNav name={`${me.firstName} ${me.lastName}`.trim()} email={me.email ?? ""} />
        </StickySidebar>
        <div className="min-w-0 eu-container">{children}</div>
      </div>
    </div>
  );
}
