import Link from "next/link";
import { requireStaff } from "@/lib/rbac/guard";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  await requireStaff();
  const { need } = await searchParams;
  return (
    <div className="rounded-2xl bg-white border border-eu-line p-8 max-w-[560px]">
      <div className="font-extrabold text-eu-red text-[length:var(--fs-13)] tracking-wide uppercase">Χωρίς δικαίωμα</div>
      <h2 className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">Ο ρόλος σου δεν έχει πρόσβαση εδώ</h2>
      <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)]">
        {need === "super-admin" ? "Η ενότητα είναι διαθέσιμη μόνο στον Super Admin." : <>Απαιτείται το δικαίωμα <code className="rounded bg-eu-surface px-1.5 py-0.5 font-bold text-eu-ink">{need}</code>. Ζήτησέ το από διαχειριστή.</>}
      </p>
      <Link href="/admin" className="inline-flex mt-4 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 items-center hover:bg-eu-blue">
        Πίσω στο dashboard
      </Link>
    </div>
  );
}
